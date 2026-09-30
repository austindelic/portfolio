"""385 private, real-font wordmark/effect combinations from the three supplied ZIPs."""
from io import BytesIO
from pathlib import Path
import hashlib
import html
import json
import math
import struct
import zipfile

from PIL import Image, ImageDraw, ImageFont

import render
import render_wordmark_variant as wordmark

PLAN = json.loads((render.BASE / "trial-font-explorations.json").read_text())
OUT = render.BASE / "trial-previews" / PLAN["id"]
WEIGHTS = ["Thin", "ExtraLight", "Light", "Regular", "Medium", "Semibold", "SemiBold", "Bold", "ExtraBold", "Black", "Ultra", "RegularApart"]


def font_names(data):
    """Read full and PostScript names without changing the supplied font bytes.

    Layout: https://learn.microsoft.com/en-us/typography/opentype/spec/name
    """
    tables = struct.unpack_from(">H", data, 4)[0]
    for i in range(tables):
        tag, _, offset, _ = struct.unpack_from(">4sIII", data, 12 + i * 16)
        if tag != b"name":
            continue
        _, count, storage = struct.unpack_from(">HHH", data, offset)
        names = {}
        for j in range(count):
            platform, encoding, language, name_id, length, start = struct.unpack_from(">6H", data, offset + 6 + j * 12)
            if name_id not in (4, 6) or platform not in (0, 1, 3):
                continue
            value = data[offset + storage + start:offset + storage + start + length]
            value = value.decode("utf-16-be" if platform in (0, 3) else "mac_roman")
            if name_id not in names or (platform == 3 and language == 0x409):
                names[name_id] = value
        return {"fullName": names[4], "postScriptName": names[6]}
    raise ValueError("Font has no name table")


def make_font(face, size):
    font = ImageFont.truetype(BytesIO(face["data"]), round(size), layout_engine=ImageFont.Layout.BASIC)
    if "width" in face:
        axes = font.get_variation_axes()
        assert len(axes) == 1 and axes[0]["name"] == b"Width"
        assert axes[0]["minimum"] <= face["width"] <= axes[0]["maximum"]
        font.set_variation_by_axes([face["width"]])
    return font


def faces():
    result = []
    for family, source in PLAN["archives"].items():
        with zipfile.ZipFile(Path(source).expanduser()) as archive:
            names = archive.namelist()
            if family == "thermochrome":
                selected = sorted(n for n in names if n.startswith("Desktop/") and n.endswith(".otf"))
            elif family == "electric-blue":
                selected = sorted(n for n in names if "/OTF Instances/" in n and n.endswith(".otf"))
            else:
                selected = [n for n in names if n.endswith("Trial_MetamorBitVF.ttf") and not n.startswith("__MACOSX/")]
                assert len(selected) == 1
            for name in selected:
                data = archive.read(name)
                font = ImageFont.truetype(BytesIO(data), 64)
                actual_family, style = font.getname()
                expected = {"thermochrome": "MD Thermochrome", "electric-blue": "Electric Blue", "metamorbit": "Metamor"}[family]
                assert expected.casefold() in actual_family.casefold()
                info = font_names(data)
                if family == "thermochrome":
                    orientation = name.split("/")[1]
                    weight = next((w for w in WEIGHTS if f'-{w}' in Path(name).name), "Regular")
                    label = f'Thermochrome / {orientation} / {weight}'
                    slug = f'{orientation}-{weight}'.lower()
                elif family == "electric-blue":
                    weight = Path(name).stem.split("STAT-")[1]
                    label, slug = f'Electric Blue / {weight}', weight.lower()
                else:
                    label, slug = "MetamorBit", "width"
                for width in PLAN["metamorbitWidths"] if family == "metamorbit" else [None]:
                    face = {"familyId": family, "id": f'{family}-{slug}' + (f'-{width}' if width else ""),
                            "label": label + (f' / Width {width}' if width else ""),
                            "fontFamily": actual_family, "style": style, **info,
                            "sourceArchive": Path(source).name, "sourceMember": name,
                            "sha256": hashlib.sha256(data).hexdigest(), "data": data}
                    if width:
                        face["width"] = width
                    result.append(face)
        assert sum(f["familyId"] == family for f in result) == PLAN["expectedFaces"][family]
    assert len({f["id"] for f in result}) == 55
    return result


def clear_words(image):
    image = image.copy()
    scale = image.width // render.W
    draw = ImageDraw.Draw(image)
    for segment in wordmark.SPEC["segments"]:
        x0, y0, x1, y1 = [round(v * scale) for v in segment["clear"]]
        draw.rectangle((x0, y0, x1 - 1, y1 - 1), fill="white")
    return image


