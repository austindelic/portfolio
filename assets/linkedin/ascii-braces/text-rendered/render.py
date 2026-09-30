"""Render brace silhouettes and ASCII cells from real font files; no generated artwork."""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import math
import os
from pathlib import Path
import zipfile

import numpy as np
from PIL import Image, ImageDraw, ImageFont

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[3]
CONFIG = json.loads((BASE / "config.json").read_text())
ORIGINAL = BASE / "sources/tns-original-6336x1584.png"
if not ORIGINAL.exists():
    ORIGINAL = BASE.parent / "sources/tns-original-6336x1584.png"
BRAND_REGIONS = [(3100, 620, 6200, 1000), (3400, 1240, 6200, 1480)]
L = CONFIG["layout"]
W, H, AW = L["width"], L["height"], L["artworkWidth"]
BLUE = tuple(bytes.fromhex(CONFIG["colour"][1:]))


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def font_path(spec):
    value = os.environ.get(spec.get("pathEnvironment", "")) or spec.get("path")
    if not value:
        raise FileNotFoundError(f'{spec["family"]}: supply its actual font via {spec["pathEnvironment"]}')
    path = Path(value).expanduser()
    path = path if path.is_absolute() else ROOT / path
    if not path.is_file():
        raise FileNotFoundError(f'{spec["family"]}: font file missing: {path}')
    return path


def load_font(path, size):
    return ImageFont.truetype(str(path), round(size), layout_engine=ImageFont.Layout.BASIC)


def text_layout(path):
    family = load_font(path, L["textSize"]).getname()[0].casefold()
    spec = next(s for s in CONFIG["fonts"] if s["expectedFamily"].casefold() in family)
    return {**L, **spec.get("textLayout", {})}


def validate_font(spec, path):
    font = load_font(path, 64)
    actual = font.getname()
    if spec["expectedFamily"].casefold() not in actual[0].casefold():
        raise ValueError(f'Wrong font for {spec["id"]}: {actual}')
    if spec["trial"] and "pixel" not in (actual[0] + " " + actual[1]).casefold():
        raise ValueError(f'Lofi Forest Pixel required, received {actual}')
    missing = font.getmask(chr(0x10FFFF))
    missing_signature = (missing.size, bytes(missing))
    for char in "{}" + CONFIG["glyphs"]:
        mask = font.getmask(char)
        if not any(mask) or (mask.size, bytes(mask)) == missing_signature:
            raise ValueError(f'{spec["family"]} lacks required character {char!r}')
    return {"family": actual[0], "style": actual[1], "sha256": digest(path)}


def braces(path, height_fraction):
    masks = []
    target = H * height_fraction
    for char, cx in [("{", AW * 0.29), ("}", AW * 0.73)]:
        trial = load_font(path, 400)
        box = trial.getbbox(char)
        font = load_font(path, 400 * target / (box[3] - box[1]))
        box = font.getbbox(char)
        glyph = Image.new("L", (box[2] - box[0], box[3] - box[1]))
        ImageDraw.Draw(glyph).text((-box[0], -box[1]), char, font=font, fill=255)
        mask = Image.new("L", (AW, H))
        mask.paste(glyph, (round(cx - glyph.width / 2), round((H - glyph.height) / 2)))
        masks.append(mask)
    return masks


def transformed_masks(path, effect):
    masks = braces(path, 1.35 if effect == "oversized" else 0.72 if effect == "tilted" else L["braceHeight"])
    if effect == "tilted":
        return [m.rotate(-14, Image.Resampling.BICUBIC, center=(AW / 2, H / 2)) for m in masks], []
    if effect == "perspective":
        cx, cy = AW / 2, H / 2
        matrix = np.array([[0.88, 0.20, cx * 0.12 - cy * 0.20],
                           [0.10, 0.82, cy * 0.18 - cx * 0.10], [0, 0, 1]])
        inverse = tuple(np.linalg.inv(matrix)[:2].flatten())
        front = [m.transform((AW, H), Image.Transform.AFFINE, inverse, Image.Resampling.BICUBIC) for m in masks]
        walls = []
        for m in front:
            wall = np.zeros((H, AW), dtype=np.uint8)
            for offset in range(2, 23, 2):
                shifted = m.transform((AW, H), Image.Transform.AFFINE, (1, 0, offset, 0, 1, offset * 0.65))
                wall = np.maximum(wall, np.asarray(shifted))
            wall = np.maximum(wall.astype(np.int16) - np.asarray(m), 0).astype(np.uint8)
            walls.append(Image.fromarray(wall))
        return front, walls
    return masks, []


