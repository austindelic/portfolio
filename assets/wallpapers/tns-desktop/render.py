"""Six desktop wallpaper concepts made from real Departure Mono characters."""
from pathlib import Path
import hashlib
import html
import importlib.util
import json
import zipfile

import numpy as np
from PIL import Image, ImageDraw, ImageFont

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[2]
CONFIG = json.loads((BASE / "config.json").read_text())
FONT = ROOT / CONFIG["font"]
spec = importlib.util.spec_from_file_location("tns_banner", ROOT / "assets/linkedin/ascii-braces/text-rendered/render.py")
core = importlib.util.module_from_spec(spec)
spec.loader.exec_module(core)
original_masks = core.transformed_masks


def font(size):
    return ImageFont.truetype(str(FONT), size, layout_engine=ImageFont.Layout.BASIC)


def contour_masks(path, effect):
    masks, _ = original_masks(path, effect)
    result = []
    for mask in masks:
        pixels = np.asarray(mask)
        inset = np.minimum.reduce([pixels, np.roll(pixels, 24, axis=0), np.roll(pixels, -24, axis=0),
                                   np.roll(pixels, 24, axis=1), np.roll(pixels, -24, axis=1)])
        result.append(Image.fromarray(pixels - inset))
    return result, []


def geometry(concept):
    core.W = core.AW = concept["artWidth"]
    core.H = concept["artHeight"]
    core.CONFIG["seed"] = CONFIG["seed"]
    core.L = {**core.L, "width": core.W, "height": core.H, "artworkWidth": core.AW,
              "textSize": concept["fontSize"], "cellWidth": concept["cellWidth"], "cellHeight": concept["cellHeight"]}
    core.CONFIG["layout"] = core.L
    core.transformed_masks = contour_masks if concept.get("outline") else original_masks
    records, _ = core.make_cells(FONT, concept["effect"])
    assert records == core.make_cells(FONT, concept["effect"])[0]
    if concept["effect"] == "disintegrate":
        clean = core.make_cells(FONT, "clean")[0]
        assert [c for c in records if c["part"] == "closing"] == [c for c in clean if c["part"] == "closing"]
    return records


def wordmark(concept):
    actual = font(concept["wordmarkSize"])
    pieces = [("the next ", "text"), ("{", "blue"), ("something", "text"), ("}", "blue")]
    width = sum(actual.getlength(text) for text, _ in pieces)
    x = concept["wordmarkCentre"][0] - width / 2
    y = concept["wordmarkCentre"][1]
    records = []
    for text, colour in pieces:
        records.append({"text": text, "colour": colour, "x": x, "y": y})
        x += actual.getlength(text)
    assert 150 <= records[0]["x"] and x <= CONFIG["width"] - 150
    return actual, records


def render(concept, cells, palette):
    image = Image.new("RGB", (CONFIG["width"], CONFIG["height"]), palette["background"])
    layer = Image.new("RGBA", image.size)
    draw = ImageDraw.Draw(layer)
    actual = font(concept["fontSize"])
    top, bottom = actual.getbbox("M", anchor="ls")[1::2]
    baseline = -(top + bottom) / 2
    blue = tuple(bytes.fromhex(palette["blue"][1:]))
    for cell in cells:
        x = concept["x"] + cell["x"] - actual.getlength(cell["char"]) / 2
        y = concept["y"] + cell["y"] + baseline
        draw.text((x, y), cell["char"], font=actual, anchor="ls",
                  fill=blue + (round(255 * min(1, cell["opacity"] * concept["opacity"] * palette["artOpacityGain"])),))
    image.paste(layer, (0, 0), layer)
    draw = ImageDraw.Draw(image)
    actual, words = wordmark(concept)
    for word in words:
        draw.text((word["x"], word["y"]), word["text"], font=actual, anchor="ls", fill=palette[word["colour"]])
    return image


def svg(concept, cells, palette):
    actual = font(concept["fontSize"])
    top, bottom = actual.getbbox("M", anchor="ls")[1::2]
    baseline = -(top + bottom) / 2
    nodes = [f'<text x="{concept["x"] + c["x"] - actual.getlength(c["char"]) / 2:.3f}" '
             f'y="{concept["y"] + c["y"] + baseline:.3f}" opacity="{min(1, c["opacity"] * concept["opacity"] * palette["artOpacityGain"]):.4f}">{html.escape(c["char"])}</text>' for c in cells]
    _, words = wordmark(concept)
    branding = [f'<text x="{w["x"]:.3f}" y="{w["y"]}" fill="{palette[w["colour"]]}" xml:space="preserve">{html.escape(w["text"])}</text>' for w in words]
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="3840" height="2160" viewBox="0 0 3840 2160">'
            f'<title>TNS {concept["name"]}</title><defs><style>@font-face{{font-family:TNSDeparture;src:local("Departure Mono Regular"),local("Departure Mono");}}</style></defs>'
            f'<rect width="3840" height="2160" fill="{palette["background"]}"/>'
            f'<g font-family="TNSDeparture" font-size="{concept["fontSize"]}" fill="{palette["blue"]}">{"".join(nodes)}</g>'
            f'<g font-family="TNSDeparture" font-size="{concept["wordmarkSize"]}">{"".join(branding)}</g></svg>\n')