def draw_words(face, size, words, scale):
    # Only this transparent, small wordmark layer changes across the 55 font faces.
    layer = Image.new("RGBA", (render.W * scale, 100 * scale))
    font = make_font(face, size * scale)
    draw = ImageDraw.Draw(layer)
    for word, segment in zip(words, wordmark.SPEC["segments"]):
        xy = (word["x"] * scale, (word["y"] - 150) * scale)
        box = draw.textbbox(xy, word["text"], font=font, anchor="ls")
        allowed = [round(v * scale) for v in segment["clear"]]
        allowed[1] -= 150 * scale
        allowed[3] -= 150 * scale
        if not (allowed[0] <= box[0] and box[2] <= allowed[2] and allowed[1] <= box[1] and box[3] <= allowed[3]):
            raise ValueError(f'{face["label"]}: word bounds {box} exceed {allowed}')
        draw.text(xy, word["text"], font=font, anchor="ls", fill=wordmark.SPEC["wordmarkColour"])
    return layer


def word_svg(face, size, words):
    full = html.escape(face["fullName"], quote=True)
    postscript = html.escape(face["postScriptName"], quote=True)
    variation = f'style="font-variation-settings: &apos;wdth&apos; {face["width"]}"' if "width" in face else ""
    nodes = "".join(f'<text x="{w["x"]}" y="{w["y"]}">{html.escape(w["text"])}</text>' for w in words)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="6336" height="1584" viewBox="0 0 1584 396">'
            f'<title>{html.escape(face["label"])}</title><defs><style>@font-face{{font-family:TNSWordmark;src:local("{postscript}"),local("{full}");}}</style></defs>'
            f'<g fill="{wordmark.SPEC["wordmarkColour"]}" font-family="TNSWordmark, &quot;{full}&quot;" font-size="{size}" {variation}>{nodes}</g></svg>\n')


def sheet(items, destination, title, columns=2):
    thumb = (792, 198)
    gap, row_height = 24, 248
    image = Image.new("RGB", (columns * (thumb[0] + gap) + gap, 86 + math.ceil(len(items) / columns) * row_height), "white")
    draw = ImageDraw.Draw(image)
    label_font = render.load_font(Path("/System/Library/Fonts/Menlo.ttc"), 18)
    draw.text((gap, 24), title, font=label_font, fill=render.CONFIG["colour"])
    for i, (label, file) in enumerate(items):
        x, y = gap + (i % columns) * (thumb[0] + gap), 80 + (i // columns) * row_height
        draw.rectangle((x, y, x + thumb[0], y + 32), fill="#f1f4ff")
        draw.text((x + 8, y + 6), label, font=label_font, fill="#1b1b1b")
        with Image.open(file) as preview:
            image.paste(preview.resize(thumb, Image.Resampling.LANCZOS), (x, y + 34))
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination)


