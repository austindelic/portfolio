"""Private variant: Lofi words, original blue wordmark braces, Departure ASCII."""
import html
import json
import zipfile

import numpy as np
from PIL import Image, ImageDraw

import render

SPEC = json.loads((render.BASE / "wordmark-variant.json").read_text())


def layout(path):
    # Use a common size/baseline for both word groups, with natural glyph proportions.
    for size in range(80, 7, -1):
        font = render.load_font(path, size)
        boxes = [font.getbbox(s["text"], anchor="ls") for s in SPEC["segments"]]
        top = min(b[1] for b in boxes)
        bottom = max(b[3] for b in boxes)
        if all(b[2] - b[0] <= s["box"][2] - s["box"][0] and
               bottom - top <= s["box"][3] - s["box"][1]
               for b, s in zip(boxes, SPEC["segments"])):
            baseline = (SPEC["segments"][0]["box"][1] + SPEC["segments"][0]["box"][3] - top - bottom) / 2
            return size, [{"text": s["text"],
                           "x": (s["box"][0] + s["box"][2] - b[0] - b[2]) / 2,
                           "y": baseline} for s, b in zip(SPEC["segments"], boxes)]
    raise ValueError("Lofi wordmark does not fit the protected brace layout")


def variant(cells, departure, lofi, size, words, scale):
    baseline = render.banner(cells, departure, scale)
    image = baseline.copy()
    draw = ImageDraw.Draw(image)
    allowed = np.zeros((render.H * scale, render.W * scale), dtype=bool)
    for segment in SPEC["segments"]:
        x0, y0, x1, y1 = [round(v * scale) for v in segment["clear"]]
        draw.rectangle((x0, y0, x1 - 1, y1 - 1), fill="white")
        allowed[y0:y1, x0:x1] = True
    font = render.load_font(lofi, size * scale)
    for word in words:
        draw.text((word["x"] * scale, word["y"] * scale), word["text"],
                  font=font, anchor="ls", fill=SPEC["wordmarkColour"])
    # The only changed pixels are in the two word regions. Braces, art and logos stay exact.
    assert np.array_equal(np.asarray(image)[~allowed], np.asarray(baseline)[~allowed])
    for rect in SPEC["preservedWordmarkBraces"]:
        box = tuple(round(v * scale) for v in rect)
        assert image.crop(box).tobytes() == baseline.crop(box).tobytes()
    old = render.BASE / "finished" / SPEC["artworkFont"] / f'{SPEC["effect"]}-{render.W * scale}x{render.H * scale}.png'
    with Image.open(old) as original_variant:
        left = (0, 0, render.AW * scale, render.H * scale)
        assert image.crop(left).tobytes() == original_variant.convert("RGB").crop(left).tobytes()
    return image


def main():
    fonts = {s["id"]: s for s in render.CONFIG["fonts"]}
    departure = render.font_path(fonts[SPEC["artworkFont"]])
    lofi = render.font_path(fonts[SPEC["wordmarkFont"]])
    identities = {"artwork": render.validate_font(fonts[SPEC["artworkFont"]], departure),
                  "wordmark": render.validate_font(fonts[SPEC["wordmarkFont"]], lofi)}
    lofi_font = render.load_font(lofi, 64)
    missing = lofi_font.getmask(chr(0x10FFFF))
    for char in set("the next something") - {" "}:
        mask = lofi_font.getmask(char)
        assert any(mask) and (mask.size, bytes(mask)) != (missing.size, bytes(missing))
    out = render.BASE / "trial-previews" / SPEC["id"]
    out.mkdir(parents=True, exist_ok=True)
    size, words = layout(lofi)
    cells, _ = render.make_cells(departure, SPEC["effect"])
    files = []
    for scale in (1, 4):
        image = variant(cells, departure, lofi, size, words, scale)
        assert image.tobytes() == variant(cells, departure, lofi, size, words, scale).tobytes()
        file = out / f'{SPEC["id"]}-{render.W * scale}x{render.H * scale}.png'
        image.save(file)
        with Image.open(file) as decoded:
            decoded.load()
            assert decoded.size == (render.W * scale, render.H * scale)
            assert decoded.tobytes() == image.tobytes()
        files.append(file)
    left_svg = out / "departure-disintegrate-text.svg"
    left_svg.write_text(render.svg_text(cells, fonts[SPEC["artworkFont"]], departure))
    full_name = html.escape(" ".join(lofi_font.getname()), quote=True)
    nodes = "".join(f'<text x="{w["x"]}" y="{w["y"]}">{html.escape(w["text"])}</text>' for w in words)
    text_svg = out / "lofi-wordmark-text.svg"
    text_svg.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="6336" height="1584" viewBox="0 0 1584 396"><defs><style>@font-face{{font-family:TNSWordmark;src:local("{full_name}");}}</style></defs><g fill="{SPEC["wordmarkColour"]}" font-family="TNSWordmark, &quot;{full_name}&quot;" font-size="{size}">{nodes}</g></svg>\n')
    report = out / "verification.json"
    report.write_text(json.dumps({**SPEC, "fontIdentities": identities, "wordmarkFontSize": size,
                                 "wordmarkLayout": words, "originalBracesUnchanged": True,
                                 "departureArtworkUnchanged": True, "launchLineAndLogosUnchanged": True,
                                 "repeatRenderIdentical": True,
                                 "dimensions": [[1584, 396], [6336, 1584]]}, indent=2) + "\n")
    sheet = out / "comparison.png"
    previous = render.BASE / "finished/departure-mono/disintegrate-1584x396.png"
    render.comparison([("Original wordmark / Departure Mono effect", previous),
                       ("Lofi Forest wordmark / Departure Mono effect / Private trial", files[0])],
                      sheet, "TNS / ADDITIONAL WORDMARK VARIANT")
    files += [left_svg, text_svg, report, sheet, render.BASE / "wordmark-variant.json",
              render.BASE / "render_wordmark_variant.py", render.BASE / "render.py", render.BASE / "config.json",
              render.BASE / "WORDMARK_VARIANT.md"]
    archive = out / "private-wordmark-variant.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
        for file in files:
            z.write(file, file.name)
        z.write(render.ORIGINAL, "sources/tns-original-6336x1584.png")
        for scale in (1, 4):
            original = render.BASE / "finished" / SPEC["artworkFont"] / f'{SPEC["effect"]}-{render.W * scale}x{render.H * scale}.png'
            z.write(original, original.relative_to(render.BASE))
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        assert not any(n.endswith((".ttf", ".otf", ".woff2")) for n in z.namelist())
    print(f'Created {out}\nWordmark: {identities["wordmark"]}\nVerified both sizes; original braces, Departure artwork and logo line unchanged.')


if __name__ == "__main__":
    main()