def fade_at(x, minimum, maximum):
    return 0.2 + 0.8 * float(np.clip((x - minimum) / max(maximum - minimum, 1), 0, 1))


def make_cells(path, effect):
    """Every record is one editable, independently rendered text character."""
    masks, walls = transformed_masks(path, effect)
    arrays = [np.asarray(m) / 255 for m in masks]
    left_box = masks[0].getbbox()
    right_box = masks[1].getbbox()
    if not left_box or not right_box:
        raise ValueError("Font produces an empty brace silhouette")
    boundary = (left_box[2] + right_box[0]) / 2
    layout = text_layout(path)
    cw, ch = layout["cellWidth"], layout["cellHeight"]
    rows, cols = math.ceil(H / ch), math.ceil(AW / cw)
    random = np.random.default_rng(CONFIG["seed"])
    # Precomputed fields keep the closing brace and comparisons independent of missing cells.
    fields = random.random((rows, cols, 7))
    cells, detached = [], []
    ramp = CONFIG["glyphs"]
    for tag, array, multiplier in [("depth", np.asarray(m) / 255, 0.35) for m in walls] + [
        ("opening", arrays[0], 1), ("closing", arrays[1], 1)
    ]:
        for row in range(rows):
            for col in range(cols):
                x, y = (col + 0.5) * cw, (row + 0.5) * ch
                tile = array[int(row * ch):min(H, math.ceil((row + 1) * ch)),
                             int(col * cw):min(AW, math.ceil((col + 1) * cw))]
                coverage = float(tile.mean()) if tile.size else 0
                if coverage < 0.12:
                    continue
                noise = fields[row, col]
                index = min(len(ramp) - 1, int(coverage * (len(ramp) - 4) + noise[0] * 3))
                alpha = multiplier * (0.40 + 0.60 * coverage)
                keep = True
                if effect == "disintegrate" and tag == "opening":
                    fade = fade_at(x, left_box[0], left_box[2])
                    keep = noise[1] < fade
                    alpha *= fade
                    if not keep or noise[2] < (1 - fade) * 0.75:
                        detached.append((x, y, ramp[index], noise, 1 - fade))
                elif effect == "dissolve":
                    outer = np.clip((abs(x - AW / 2) - 75) / 240, 0, 1)
                    keep = noise[1] < 1 - outer * 0.55
                    alpha *= 1 - outer * 0.45
                    if not keep or noise[2] < outer * 0.22:
                        detached.append((x, y, ramp[index], noise, float(outer)))
                elif effect == "trails" and tag == "opening" and noise[2] < 0.30:
                    detached.append((x, y, ramp[index], noise, 0.85))
                if keep:
                    cells.append({"char": ramp[index], "x": round(x, 3), "y": round(y, 3),
                                  "opacity": round(alpha, 4), "part": tag})
    for x, y, char, noise, amount in detached:
        for step in range(1, 4 if effect == "trails" else 3):
            drift = (14 + noise[3] * 140) * amount * step / 2
            px = x - drift if effect != "dissolve" else x + (noise[3] - 0.5) * 110
            py = y + (noise[4] - 0.5) * (15 if effect == "trails" else 70) * step
            opacity = (0.04 + 0.24 * noise[5]) * (1 - step / 4)
            # Disintegration particles can never enter the closing-brace comparison region.
            if 4 < px < (boundary - 8 if effect == "disintegrate" else AW - 8) and 7 < py < H - 7:
                cells.append({"char": char, "x": round(px, 3), "y": round(py, 3),
                              "opacity": round(opacity, 4), "part": "particle"})
    # Paint particles first, so surviving core text retains its clarity.
    cells.sort(key=lambda c: c["part"] != "particle")
    return cells, round(boundary)


def draw_cells(cells, path, scale):
    image = Image.new("RGBA", (W * scale, H * scale))
    draw = ImageDraw.Draw(image)
    font = load_font(path, text_layout(path)["textSize"] * scale)
    top, bottom = font.getbbox("M", anchor="ls")[1::2]
    baseline = -(top + bottom) / 2
    for cell in cells:
        char = cell["char"]
        x = cell["x"] * scale - font.getlength(char) / 2
        y = cell["y"] * scale + baseline
        draw.text((x, y), char, font=font, anchor="ls", fill=BLUE + (round(255 * cell["opacity"]),))
    # Enforce a clear gutter before the wordmark, even for perspective sidewalls.
    image.paste((0, 0, 0, 0), (AW * scale, 0, W * scale, H * scale))
    return image


