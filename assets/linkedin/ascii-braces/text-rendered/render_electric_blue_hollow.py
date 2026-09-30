"""Render a hollow Electric Blue wordmark using the original trial font bytes."""
import hashlib
import json
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

import render
import render_wordmark_variant as wordmark
import render_trial_font_explorations as trials

SPEC = json.loads((render.BASE / "electric-blue-hollow.json").read_text())
OUT = render.BASE / "trial-previews" / SPEC["id"]
FILLED = trials.OUT / "electric-blue" / SPEC["face"]


def outline(face, scale):
    layer = Image.new("RGBA", (render.W * scale, render.H * scale))
    draw = ImageDraw.Draw(layer)
    font = trials.make_font(face, face["fontSize"] * scale)
    stroke = round(SPEC["outlineWidth"] * scale)
    for word, segment in zip(face["wordmarkLayout"], wordmark.SPEC["segments"]):
        xy = (word["x"] * scale, word["y"] * scale)
        box = draw.textbbox(xy, word["text"], font=font, anchor="ls", stroke_width=stroke)
        x0, y0, x1, y1 = [round(v * scale) for v in segment["clear"]]
        assert x0 <= box[0] <= box[2] <= x1 and y0 <= box[1] <= box[3] <= y1, box
        draw.text(xy, word["text"], font=font, anchor="ls", fill="white",
                  stroke_width=stroke, stroke_fill=wordmark.SPEC["wordmarkColour"])
    return layer


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    face = json.loads((FILLED / "face.json").read_text())
    with zipfile.ZipFile(Path(trials.PLAN["archives"]["electric-blue"]).expanduser()) as archive:
        face["data"] = archive.read(face["sourceMember"])
    assert hashlib.sha256(face["data"]).hexdigest() == face["sha256"]
    assert trials.make_font(face, 71).getname() == (face["fontFamily"], face["style"])
    assert trials.font_names(face["data"]) == {k: face[k] for k in ("fullName", "postScriptName")}
    records = []
    for scale in (1, 4):
        size = (render.W * scale, render.H * scale)
        baseline = Image.open(FILLED / f'{SPEC["effect"]}-{size[0]}x{size[1]}.png').convert("RGB")
        layer = outline(face, scale)
        assert np.array_equal(np.asarray(layer), np.asarray(outline(face, scale)))
        image = trials.clear_words(baseline)
        image.paste(layer, (0, 0), layer)
        original, result = np.asarray(baseline), np.asarray(image)
        allowed = np.zeros((size[1], size[0]), dtype=bool)
        hollow_counts = []
        for segment in wordmark.SPEC["segments"]:
            x0, y0, x1, y1 = [round(v * scale) for v in segment["clear"]]
            allowed[y0:y1, x0:x1] = True
            before, after = original[y0:y1, x0:x1], result[y0:y1, x0:x1]
            filled = np.max(before, axis=2) < 80
            emptied = filled & (np.min(after, axis=2) > 240)
            ratio = float(emptied.sum() / filled.sum())
            assert ratio > 0.8, ratio
            assert np.count_nonzero(np.max(after, axis=2) < 150) > 100 * scale * scale
            hollow_counts.append(ratio)
        assert np.array_equal(original[~allowed], result[~allowed])
        for box in wordmark.SPEC["preservedWordmarkBraces"]:
            x0, y0, x1, y1 = [round(v * scale) for v in box]
            assert np.array_equal(original[y0:y1, x0:x1], result[y0:y1, x0:x1])
        name = f'{SPEC["id"]}-{size[0]}x{size[1]}.png'
        image.save(OUT / name)
        with Image.open(OUT / name) as exported:
            assert exported.size == size and np.array_equal(np.asarray(exported), result)
        records.append({"image": name, "dimensions": list(size), "filledPixelsNowWhite": hollow_counts,
                        "brandingAndArtworkPixelsUnchanged": True, "repeatRenderIdentical": True})
    svg = trials.word_svg(face, face["fontSize"], face["wordmarkLayout"])
    svg = svg.replace(f'<g fill="{wordmark.SPEC["wordmarkColour"]}"',
                      f'<g fill="white" stroke="{wordmark.SPEC["wordmarkColour"]}" '
                      f'stroke-width="{SPEC["outlineWidth"] * 2}" style="paint-order:stroke fill"')
    assert svg.count("<text ") == 2 and 'stroke-width="2"' in svg
    (OUT / "hollow-wordmark-text.svg").write_text(svg)
    departure_svg = trials.OUT / "common" / f'departure-{SPEC["effect"]}-text.svg'
    (OUT / "departure-disintegrate-text.svg").write_bytes(departure_svg.read_bytes())
    trials.sheet([("Electric Blue / Regular / Filled", FILLED / "disintegrate-1584x396.png"),
                  ("Electric Blue / Regular / Hollow", OUT / records[0]["image"])],
                 OUT / "filled-vs-hollow.png", "ELECTRIC BLUE / FILLED AND HOLLOW", columns=1)
    report = {"id": SPEC["id"], "effect": SPEC["effect"], "privateEvaluation": True,
              "fontFamily": face["fontFamily"], "style": face["style"], "fontSha256": face["sha256"],
              "fontSize": face["fontSize"], "outlineWidth": SPEC["outlineWidth"], "variants": records}
    (OUT / "verification.json").write_text(json.dumps(report, indent=2) + "\n")
    (OUT / "README.md").write_text("# Electric Blue hollow wordmark\n\n"
        "Private trial-font evaluation. Actual Electric Blue Regular text with white interiors and a 1-pixel "
        "outline at LinkedIn size. Departure Mono disintegration, blue wordmark braces and the launch/logo "
        "line are pixel-identical to the filled version. PNGs are rendered directly at both labelled sizes. "
        "The two SVGs contain editable text and require the licensed fonts locally. No font files are included.\n")
    with zipfile.ZipFile(OUT / "electric-blue-hollow-private-preview.zip", "w", zipfile.ZIP_DEFLATED) as archive:
        for file in sorted(OUT.iterdir()):
            if file.is_file() and file.suffix != ".zip":
                archive.write(file, file.name)
        for name in ("render_electric_blue_hollow.py", "electric-blue-hollow.json"):
            archive.write(render.BASE / name, "source/" + name)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
