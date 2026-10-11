"""A single real-text TNS signature image; never sends mail or changes accounts."""
from pathlib import Path
import base64
import hashlib
import html
import json
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[3]
CONFIG = json.loads((BASE / "config.json").read_text())
ART = CONFIG["artwork"]
FONT = Path(os.environ.get("TNS_SIGNATURE_FONT", str(ROOT / CONFIG["font"])))
SOURCE = ROOT / CONFIG["wordmark"]["source"]


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def font(size):
    return ImageFont.truetype(str(FONT), round(size), layout_engine=ImageFont.Layout.BASIC)


def cells(disintegrate=True):
    rng = np.random.default_rng(CONFIG["seed"])
    records, particles = [], []
    for role, char, left in [("opening", "{", ART["openingX"]), ("closing", "}", ART["closingX"])]:
        large = font(146)
        box = large.getbbox(char)
        glyph = Image.new("L", (box[2] - box[0], box[3] - box[1]))
        ImageDraw.Draw(glyph).text((-box[0], -box[1]), char, font=large, fill=255)
        glyph = glyph.crop(glyph.getbbox()).resize((ART["braceWidth"], ART["braceHeight"]), Image.Resampling.LANCZOS)
        mask = Image.new("L", (ART["width"], CONFIG["height"]))
        mask.paste(glyph, (left, ART["top"]))
        pixels = np.asarray(mask) / 255
        cw, ch = ART["cellWidth"], ART["cellHeight"]
        for row in range(math.ceil(CONFIG["height"] / ch)):
            for col in range(math.ceil(ART["width"] / cw)):
                noise = rng.random(5)
                tile = pixels[row * ch:min((row + 1) * ch, CONFIG["height"]), col * cw:min((col + 1) * cw, ART["width"])]
                coverage = float(tile.mean()) if tile.size else 0
                if coverage < 0.10:
                    continue
                x, y = (col + 0.5) * cw, (row + 0.5) * ch
                ramp = ART["characters"]
                character = ramp[min(len(ramp) - 1, int(coverage * 9 + noise[0] * 3))]
                opacity = 0.45 + 0.55 * coverage
                keep = True
                if role == "opening" and disintegrate:
                    fade = 0.2 + 0.8 * float(np.clip((x - left) / ART["braceWidth"], 0, 1))
                    opacity *= fade
                    keep = noise[1] < fade
                    if not keep or noise[2] < (1 - fade) * 0.8:
                        px = x - (9 + 28 * noise[3]) * (1 - fade)
                        py = y + (noise[4] - 0.5) * 21
                        if 4 < px < ART["openingX"] + ART["braceWidth"] and 8 < py < CONFIG["height"] - 8:
                            particles.append({"char": character, "x": round(px, 3), "y": round(py, 3), "opacity": round(0.06 + 0.19 * fade, 4), "part": "particle"})
                if keep:
                    records.append({"char": character, "x": x, "y": y, "opacity": round(opacity, 4), "part": role})
    return particles + records


def artwork(records, scale):
    layer = Image.new("RGBA", (ART["width"] * scale, CONFIG["height"] * scale))
    draw = ImageDraw.Draw(layer)
    actual = font(ART["fontSize"] * scale)
    top, bottom = actual.getbbox("M", anchor="ls")[1::2]
    baseline = -(top + bottom) / 2
    blue = tuple(bytes.fromhex(CONFIG["blue"][1:]))
    for cell in records:
        draw.text((cell["x"] * scale - actual.getlength(cell["char"]) / 2, cell["y"] * scale + baseline),
                  cell["char"], font=actual, anchor="ls", fill=blue + (round(cell["opacity"] * 255),))
    return layer


def render(records, logo, scale):
    size = (CONFIG["width"] * scale, CONFIG["height"] * scale)
    image = Image.new("RGB", size, "white")
    art = artwork(records, scale)
    image.paste(art, (0, 0), art)
    draw = ImageDraw.Draw(image)
    for item in CONFIG["text"]:
        actual = font(item["size"] * scale)
        xy = (item["x"] * scale, item["baseline"] * scale)
        box = draw.textbbox(xy, item["value"], font=actual, anchor="ls")
        assert box[0] >= ART["width"] * scale and box[2] <= (CONFIG["width"] - 16) * scale
        assert 0 < box[1] < box[3] < 115 * scale
        draw.text(xy, item["value"], font=actual, anchor="ls", fill=item["colour"])
    wordmark = CONFIG["wordmark"]
    resized = logo.resize((wordmark["width"] * scale, wordmark["height"] * scale), Image.Resampling.LANCZOS)
    image.paste(resized, (wordmark["x"] * scale, wordmark["y"] * scale))
    return image


