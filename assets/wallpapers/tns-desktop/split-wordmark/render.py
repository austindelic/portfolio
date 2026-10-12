"""Split TNS wordmark: 'the next' outside, 'something' inside the ASCII braces."""
from pathlib import Path
import importlib.util
import json
import zipfile
import xml.etree.ElementTree as ET

import numpy as np
from PIL import Image, ImageDraw

BASE = Path(__file__).resolve().parent
CONFIG = json.loads((BASE / "config.json").read_text())
SOURCE = BASE.parent / "collection"
if not SOURCE.is_dir():
    SOURCE = BASE / "collection-source"
spec = importlib.util.spec_from_file_location("wallpaper_collection", SOURCE / "render.py")
collection = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collection)


def main():
    collection.check_font()
    size = next(s for s in collection.CONFIG["sizes"] if s["id"] == CONFIG["size"])
    assert size["wordmarkSize"] == CONFIG["fontSize"]
    cells, _, full = collection.make_geometry(size, CONFIG["style"])
    offset = collection.artwork_offset(size, CONFIG["position"], full)
    actual, previous_words, _ = collection.typography(size, "brace-gap", full, offset)
    baseline = previous_words[0]["y"]
    cx, cy = collection.gap_centre(full, offset)
    opening_left = offset[0] + full[0].getbbox()[0]
    next_ink = actual.getmask(CONFIG["outsideText"]).getbbox()
    inside_ink = actual.getmask(CONFIG["insideText"]).getbbox()
    words = [
        {"text": CONFIG["outsideText"], "colour": "text",
         "x": opening_left - CONFIG["gapBeforeOpeningBrace"] - next_ink[2], "y": baseline},
        {"text": CONFIG["insideText"], "colour": "text",
         "x": cx - (inside_ink[0] + inside_ink[2]) / 2, "y": baseline},
    ]
    boxes = []
    for word in words:
        ink = actual.getmask(word["text"]).getbbox()
        top, bottom = actual.getbbox(word["text"], anchor="ls")[1::2]
        box = [word["x"] + ink[0], baseline + top, word["x"] + ink[2], baseline + bottom]
        assert 0 < box[0] < box[2] < collection.W and 0 < box[1] < box[3] < collection.H
        for mask in full:
            local = (int(np.floor(box[0]-offset[0]-24)), int(np.floor(box[1]-offset[1]-24)),
                     int(np.ceil(box[2]-offset[0]+24)), int(np.ceil(box[3]-offset[1]+24)))
            assert mask.crop(local).getbbox() is None, "Split text collides with brace artwork"
        boxes.append(box)
    assert opening_left - boxes[0][2] == CONFIG["gapBeforeOpeningBrace"]
    assert (boxes[1][0] + boxes[1][2]) / 2 == cx
    assert words[0]["y"] == words[1]["y"] == previous_words[0]["y"]
    for folder in ("4k", "1080p", "editable"):
        (BASE / folder).mkdir(exist_ok=True)
    (BASE / "characters.json").write_text(json.dumps(cells, separators=(",", ":")) + "\n")
    checks = []
    for mode in CONFIG["modes"]:
        palette = collection.CONFIG["modes"][mode]
        base = collection.background(collection.art_layer(size, CONFIG["style"], cells, palette), offset, palette)
        def render_text():
            image = base.copy()
            draw = ImageDraw.Draw(image)
            for word in words:
                draw.text((word["x"], word["y"]), word["text"], font=actual, anchor="ls", fill=palette["text"])
            return image
        image = render_text()
        assert image.tobytes() == render_text().tobytes()
        # Preserve the exact screenshot-reference artwork outside the old/new lettering.
        reference = SOURCE / "4k" / f'filled-medium-original-brace-gap-{mode}-3840x2160.png'
        if reference.exists():
            previous = np.asarray(Image.open(reference))
            ys, xs = np.where(np.any(previous != np.asarray(image), axis=2))
            assert xs.min() >= boxes[0][0]-1 and xs.max() < 3000
            assert ys.min() >= min(b[1] for b in boxes)-8 and ys.max() <= max(b[3] for b in boxes)+8
        stem = f'tns-split-wordmark-{mode}'
        master = BASE / "4k" / f'{stem}-3840x2160.png'
        preview = BASE / "1080p" / f'{stem}-1920x1080.png'
        editable = BASE / "editable" / f'{stem}.svg'
        image.save(master)
        image.resize((1920,1080), Image.Resampling.LANCZOS).save(preview)
        editable.write_text(collection.svg(size, CONFIG["style"], cells, offset, palette, words, 0))
        assert Image.open(master).size == (3840,2160)
        assert Image.open(preview).size == (1920,1080)
        svg = ET.parse(editable).getroot()
        text_nodes = list(svg.findall('./{http://www.w3.org/2000/svg}g')[-1])
        assert [n.text for n in text_nodes] == ["the next", "something"]
        checks.append({"mode": mode, "master": str(master.relative_to(BASE)), "preview": str(preview.relative_to(BASE)),
                       "svg": str(editable.relative_to(BASE)), "repeatRenderIdentical": True})
    comparison = Image.new("RGB", (1960,640), "#eef1f7")
    draw = ImageDraw.Draw(comparison)
    draw.text((20,16), "TNS / SPLIT WORDMARK", font=collection.font(28), fill="#191e2b")
    for i, check in enumerate(checks):
        x = 20+i*980
        draw.text((x,64), check["mode"].upper(), font=collection.font(20), fill="#245bff")
        with Image.open(BASE/check["master"]) as image:
            comparison.paste(image.resize((960,540),Image.Resampling.LANCZOS),(x,90))
    comparison.save(BASE/"comparison.png")
    (BASE/"verification.json").write_text(json.dumps({"font": "Departure Mono Regular", "fontSha256":collection.CONFIG["fontSha256"],
        "sameBaselineAsReference":True,"baseline":baseline,"braceGapCentre":[cx,cy],"words":words,"textBounds":boxes,
        "outsideGap":CONFIG["gapBeforeOpeningBrace"],"braceArtworkPreserved":True,"aiGenerationUsed":False,"variants":checks},indent=2)+'\n')
    archive=BASE/'tns-split-wordmark-light-and-dark.zip'
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
        for folder in ('4k','1080p','editable'):
            for path in (BASE/folder).glob('*'):z.write(path,path.relative_to(BASE))
        for name in ('render.py','config.json','README.md','characters.json','comparison.png','verification.json'):z.write(BASE/name,name)
        for name in ('render.py','config.json'):z.write(SOURCE/name,'collection-source/'+name)
        for name in ('render.py','config.json'):
            text=(collection.SOURCE/name).read_text()
            if name=='render.py':text=text.replace('ROOT = BASE.parents[3]\n','ROOT = BASE.parents[3] if len(BASE.parents) > 3 else BASE\n')
            z.writestr('collection-source/banner-source/'+name,text)
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        assert not any(n.lower().endswith(('.otf','.ttf','.woff','.woff2')) for n in z.namelist())
    print('Complete: split wordmark in dark/light, 4K/1080p PNGs, editable SVGs and verified ZIP.')


if __name__ == "__main__":
    main()