def branding_plate(scale):
    with Image.open(ORIGINAL) as source:
        source.load()
        plate = Image.new("RGB", source.size, "white")
        for box in BRAND_REGIONS:
            plate.paste(source.crop(box), box[:2])
    return plate if scale == 4 else plate.resize((W, H), Image.Resampling.LANCZOS)


def banner(cells, path, scale):
    image = Image.new("RGBA", (W * scale, H * scale), "white")
    image.alpha_composite(draw_cells(cells, path, scale))
    image = image.convert("RGB")
    plate = branding_plate(scale)
    start = round(W * 0.485) * scale
    image.paste(plate.crop((start, 0, W * scale, H * scale)), (start, 0))
    return image


def svg_text(cells, spec, path):
    text_size = text_layout(path)["textSize"]
    font = load_font(path, text_size)
    top, bottom = font.getbbox("M", anchor="ls")[1::2]
    baseline = -(top + bottom) / 2
    nodes = []
    for cell in cells:
        x = cell["x"] - font.getlength(cell["char"]) / 2
        nodes.append(f'<text x="{x:.3f}" y="{cell["y"] + baseline:.3f}" opacity="{cell["opacity"]:.4f}">{html.escape(cell["char"])}</text>')
    family = html.escape(spec["family"], quote=True)
    actual_family, actual_style = font.getname()
    full_name = html.escape(f"{actual_family} {actual_style}", quote=True)
    # Reference the exact face, including the non-CSS Pixel style of the trial font.
    face = f'@font-face{{font-family:TNSArtwork;src:local("{full_name}");font-weight:400;}}'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="6336" height="1584" viewBox="0 0 {W} {H}">'
            f'<title>{family} — actual ASCII text artwork</title><defs><style>{face}</style><clipPath id="art"><rect width="{AW}" height="{H}"/></clipPath></defs>'
            f'<g clip-path="url(#art)" fill="{CONFIG["colour"]}" font-family="TNSArtwork, &quot;{full_name}&quot;" font-size="{text_size}" font-weight="400">'
            + "".join(nodes) + '</g></svg>\n')


def comparison(files, target, title):
    width = 1584
    image = Image.new("RGB", (width + 80, 90 + len(files) * 460), "white")
    draw = ImageDraw.Draw(image)
    label_font = load_font(Path("/System/Library/Fonts/Menlo.ttc"), 24)
    draw.text((40, 25), title, font=label_font, fill=BLUE)
    for i, (label, file) in enumerate(files):
        y = 80 + i * 460
        draw.rectangle((40, y, width + 40, y + 48), fill="#f1f4ff")
        draw.text((60, y + 10), label.upper(), font=label_font, fill="#191919")
        with Image.open(file) as preview:
            image.paste(preview, (40, y + 48))
    image.save(target)