def svg(records, logo_path):
    small = font(ART["fontSize"])
    top, bottom = small.getbbox("M", anchor="ls")[1::2]
    baseline = -(top + bottom) / 2
    nodes = [f'<text x="{c["x"] - small.getlength(c["char"]) / 2:.3f}" y="{c["y"] + baseline:.3f}" opacity="{c["opacity"]:.4f}">{html.escape(c["char"])}</text>' for c in records]
    contacts = [f'<text x="{t["x"]}" y="{t["baseline"]}" font-size="{t["size"]}" fill="{t["colour"]}">{html.escape(t["value"])}</text>' for t in CONFIG["text"]]
    mark = CONFIG["wordmark"]
    data = base64.b64encode(logo_path.read_bytes()).decode("ascii")
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="1760" height="640" viewBox="0 0 440 160">'
            '<title>Austin Delic — TNS image signature</title><defs><style>@font-face{font-family:TNSDeparture;src:local("Departure Mono Regular"),local("Departure Mono");}</style></defs>'
            '<rect width="440" height="160" fill="white"/>'
            f'<g font-family="TNSDeparture" font-size="{ART["fontSize"]}" fill="{CONFIG["blue"]}">{"".join(nodes)}</g>'
            f'<g font-family="TNSDeparture">{"".join(contacts)}</g>'
            f'<image x="{mark["x"]}" y="{mark["y"]}" width="{mark["width"]}" height="{mark["height"]}" href="data:image/png;base64,{data}"/></svg>\n')


def main():
    assert digest(FONT) == CONFIG["fontSha256"]
    assert font(24).getname() == ("Departure Mono", "Regular")
    missing = font(24).getmask(chr(0x10FFFF))
    missing_signature = (missing.size, bytes(missing))
    for char in set("{}" + ART["characters"] + "".join(t["value"] for t in CONFIG["text"])) - {" "}:
        glyph = font(24).getmask(char)
        assert any(glyph) and (glyph.size, bytes(glyph)) != missing_signature, char
    source_hash = digest(SOURCE)
    with Image.open(SOURCE) as original:
        logo = original.convert("RGB").crop(tuple(CONFIG["wordmark"]["crop"]))
    logo_path = BASE / "original-wordmark.png"
    logo.save(logo_path)
    records, clean = cells(), cells(False)
    assert records == cells()
    assert [c for c in records if c["part"] == "closing"] == [c for c in clean if c["part"] == "closing"]
    assert any(c["part"] == "particle" for c in records)
    (BASE / "ascii-cells.json").write_text(json.dumps(records, indent=2) + "\n")
    variants = []
    for scale in (1, 4):
        image = render(records, logo, scale)
        assert np.array_equal(np.asarray(image), np.asarray(render(cells(), logo, scale)))
        closing_x = (ART["openingX"] + ART["braceWidth"] + 8) * scale
        assert np.array_equal(np.asarray(artwork(records, scale))[:, closing_x:], np.asarray(artwork(clean, scale))[:, closing_x:])
        name = f'austin-delic-tns-{image.width}x{image.height}.png'
        image.save(BASE / name, optimize=True)
        with Image.open(BASE / name) as exported:
            assert exported.size == image.size and np.array_equal(np.asarray(exported), np.asarray(image))
        variants.append({"file": name, "dimensions": list(image.size), "repeatRenderIdentical": True, "closingBraceUnchanged": True})
    (BASE / "signature-artwork.svg").write_text(svg(records, logo_path))
    alt = "Austin Delic | austin@thenextsomething.co | LinkedIn: austindelic | the next something"
    email_html = (f'<a href="mailto:{CONFIG["email"]}" style="text-decoration:none;"><img src="cid:tns-austin-signature" '
                  f'width="440" height="160" alt="{alt}" style="display:block;width:440px;max-width:100%;height:auto;border:0;"></a>\n')
    (BASE / "signature.html").write_text(email_html)
    (BASE / "signature.txt").write_text(f'Austin Delic\nthe next something\n{CONFIG["email"]}\nLinkedIn: {CONFIG["linkedin"]}\n')
    local = email_html.replace("cid:tns-austin-signature", "austin-delic-tns-1760x640.png")
    (BASE / "preview.html").write_text(f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>TNS image signature / Austin Delic</title><style>body{{margin:0;background:#f4f6fa;font:15px/1.5 Arial,Helvetica,sans-serif;color:#191919;padding:32px;}}main{{max-width:520px;margin:auto;}}.label{{font-size:13px;color:#626b7a;margin-bottom:18px;}}.email{{background:white;padding:28px;}}.thanks{{margin:0 0 12px;}}@media(max-width:520px){{body{{padding:12px;}}.email{{padding:12px;}}}}</style></head><body><main><div class="label">TYPE “THANKS,” YOURSELF. THE SIGNATURE BELOW IS ONE IMAGE.</div><div class="email" id="email-preview"><p class="thanks">Thanks,</p>{local}</div></main></body></html>''')
    assert digest(SOURCE) == source_hash
    report = {"fonts": {"family": "Departure Mono", "style": "Regular", "sha256": digest(FONT), "requiredGlyphsPresent": True},
              "sourceHashUnchanged": True, "sourceSha256": source_hash, "variants": variants,
              "asciiCharacters": len(records), "trialFontsUsed": False, "aiGenerationUsed": False,
              "thanksInImage": False, "titlePlaceholderInImage": False, "inboxRendering": "Not verified"}
    (BASE / "verification.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
