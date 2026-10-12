"""Reproducible 324-way TNS wallpaper matrix. No generated images or font fallback."""
from pathlib import Path
import argparse
import csv
import hashlib
import html
import importlib.util
import json
import os
import zipfile
import xml.etree.ElementTree as ET

import numpy as np
from PIL import Image, ImageDraw, ImageFont

BASE = Path(__file__).resolve().parent
CONFIG = json.loads((BASE / "config.json").read_text())
ROOT = BASE.parents[3] if len(BASE.parents) > 3 else BASE
FONT = Path(os.environ.get("TNS_DEPARTURE_FONT", str(ROOT / CONFIG["font"])))
SOURCE = BASE / "banner-source"
if not SOURCE.is_dir():
    SOURCE = ROOT / "assets/linkedin/ascii-braces/text-rendered"
spec = importlib.util.spec_from_file_location("banner_core", SOURCE / "render.py")
core = importlib.util.module_from_spec(spec)
spec.loader.exec_module(core)
W, H = CONFIG["width"], CONFIG["height"]
PIECES = [("the next ", "text"), ("{", "blue"), ("something", "text"), ("}", "blue")]


def font(size):
    return ImageFont.truetype(str(FONT), size, layout_engine=ImageFont.Layout.BASIC)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def check_font():
    assert digest(FONT.read_bytes()) == CONFIG["fontSha256"], "Supply the exact repository Departure Mono font"
    actual = font(40)
    assert actual.getname() == ("Departure Mono", "Regular")
    missing = actual.getmask(chr(0x10FFFF))
    for char in set(CONFIG["text"] + core.CONFIG["glyphs"]):
        if char != " ":
            mask = actual.getmask(char)
            assert any(mask) and (mask.size, bytes(mask)) != (missing.size, bytes(missing)), char
    assert "".join(text for text, _ in PIECES) == CONFIG["text"]


def make_geometry(size, style):
    core.W = core.AW = size["artWidth"]
    core.H = size["artHeight"]
    core.CONFIG["seed"] = CONFIG["seed"]
    core.L = {**core.L, "width": core.W, "height": core.H, "artworkWidth": core.AW,
              "braceHeight": size["heightFraction"], "textSize": size["fontSize"],
              "cellWidth": size["cellWidth"], "cellHeight": size["cellHeight"]}
    core.CONFIG["layout"] = core.L
    full = core.braces(FONT, size["heightFraction"])
    masks = full
    if style == "contour":
        masks = []
        n = CONFIG["contourThickness"]
        for mask in full:
            a = np.asarray(mask)
            # Extend clipped edges so oversized contours do not acquire artificial caps.
            p = np.pad(a, n, mode="edge")
            erosion = np.minimum.reduce([a, p[:-2*n, n:-n], p[2*n:, n:-n],
                                         p[n:-n, :-2*n], p[n:-n, 2*n:]])
            masks.append(Image.fromarray(a - erosion))
    core.transformed_masks = lambda path, effect: (masks, [])
    effect = "disintegrate" if style == "disintegrate" else "clean"
    cells = core.make_cells(FONT, effect)[0]
    assert cells == core.make_cells(FONT, effect)[0]
    return cells, masks, full


def bounds(masks):
    boxes = [m.getbbox() for m in masks]
    return (min(b[0] for b in boxes), min(b[1] for b in boxes),
            max(b[2] for b in boxes), max(b[3] for b in boxes))


def artwork_offset(size, position, full):
    if position == "original":
        return size["original"]
    l, t, r, b = bounds(full)
    return [W/2 - (l+r)/2, H/2 - (t+b)/2]


def gap_centre(full, offset):
    tips = []
    for i, mask in enumerate(full):
        a = np.asarray(mask) > 128
        _, xs = np.where(a)
        edge = xs.min() if i == 0 else xs.max()
        rows = np.flatnonzero(a[:, edge])
        tips.append((rows.min() + rows.max() + 1)/2)
    l, _, r, _ = bounds(full)
    return [offset[0] + (l+r)/2, offset[1] + sum(tips)/2]