def comparison(results):
    thumb = (960, 540)
    image = Image.new("RGB", (2024, 1910), "#eef1f7")
    draw = ImageDraw.Draw(image)
    heading, label = font(36), font(24)
    draw.text((32, 22), "TNS / DESKTOP WALLPAPER CONCEPTS", font=heading, fill="#191e2b")
    draw.text((32, 70), "LIGHT", font=label, fill="#626b7a")
    draw.text((1032, 70), "DARK", font=label, fill="#626b7a")
    for index, concept in enumerate(CONFIG["concepts"]):
        y = 112 + index * 594
        for column, mode in enumerate(CONFIG["modes"]):
            x = 32 + column * 1000
            draw.text((x, y), concept["name"].upper() + " / " + mode.upper(), font=label, fill="#245bff")
            with Image.open(BASE / "4k" / f'{concept["id"]}-{mode}-3840x2160.png') as source:
                image.paste(source.resize(thumb, Image.Resampling.LANCZOS), (x, y + 34))
    image.save(BASE / "comparison.png", optimize=True)


def main():
    assert hashlib.sha256(FONT.read_bytes()).hexdigest() == CONFIG["fontSha256"]
    assert font(40).getname() == ("Departure Mono", "Regular")
    missing = font(40).getmask(chr(0x10FFFF))
    for char in "{}" + core.CONFIG["glyphs"] + "the nxtsomig":
        glyph = font(40).getmask(char)
        if char != " ":
            assert any(glyph) and (glyph.size, bytes(glyph)) != (missing.size, bytes(missing))
    for directory in ("4k", "1080p", "editable"):
        (BASE / directory).mkdir(exist_ok=True)
    results = []
    for concept in CONFIG["concepts"]:
        records = geometry(concept)
        (BASE / "editable" / f'{concept["id"]}-cells.json').write_text(json.dumps(records, separators=(",", ":")) + "\n")
        for mode, palette in CONFIG["modes"].items():
            print(f'Rendering {concept["name"]} / {mode}: {len(records)} actual characters', flush=True)
            image = render(concept, records, palette)
            assert np.array_equal(np.asarray(image), np.asarray(render(concept, records, palette)))
            master = BASE / "4k" / f'{concept["id"]}-{mode}-3840x2160.png'
            image.save(master, optimize=True)
            assert Image.open(master).size == (3840, 2160)
            preview = BASE / "1080p" / f'{concept["id"]}-{mode}-1920x1080.png'
            image.resize((1920, 1080), Image.Resampling.LANCZOS).save(preview, optimize=True)
            assert Image.open(preview).size == (1920, 1080)
            (BASE / "editable" / f'{concept["id"]}-{mode}.svg').write_text(svg(concept, records, palette))
            results.append({"concept": concept["name"], "mode": mode, "characters": len(records),
                            "master": str(master.relative_to(BASE)), "preview": str(preview.relative_to(BASE)), "repeatRenderIdentical": True})
    comparison(results)
    (BASE / "verification.json").write_text(json.dumps({"designCount": 6, "font": "Departure Mono Regular", "fontSha256": CONFIG["fontSha256"],
        "sameGeometryForLightAndDark": True, "aiGenerationUsed": False, "trialFontsUsed": False, "variants": results}, indent=2) + "\n")
    archive = BASE / "tns-wallpapers-light-and-dark.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
        for file in sorted(BASE.rglob("*")):
            if file.is_file() and file != archive and "__pycache__" not in file.parts:
                z.write(file, file.relative_to(BASE))
        # Reused banner code is included, but no fonts or earlier image outputs.
        source = ROOT / "assets/linkedin/ascii-braces/text-rendered"
        for name in ("render.py", "config.json"):
            z.write(source / name, "banner-source/" + name)
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        assert not any(n.endswith((".woff", ".woff2", ".otf", ".ttf")) for n in z.namelist())
    print(f'Complete: six concepts, twelve PNG exports and editable SVGs. {archive}', flush=True)


if __name__ == "__main__":
    main()