def package_previews(comparisons):
    common = OUT / "common"
    for family in PLAN["archives"]:
        archive = OUT / f'{family}-private-previews.zip'
        files = sorted((OUT / family).rglob("*")) + sorted(common.rglob("*"))
        files += [OUT / "verification.json", OUT / "README.md"]
        files += [OUT / file for file in comparisons if Path(file).name.startswith(family)]
        sources = ["render.py", "config.json", "render_wordmark_variant.py", "wordmark-variant.json",
                   "render_trial_font_explorations.py", "trial-font-explorations.json", "TRIAL_FONT_EXPLORATIONS.md"]
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
            for file in files:
                if file.is_file():
                    z.write(file, file.relative_to(OUT))
            for name in sources:
                z.write(render.BASE / name, name)
            z.write(render.ORIGINAL, "sources/tns-original-6336x1584.png")
            for effect in PLAN["effects"]:
                for scale in (1, 4):
                    baseline = render.BASE / "finished/departure-mono" / f'{effect}-{render.W * scale}x{render.H * scale}.png'
                    z.write(baseline, baseline.relative_to(render.BASE))
        with zipfile.ZipFile(archive) as z:
            assert z.testzip() is None
            assert not any(n.endswith((".otf", ".ttf", ".woff", ".woff2")) for n in z.namelist())
            assert len([n for n in z.namelist() if n.startswith(family + "/") and n.endswith(("-1584x396.png", "-6336x1584.png"))]) == PLAN["expectedFaces"][family] * 14
        print(f'Packaged {archive.name}', flush=True)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    selected = faces()
    originals = {}
    plates = {}
    common = OUT / "common"
    common.mkdir(exist_ok=True)
    departure_spec = next(s for s in render.CONFIG["fonts"] if s["id"] == PLAN["artworkFont"])
    departure = render.font_path(departure_spec)
    render.validate_font(departure_spec, departure)
    for effect in PLAN["effects"]:
        svg = common / f'departure-{effect}-text.svg'
        svg.write_text(render.svg_text(render.make_cells(departure, effect)[0], departure_spec, departure))
        for scale in (1, 4):
            source = render.BASE / "finished/departure-mono" / f'{effect}-{render.W * scale}x{render.H * scale}.png'
            with Image.open(source) as image:
                originals[effect, scale] = image.convert("RGB")
            plates[effect, scale] = clear_words(originals[effect, scale])
    report = {"designCount": 0, "fontFaces": 55, "privateTrial": True,
              "effectFont": "Departure Mono", "wordmarkBraces": "Original pixels preserved",
              "dimensions": [[1584, 396], [6336, 1584]], "faces": []}
    for i, face in enumerate(selected):
        out = OUT / face["familyId"] / face["id"]
        out.mkdir(parents=True, exist_ok=True)
        font = make_font(face, 64)
        missing = font.getmask(chr(0x10FFFF)); missing_signature = (missing.size, bytes(missing))
        for char in set("the next something") - {" "}:
            glyph = font.getmask(char)
            assert any(glyph) and (glyph.size, bytes(glyph)) != missing_signature, (face["label"], char)
        maximum = 80
        while maximum >= 8:
            size, words = wordmark.layout(None, font_loader=lambda s: make_font(face, s), maximum_size=maximum)
            try:
                layers = {scale: draw_words(face, size, words, scale) for scale in (1, 4)}
                break
            except ValueError:
                # Variable fonts can hint differently at the two resolutions; fit both.
                maximum = size - 1
        else:
            raise ValueError(f'Cannot fit {face["label"]} at both resolutions')
        for scale, layer in layers.items():
            assert layer.tobytes() == draw_words(face, size, words, scale).tobytes()
        previews, variants = [], []
        for effect in PLAN["effects"]:
            files = []
            for scale in (1, 4):
                image = plates[effect, scale].copy()
                image.paste(layers[scale], (0, 150 * scale), layers[scale])
                assert clear_words(image).tobytes() == plates[effect, scale].tobytes(), face["label"]
                for rect in wordmark.SPEC["preservedWordmarkBraces"]:
                    box = tuple(round(v * scale) for v in rect)
                    assert image.crop(box).tobytes() == originals[effect, scale].crop(box).tobytes()
                file = out / f'{effect}-{render.W * scale}x{render.H * scale}.png'
                image.save(file)
                with Image.open(file) as decoded:
                    decoded.load()
                    assert decoded.size == image.size and decoded.tobytes() == image.tobytes()
                files.append(str(file.relative_to(OUT)))
            previews.append((effect.title(), OUT / files[0]))
            variants.append({"effect": effect, "images": files, "preservedPixels": "passed", "decodedPixels": "passed"})
            report["designCount"] += 1
        svg = out / "wordmark-text.svg"
        svg.write_text(word_svg(face, size, words))
        identity = {k: v for k, v in face.items() if k != "data"}
        identity.update({"fontSize": size, "wordmarkLayout": words, "repeatRender": "passed", "variants": variants})
        (out / "face.json").write_text(json.dumps(identity, indent=2) + "\n")
        sheet(previews, out / "effects-comparison.png", face["label"] + " / PRIVATE TRIAL")
        report["faces"].append(identity)
        print(f'{i + 1}/55: {face["label"]} — 7 effects, both sizes verified', flush=True)
    assert report["designCount"] == 385
    comparisons = []
    for family in PLAN["archives"]:
        family_faces = [f for f in report["faces"] if f["familyId"] == family]
        for page, start in enumerate(range(0, len(family_faces), 8), 1):
            items = [(f["label"], OUT / next(v["images"][0] for v in f["variants"] if v["effect"] == "disintegrate")) for f in family_faces[start:start + 8]]
            target = OUT / "comparisons" / f'{family}-page-{page:02}.png'
            sheet(items, target, f'TNS / {family.upper()} / FONT COMPARISON {page} / PRIVATE TRIAL')
            comparisons.append(str(target.relative_to(OUT)))
    report["comparisonPages"] = comparisons
    overview = []
    for family, wanted in [("thermochrome", "thermochrome-regular-regular"), ("electric-blue", "electric-blue-regular"), ("metamorbit", "metamorbit-width-400")]:
        face = next(f for f in report["faces"] if f["id"] == wanted)
        overview.append((face["label"], OUT / face["familyId"] / face["id"] / "disintegrate-1584x396.png"))
    sheet(overview, OUT / "overview.png", "TNS / THREE NEW TRIAL FONTS / PRIVATE EVALUATION", columns=1)
    (OUT / "verification.json").write_text(json.dumps(report, indent=2) + "\n")
    (OUT / "README.md").write_text((render.BASE / "TRIAL_FONT_EXPLORATIONS.md").read_text())
    package_previews(comparisons)
    print('COMPLETE: 385 private designs / 770 PNGs / 55 editable wordmark SVGs', flush=True)


if __name__ == "__main__":
    main()