def typography(size, placement, full, offset):
    actual = font(size["wordmarkSize"])
    ink = actual.getmask(CONFIG["text"]).getbbox()
    top, bottom = actual.getbbox(CONFIG["text"], anchor="ls")[1::2]
    tw, th = ink[2] - ink[0], bottom - top
    margin = CONFIG["edgeMargin"]
    if placement == "brace-gap":
        cx, cy = gap_centre(full, offset)
    else:
        vertical, horizontal = placement.split("-")
        cx = {"left": margin + tw/2, "centre": W/2, "right": W-margin-tw/2}[horizontal]
        cy = {"top": margin + th/2, "middle": H/2, "bottom": H-margin-th/2}[vertical]
    x, y = cx - (ink[0]+ink[2])/2, cy - (top+bottom)/2
    words = []
    for text, colour in PIECES:
        words.append({"text": text, "colour": colour, "x": x, "y": y})
        x += actual.getlength(text)
    box = [cx-tw/2, cy-th/2, cx+tw/2, cy+th/2]
    assert min(box[:2]) >= 0 and box[2] <= W and box[3] <= H
    if placement != "brace-gap":
        assert all(margin <= v for v in box[:2]) and box[2] <= W-margin and box[3] <= H-margin
    return actual, words, box


def art_layer(size, style, cells, palette):
    layer = Image.new("RGBA", (size["artWidth"], size["artHeight"]))
    draw = ImageDraw.Draw(layer)
    actual = font(size["fontSize"])
    top, bottom = actual.getbbox("M", anchor="ls")[1::2]
    baseline = -(top+bottom)/2
    gain = 0.28 if size["id"] == "oversized" else 0.78 if style == "contour" else 0.85
    blue = tuple(bytes.fromhex(palette["blue"][1:]))
    for c in cells:
        draw.text((c["x"]-actual.getlength(c["char"])/2, c["y"]+baseline), c["char"],
                  font=actual, anchor="ls", fill=blue+(round(255*min(1,c["opacity"]*gain*palette["artOpacityGain"])),))
    return layer


def background(layer, offset, palette):
    image = Image.new("RGB", (W,H), palette["background"])
    # Keep fractional offsets identical in raster and SVG exports.
    x, y = offset
    placed = layer.transform((W,H), Image.Transform.AFFINE, (1,0,-x,0,1,-y), Image.Resampling.BICUBIC)
    image.paste(placed, (0,0), placed)
    return image


def add_text(base, size, placement, full, offset, palette, alpha):
    image = base.copy()
    actual, words, box = typography(size, placement, full, offset)
    n = CONFIG["overlapStroke"]
    overlap_box = tuple(int(v) for v in (box[0]-n,box[1]-n,box[2]+n+1,box[3]+n+1))
    overlaps = alpha.crop(overlap_box).getbbox() is not None
    stroke = n if overlaps else 0
    draw = ImageDraw.Draw(image)
    # Outline the complete line first so later strokes cannot cover earlier letters.
    if stroke:
        draw.text((words[0]["x"],words[0]["y"]), CONFIG["text"], font=actual, anchor="ls",
                  fill=palette["text"], stroke_width=stroke, stroke_fill=palette["background"])
    for word in words:
        draw.text((word["x"],word["y"]),word["text"],font=actual,anchor="ls",fill=palette[word["colour"]])
    return image, words, box, stroke


def svg(size, style, cells, offset, palette, words, stroke):
    actual = font(size["fontSize"])
    top, bottom = actual.getbbox("M", anchor="ls")[1::2]
    baseline = -(top+bottom)/2
    gain = 0.28 if size["id"] == "oversized" else 0.78 if style == "contour" else 0.85
    nodes = [f'<text x="{c["x"]-actual.getlength(c["char"])/2:.3f}" y="{c["y"]+baseline:.3f}" opacity="{min(1,c["opacity"]*gain*palette["artOpacityGain"]):.4f}">{html.escape(c["char"])}</text>' for c in cells]
    branding = []
    if stroke:
        branding.append(f'<text x="{words[0]["x"]}" y="{words[0]["y"]}" fill="{palette["text"]}" stroke="{palette["background"]}" stroke-width="{stroke*2}" stroke-linejoin="round" paint-order="stroke fill" xml:space="preserve">{html.escape(CONFIG["text"])}</text>')
    branding += [f'<text x="{w["x"]}" y="{w["y"]}" fill="{palette[w["colour"]]}" xml:space="preserve">{html.escape(w["text"])}</text>' for w in words]
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
            '<defs><style>@font-face{font-family:TNSDeparture;src:local("Departure Mono Regular"),local("Departure Mono");}</style>'
            f'<clipPath id="art"><rect width="{size["artWidth"]}" height="{size["artHeight"]}"/></clipPath></defs>'
            f'<rect width="{W}" height="{H}" fill="{palette["background"]}"/>'
            f'<g transform="translate({offset[0]} {offset[1]})" clip-path="url(#art)" font-family="TNSDeparture" font-size="{size["fontSize"]}" fill="{palette["blue"]}">{"".join(nodes)}</g>'
            f'<g font-family="TNSDeparture" font-size="{size["wordmarkSize"]}">{"".join(branding)}</g></svg>\n')