def package(folder, files):
    archive = BASE / ("lofi-forest-private-previews.zip" if folder == "trial-previews" else "tns-real-text-banners.zip")
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for file in files:
            zip_file.write(file, file.relative_to(BASE))
        zip_file.write(ORIGINAL, "sources/tns-original-6336x1584.png")
    with zipfile.ZipFile(archive) as zip_file:
        assert zip_file.testzip() is None
        for file in files:
            assert zip_file.read(str(file.relative_to(BASE))) == file.read_bytes()
        assert zip_file.read("sources/tns-original-6336x1584.png") == ORIGINAL.read_bytes()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--font", action="append", choices=[s["id"] for s in CONFIG["fonts"]])
    args = parser.parse_args()
    selected = [s for s in CONFIG["fonts"] if not args.font or s["id"] in args.font]
    original_hash = digest(ORIGINAL)
    report = {"renderer": "Pillow/NumPy — real text glyphs", "plannedDesigns": 28, "fonts": [], "pendingFonts": []}
    groups = {"finished": [], "trial-previews": []}
    for spec in selected:
        try:
            path = font_path(spec)
        except FileNotFoundError as error:
            if spec["trial"] and not args.font:
                report["pendingFonts"].append({"id": spec["id"], "reason": str(error)})
                continue
            raise
        identity = validate_font(spec, path)
        folder = "trial-previews" if spec["trial"] else "finished"
        out = BASE / folder / spec["id"]
        out.mkdir(parents=True, exist_ok=True)
        records, previews = [], []
        clean_cells, closing_boundary = make_cells(path, "clean")
        clean_art = {scale: draw_cells(clean_cells, path, scale) for scale in (1, 4)}
        for effect in CONFIG["effects"]:
            cells, boundary = make_cells(path, effect)
            assert cells == make_cells(path, effect)[0], "Non-deterministic character layout"
            cell_file = out / f"{effect}-cells.json"
            cell_file.write_text(json.dumps(cells, separators=(",", ":")) + "\n")
            svg = out / f"{effect}-text.svg"
            svg.write_text(svg_text(cells, spec, path))
            images = []
            for scale in (1, 4):
                image = banner(cells, path, scale)
                file = out / f"{effect}-{W * scale}x{H * scale}.png"
                image.save(file)
                with Image.open(file) as decoded:
                    decoded.load()
                    assert decoded.size == (W * scale, H * scale)
                start = round(W * 0.485) * scale
                region = (start, 0, W * scale, H * scale)
                assert image.crop(region).tobytes() == branding_plate(scale).crop(region).tobytes()
                if effect == "disintegrate":
                    assert boundary == closing_boundary
                    region = (boundary * scale, 0, AW * scale, H * scale)
                    assert draw_cells(cells, path, scale).crop(region).tobytes() == clean_art[scale].crop(region).tobytes()
                images.append(file)
            previews.append((effect, images[0]))
            groups[folder].extend([cell_file, svg] + images)
            records.append({"effect": effect, "glyphCount": len(cells), "images": [str(f.relative_to(BASE)) for f in images],
                            "svg": str(svg.relative_to(BASE)), "brandingPixels": "passed",
                            "closingBraceMatchesClean": "passed" if effect == "disintegrate" else None})
            print(f'{spec["id"]}: {effect} — {len(cells)} real characters', flush=True)
        sheet = out / "comparison.png"
        comparison(previews, sheet, f'TNS / {spec["family"]} / REAL TEXT' + (" / PRIVATE TRIAL" if spec["trial"] else ""))
        groups[folder].append(sheet)
        identity_file = out / "font-identity.json"
        identity_file.write_text(json.dumps({**identity, "trial": spec["trial"], "fontId": spec["id"]}, indent=2) + "\n")
        groups[folder].append(identity_file)
        report["fonts"].append({"id": spec["id"], **identity, "trial": spec["trial"], "variants": records})
    assert digest(ORIGINAL) == original_hash
    report["originalUnchanged"] = True
    report["originalSha256"] = original_hash
    report["completedDesigns"] = sum(len(f["variants"]) for f in report["fonts"])
    verification = BASE / "verification.json"
    verification.write_text(json.dumps(report, indent=2) + "\n")
    if groups["trial-previews"]:
        all_fonts = [(s["family"], BASE / ("trial-previews" if s["trial"] else "finished") /
                      s["id"] / "disintegrate-1584x396.png") for s in selected]
        all_sheet = BASE / "trial-previews/disintegrate-all-fonts-comparison.png"
        comparison([(label, file) for label, file in all_fonts if file.exists()], all_sheet,
                   "TNS / FOUR FONT DISINTEGRATION / PRIVATE EVALUATION")
        groups["trial-previews"].append(all_sheet)
    for folder, files in groups.items():
        if not files:
            continue
        disintegrations = [(s["family"], BASE / folder / s["id"] / "disintegrate-1584x396.png")
                           for s in selected if (BASE / folder / s["id"] / "disintegrate-1584x396.png").exists()]
        sheet = BASE / folder / "disintegrate-font-comparison.png"
        comparison(disintegrations, sheet, "TNS / LEFT FADES — RIGHT INTACT" + (" / PRIVATE TRIAL" if folder == "trial-previews" else ""))
        files.extend([sheet, verification, BASE / "config.json", BASE / "render.py", BASE / "test_render.py"])
        if (BASE / "README.md").exists():
            files.append(BASE / "README.md")
        package(folder, files)
    print(f'Verified {report["completedDesigns"]}/28 designs. Pending fonts: {report["pendingFonts"]}', flush=True)


if __name__ == "__main__":
    main()