def charts(rows):
    groups = [(style,size["id"],position) for size in CONFIG["sizes"]
              for position in CONFIG["positions"] for style in CONFIG["styles"]]
    lookup = {(r["style"],r["size"],r["position"],r["textPlacement"],r["mode"]):r for r in rows}
    # Every design appears in the large overview. Rows are art presets, columns text positions.
    overview = Image.new("RGB",(3504,18*478+100),"#eef1f7")
    od = ImageDraw.Draw(overview)
    od.text((16,12),"TNS / ALL 324 WALLPAPERS",font=font(32),fill="#191e2b")
    for i,(style,size,position) in enumerate(groups):
        sheet = Image.new("RGB",(1320,9*396+100),"#eef1f7")
        sd = ImageDraw.Draw(sheet)
        title = f'{style.upper()} / {size.upper()} / {position.upper()}'
        sd.text((16,12),title,font=font(24),fill="#191e2b")
        sd.text((16,54),"LIGHT",font=font(20),fill="#245bff")
        sd.text((672,54),"DARK",font=font(20),fill="#245bff")
        oy = 90+i*478
        od.text((16,oy),title,font=font(20),fill="#191e2b")
        for j,placement in enumerate(CONFIG["textPlacements"]):
            od.text((16+j*388,oy+26),placement.upper(),font=font(14),fill="#245bff")
            for k,mode in enumerate(CONFIG["modes"]):
                record=lookup[(style,size,position,placement,mode)]
                with Image.open(BASE/record["preview"]) as im:
                    sheet.paste(im.resize((640,360),Image.Resampling.LANCZOS),(16+k*656,100+j*396+24))
                    overview.paste(im.resize((384,216),Image.Resampling.LANCZOS),(16+j*388,oy+46+k*216))
                sd.text((16+k*656,100+j*396),placement.upper(),font=font(18),fill="#245bff")
        sheet.save(BASE/"comparisons"/f'{style}-{size}-{position}.png')
    overview.save(BASE/"overview-all-324.png")
    # A smaller matrix is useful for choosing the artwork before choosing a text position.
    summary=Image.new("RGB",(2440,6*276+80),"#eef1f7")
    sd=ImageDraw.Draw(summary)
    sd.text((16,12),"TNS / 18 ARTWORK PRESETS / LIGHT + DARK",font=font(28),fill="#191e2b")
    for i,(style,size,position) in enumerate(groups):
        x=16+(i%3)*808;y=70+(i//3)*276
        sd.text((x,y),f'{style} / {size} / {position}',font=font(18),fill="#245bff")
        for k,mode in enumerate(CONFIG["modes"]):
            r=lookup[(style,size,position,"brace-gap",mode)]
            with Image.open(BASE/r["preview"]) as im:summary.paste(im.resize((396,223),Image.Resampling.LANCZOS),(x+k*400,y+26))
    summary.save(BASE/"artwork-matrix.png")


def package(rows):
    for mode in CONFIG["modes"]:
        archive=BASE/f'tns-wallpapers-{mode}-162-designs.zip'
        with zipfile.ZipFile(archive,"w",zipfile.ZIP_DEFLATED) as z:
            for r in rows:
                if r["mode"] == mode:
                    for field in ("master","preview","svg"):z.write(BASE/r[field],r[field])
            for folder in ("character-layouts","comparisons"):
                for p in sorted((BASE/folder).glob('*')):z.write(p,p.relative_to(BASE))
            for name in ("render.py","config.json","README.md","overview-all-324.png","artwork-matrix.png"):
                z.write(BASE/name,name)
            selected=[r for r in rows if r['mode']==mode]
            import io
            csv_text=io.StringIO(newline='')
            fields=['id','style','size','position','textPlacement','mode','master','preview','svg']
            writer=csv.DictWriter(csv_text,fieldnames=fields,extrasaction='ignore',lineterminator='\n')
            writer.writeheader();writer.writerows(selected)
            z.writestr('index.csv',csv_text.getvalue())
            verification=json.loads((BASE/'verification.json').read_text())
            verification.update(designCount=162,pngCount=324,svgCount=162,distinctPixelHashes=162,mode=mode,variants=selected)
            z.writestr('verification.json',json.dumps(verification,indent=2)+'\n')
            # The shared core's repository-root lookup is not needed when extracted.
            portable_core=(SOURCE/'render.py').read_text().replace('ROOT = BASE.parents[3]\n',
                'ROOT = BASE.parents[3] if len(BASE.parents) > 3 else BASE\n')
            z.writestr('banner-source/render.py',portable_core)
            z.write(SOURCE/'config.json','banner-source/config.json')
        with zipfile.ZipFile(archive) as z:
            assert z.testzip() is None
            assert not any(n.lower().endswith((".woff",".woff2",".otf",".ttf")) for n in z.namelist())


def verify_exports(rows):
    # Full collection has 324 designs; each standalone mode ZIP has 162.
    count=162*len({r['mode'] for r in rows})
    assert len(rows)==count and len({r["id"] for r in rows})==count
    assert len({r["pixelSha256"] for r in rows})==count, "Duplicate wallpaper pixels"
    expected={(style,size['id'],position,placement,mode) for style in CONFIG['styles'] for size in CONFIG['sizes']
              for position in CONFIG['positions'] for placement in CONFIG['textPlacements'] for mode in {r['mode'] for r in rows}}
    assert {(r['style'],r['size'],r['position'],r['textPlacement'],r['mode']) for r in rows}==expected
    for folder,suffix,count in (("4k","*.png",count),("1080p","*.png",count),("editable","*.svg",count),("comparisons","*.png",18)):
        assert len(list((BASE/folder).glob(suffix)))==count
    for r in rows:
        for field,size in (("master",(W,H)),("preview",(1920,1080))):
            with Image.open(BASE/r[field]) as im:
                assert im.size==size
                im.load()
                if field=="master":assert digest(im.tobytes())==r["pixelSha256"]
        xml=ET.parse(BASE/r["svg"]).getroot()
        assert (xml.attrib["width"],xml.attrib["height"])==(str(W),str(H))
        texts=xml.findall('./{http://www.w3.org/2000/svg}g')[-1]
        assert ''.join(n.text or '' for n in list(texts)[-4:])==CONFIG["text"]
        if r["position"]=="centred":assert r["braceCentre"]==[W/2,H/2]
        if r["textPlacement"]=="brace-gap":assert r["textCentre"]==r["gapCentre"]
        assert r["repeatRenderIdentical"]
    paired={}
    for r in rows:
        key=r['id'].rsplit('-',1)[0]
        signature=(r['offset'],r['textBounds'],r['strokeWidth'])
        if key in paired:assert paired[key]==signature
        paired[key]=signature
    assert len(paired)==162


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--check-only',action='store_true')
    parser.add_argument('--package-only',action='store_true')
    args=parser.parse_args()
    check_font()
    if args.check_only or args.package_only:
        rows=json.loads((BASE/'verification.json').read_text())['variants']
        verify_exports(rows)
        if args.package_only:package(rows)
        print(f'Verified {len(rows)} unique designs, {len(rows)*2} PNGs, {len(rows)} SVGs and placements.',flush=True)
        return
    for folder in ('4k','1080p','editable','character-layouts','comparisons'):(BASE/folder).mkdir(exist_ok=True)
    rows=[];closing_checks=[]
    for size in CONFIG['sizes']:
        filled,_,full=make_geometry(size,'filled')
        for style in CONFIG['styles']:
            cells,masks,full=make_geometry(size,style)
            if style=='disintegrate':
                closing=lambda cc:[c for c in cc if c['part']=='closing']
                assert closing(cells)==closing(filled)
                left_box=full[0].getbbox()
                span=left_box[2]-left_box[0]
                retention=[]
                for low,high in ((0,0.25),(0.75,1)):
                    in_band=lambda c:c['part']=='opening' and left_box[0]+low*span<=c['x']<left_box[0]+high*span
                    retention.append(sum(map(in_band,cells))/sum(map(in_band,filled)))
                assert retention[0]<retention[1]
                assert core.fade_at(left_box[0],left_box[0],left_box[2])==0.2
                assert core.fade_at(left_box[2],left_box[0],left_box[2])==1
                for palette in CONFIG['modes'].values():
                    assert art_layer(size,style,closing(cells),palette).tobytes()==art_layer(size,'filled',closing(filled),palette).tobytes()
                closing_checks.append({'size':size['id'],'sameClosingCellsAndPixels':True,'openingRetentionLeftQuarter':retention[0],'openingRetentionRightQuarter':retention[1]})
            (BASE/'character-layouts'/f'{style}-{size["id"]}.json').write_text(json.dumps(cells,separators=(',',':'))+'\n')
            layers={mode:art_layer(size,style,cells,palette) for mode,palette in CONFIG['modes'].items()}
            for position in CONFIG['positions']:
                offset=artwork_offset(size,position,full)
                l,t,r,b=bounds(full)
                centre=[offset[0]+(l+r)/2,offset[1]+(t+b)/2]
                if size['id']!='oversized':assert 0<=offset[0]+l and offset[0]+r<=W and 0<=offset[1]+t and offset[1]+b<=H
                assert (t==0 and b==size['artHeight']) == (size['id']=='oversized')
                print(f'Rendering {style} / {size["id"]} / {position}: 18 wallpapers',flush=True)
                for mode,palette in CONFIG['modes'].items():
                    layer=layers[mode]
                    base=background(layer,offset,palette)
                    alpha=layer.getchannel('A').transform((W,H),Image.Transform.AFFINE,(1,0,-offset[0],0,1,-offset[1]),Image.Resampling.BICUBIC)
                    for placement in CONFIG['textPlacements']:
                        ident=f'{style}-{size["id"]}-{position}-{placement}-{mode}'
                        image,words,box,stroke=add_text(base,size,placement,full,offset,palette,alpha)
                        assert image.tobytes()==add_text(base,size,placement,full,offset,palette,alpha)[0].tobytes()
                        master=f'4k/{ident}-3840x2160.png';preview=f'1080p/{ident}-1920x1080.png';editable=f'editable/{ident}.svg'
                        image.save(BASE/master)
                        image.resize((1920,1080),Image.Resampling.LANCZOS).save(BASE/preview)
                        (BASE/editable).write_text(svg(size,style,cells,offset,palette,words,stroke))
                        rows.append({'id':ident,'style':style,'size':size['id'],'position':position,'textPlacement':placement,'mode':mode,
                                     'master':master,'preview':preview,'svg':editable,'characters':len(cells),'offset':offset,'braceCentre':centre,
                                     'gapCentre':gap_centre(full,offset),'textCentre':[(box[0]+box[2])/2,(box[1]+box[3])/2],
                                     'textBounds':box,'strokeWidth':stroke,'repeatRenderIdentical':True,'pixelSha256':digest(image.tobytes())})
    charts(rows)
    verify_exports(rows)
    fields=['id','style','size','position','textPlacement','mode','master','preview','svg']
    with (BASE/'index.csv').open('w',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore',lineterminator='\n');writer.writeheader();writer.writerows(rows)
    (BASE/'verification.json').write_text(json.dumps({'designCount':324,'pngCount':648,'svgCount':324,'detailedComparisonCount':18,
        'font':'Departure Mono Regular','fontSha256':CONFIG['fontSha256'],'distinctPixelHashes':324,'pairedGeometryIdentical':True,
        'onlyOversizedClipsTips':True,'aiGenerationUsed':False,'trialFontsUsed':False,'closingBraceChecks':closing_checks,'variants':rows},indent=2)+'\n')
    package(rows)
    print('Complete: 324 distinct wallpapers, 648 PNGs, 324 SVGs, 18 comparison sheets, overview and two ZIPs.',flush=True)


if __name__=='__main__':main()
