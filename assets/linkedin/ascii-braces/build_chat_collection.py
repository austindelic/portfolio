"""Collect every chat deliverable and chart the distinct banner designs."""
from pathlib import Path
import csv
import hashlib
import json
import shutil
import textwrap
import zipfile

from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "all-chat-collection"
FILES = OUT / "01-design-files"
CHART = OUT / "02-variant-chart"
EFFECTS = ["clean", "oversized", "tilted", "perspective", "trails", "dissolve", "disintegrate"]
TW, TH, LABEL, GAP, MARGIN, HEADER, ROW, FOOTER = 792, 198, 336, 16, 24, 188, 228, 64
WIDTH = MARGIN * 2 + LABEL + TW * 7 + GAP * 6
BLUE = "#245bff"
COLOURS = {"original": "#5c6675", "early-ai": "#a85515", "text-braces": BLUE,
           "mixed-lofi": "#7c3aed", "thermochrome": "#007c7e", "electric-blue": "#b63460", "metamorbit": "#637326",
           "hollow-electric-blue": "#b63460"}


def digest(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as file:
        while chunk := file.read(1024 * 1024):
            h.update(chunk)
    return h.hexdigest()


def catalog():
    rows, designs = [], []

    def add(group, label, entries):
        row = {"group": group, "label": label, "entries": []}
        entries.sort(key=lambda e: EFFECTS.index(e["effect"]))
        for entry in entries:
            item = {"id": f'{len(designs) + 1:03}', "group": group, "rowLabel": label,
                    "column": EFFECTS.index(entry["effect"]), **entry}
            for kind in ("preview", "master"):
                source = ROOT / item[kind]
                assert source.is_file(), source
                with Image.open(source) as image:
                    assert image.width == image.height * 4
                    item[kind + "Dimensions"] = list(image.size)
                item[kind + "Sha256"] = digest(source)
                item[kind + "File"] = "01-design-files/" + item[kind]
            assert item["preview"] not in {d["preview"] for d in designs}
            designs.append(item)
            row["entries"].append(item)
        rows.append(row)

    original = "sources/tns-original-6336x1584.png"
    add("original", "Original banner reference", [{"effect": "clean", "caption": "ORIGINAL", "preview": original, "master": original}])
    early = json.loads((ROOT / "verification.json").read_text())
    add("early-ai", "Early generated braces", [{"effect": v["name"].lower(), "preview": v["linkedin"], "master": v["master"]} for v in early["variants"]])
    text = ROOT / "text-rendered"
    report = json.loads((text / "verification.json").read_text())
    assert report["completedDesigns"] == 28
    names = {"menlo": "Menlo", "departure-mono": "Departure Mono", "maple-mono": "Maple Mono", "lofi-forest-pixel": "Lofi Forest Pixel"}
    for font in report["fonts"]:
        add("text-braces", names[font["id"]] + " ASCII / Original words", [
            {"effect": v["effect"], "preview": "text-rendered/" + v["images"][0], "master": "text-rendered/" + v["images"][1]} for v in font["variants"]])
    mixed = "text-rendered/trial-previews/lofi-wordmark-departure-disintegrate/lofi-wordmark-departure-disintegrate"
    add("mixed-lofi", "Lofi Forest words / Departure Mono ASCII", [{"effect": "disintegrate", "preview": mixed + "-1584x396.png", "master": mixed + "-6336x1584.png"}])
    prefix = "text-rendered/trial-previews/three-trial-font-explorations/"
    trials = json.loads((ROOT / prefix / "verification.json").read_text())
    assert trials["designCount"] == 385
    for face in trials["faces"]:
        add(face["familyId"], face["label"] + " words / Departure ASCII", [
            {"effect": v["effect"], "preview": prefix + v["images"][0], "master": prefix + v["images"][1]} for v in face["variants"]])
    hollow = "text-rendered/trial-previews/electric-blue-hollow-disintegrate/electric-blue-hollow-disintegrate"
    add("hollow-electric-blue", "Electric Blue Regular hollow / Departure ASCII", [{
        "effect": "disintegrate", "preview": hollow + "-1584x396.png", "master": hollow + "-6336x1584.png"}])
    assert len(rows) == 63 and len(designs) == 422
    return rows, designs


def copy_all():
    blocked = {"all-chat-collection", "all-chat-collection.zip", "__pycache__", ".DS_Store", "lofi-forest-private-previews"}
    def eligible(path):
        parts = path.relative_to(ROOT).parts
        return path.is_file() and not (set(parts) & blocked) and not any(p.endswith("-private-previews") for p in parts)

    source_files = sorted(p for p in ROOT.rglob("*") if eligible(p))
    # Remove only duplicate extraction folders copied by a previous build of this collection.
    duplicates = [p for p in FILES.rglob("*") if p.is_dir() and p.name.endswith("-private-previews")]
    for duplicate in sorted(duplicates, key=lambda p: len(p.parts), reverse=True):
        if duplicate.exists():
            shutil.rmtree(duplicate)
    manifest = []
    for source in source_files:
        assert source.suffix.lower() not in {".ttf", ".otf", ".ttc", ".woff", ".woff2"}, source
        target = FILES / source.relative_to(ROOT)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        sha = digest(source)
        assert digest(target) == sha
        manifest.append({"file": str(target.relative_to(OUT)), "bytes": target.stat().st_size, "sha256": sha})
    print(f'Copied and hash-verified {len(manifest)} source deliverables.', flush=True)
    return manifest


def primitives(rows, subtitle):
    height = HEADER + len(rows) * ROW + FOOTER
    ops = [("rect", (0, 0, WIDTH, height), "#ffffff"),
           ("text", (MARGIN, 22), "TNS / COMPLETE CHAT VARIANT COLLECTION", BLUE, 36),
           ("text", (MARGIN, 70), subtitle, "#242b36", 24),
           ("text", (MARGIN, 108), "PRIVATE EVALUATION - IDs match manifest.csv - blank cells mean no design was made", "#5c6675", 18)]
    for column, effect in enumerate(EFFECTS):
        x = MARGIN + LABEL + column * (TW + GAP)
        ops.append(("text", (x + 8, 150), effect.upper(), BLUE, 22))
    for index, row in enumerate(rows):
        y = HEADER + index * ROW
        colour = COLOURS[row["group"]]
        ops.append(("rect", (MARGIN, y, MARGIN + LABEL - 16, y + ROW - 8), "#f3f5fb"))
        ops.append(("rect", (MARGIN, y, MARGIN + 5, y + ROW - 8), colour))
        label = row["label"].replace(" / ", " | ")
        lines = textwrap.wrap(label, width=21)
        assert len(lines) <= 6
        for line, value in enumerate(lines):
            ops.append(("text", (MARGIN + 18, y + 18 + line * 28), value, colour, 24))
        for entry in row["entries"]:
            x = MARGIN + LABEL + entry["column"] * (TW + GAP)
            caption = f'{entry["id"]}  {entry.get("caption", entry["effect"].upper())}'
            ops.append(("text", (x + 8, y + 2), caption, colour, 20))
            ops.append(("image", (x, y + 26, TW, TH), CHART / "thumbnails" / f'{entry["id"]}.png'))
    ops.append(("text", (MARGIN, height - 42), "Source files, highest-resolution exports, SVG text, prompts, code and previous ZIPs are preserved in 01-design-files.", "#5c6675", 20))
    return height, ops


def png_chart(rows, destination, subtitle):
    height, ops = primitives(rows, subtitle)
    image = Image.new("RGB", (WIDTH, height), "white")
    draw = ImageDraw.Draw(image)
    fonts = {size: ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", size) for size in (18, 20, 22, 24, 36)}
    for kind, xy, *args in ops:
        if kind == "rect":
            draw.rectangle(xy, fill=args[0])
        elif kind == "text":
            draw.text(xy, args[0], font=fonts[args[2]], fill=args[1], anchor="lt")
        else:
            with Image.open(args[0]) as thumb:
                image.paste(thumb, xy[:2])
    image.save(destination)
    assert Image.open(destination).size == (WIDTH, height)
    return [WIDTH, height]


def pdf_page(pdf, rows, subtitle):
    height, ops = primitives(rows, subtitle)
    scale = 0.25
    pdf.setPageSize((WIDTH * scale, height * scale))
    for kind, xy, *args in ops:
        if kind == "rect":
            x0, y0, x1, y1 = xy
            pdf.setFillColor(HexColor(args[0]))
            pdf.rect(x0 * scale, (height - y1) * scale, (x1 - x0) * scale, (y1 - y0) * scale, stroke=0, fill=1)
        elif kind == "text":
            value, colour, size = args
            pdf.setFillColor(HexColor(colour))
            pdf.setFont("Courier", size * scale)
            pdf.drawString(xy[0] * scale, (height - xy[1] - size) * scale, value)
        else:
            x, y, width, h = xy
            pdf.drawImage(str(args[0]), x * scale, (height - y - h) * scale, width=width * scale, height=h * scale)
    pdf.showPage()


def main():
    rows, designs = catalog()
    copied = copy_all()
    (CHART / "thumbnails").mkdir(parents=True, exist_ok=True)
    (CHART / "pages").mkdir(exist_ok=True)
    for design in designs:
        with Image.open(FILES / design["preview"]) as image:
            thumb = image.convert("RGB").resize((TW, TH), Image.Resampling.LANCZOS)
            thumb.save(CHART / "thumbnails" / f'{design["id"]}.png')
    counts = {g: sum(d["group"] == g for d in designs) for g in COLOURS}
    assert counts == {"original": 1, "early-ai": 6, "text-braces": 28, "mixed-lofi": 1, "thermochrome": 280, "electric-blue": 70, "metamorbit": 35, "hollow-electric-blue": 1}
    manifest = {"designs": designs, "groups": counts, "copiedFiles": copied, "privateEvaluation": True}
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    with (OUT / "manifest.csv").open("w", newline="") as file:
        columns = ["id", "group", "rowLabel", "effect", "previewFile", "masterFile", "previewDimensions", "masterDimensions"]
        writer = csv.DictWriter(file, columns)
        writer.writeheader()
        writer.writerows({key: str(d[key]) if isinstance(d[key], list) else d[key] for key in columns} for d in designs)
    subtitle = "422 designs = 1 original + 6 generated + 28 text braces + 1 mixed-font + 385 trial-font + 1 hollow"
    full = CHART / f'all-{len(designs)}-designs.png'
    chart_size = png_chart(rows, full, subtitle)
    print(f'Created full chart: {chart_size[0]} x {chart_size[1]} pixels.', flush=True)
    pages = []
    for start in range(0, len(rows), 8):
        section = rows[start:start + 8]
        page = CHART / "pages" / f'page-{start // 8 + 1:02}.png'
        png_chart(section, page, f'Detail page {start // 8 + 1}/8 | IDs {section[0]["entries"][0]["id"]}-{section[-1]["entries"][-1]["id"]}')
        pages.append(page)
    pdf_folder = CHART / "output/pdf"
    pdf_folder.mkdir(parents=True, exist_ok=True)
    pdf_path = pdf_folder / "complete-variant-chart.pdf"
    pdf = canvas.Canvas(str(pdf_path), pageCompression=1)
    pdf.setTitle(f"TNS - all {len(designs)} chat designs")
    pdf.setAuthor("TNS")
    pdf.bookmarkPage("full")
    pdf.addOutlineEntry(f"All {len(designs)} designs", "full", 0)
    pdf_page(pdf, rows, subtitle)
    for start in range(0, len(rows), 8):
        key = f'page-{start // 8 + 1:02}'
        pdf.bookmarkPage(key)
        pdf.addOutlineEntry(f'Detail page {start // 8 + 1}', key, 0)
        pdf_page(pdf, rows[start:start + 8], f'Detail page {start // 8 + 1}/8 | Original sizes and IDs are in manifest.csv')
    pdf.save()
    reader = PdfReader(pdf_path)
    assert len(reader.pages) == 9
    page_text = reader.pages[0].extract_text()
    for design in designs:
        assert f'{design["id"]}  ' in page_text
    page_links = "\n".join(f'- [Chart detail page {i + 1}](02-variant-chart/pages/{p.name})' for i, p in enumerate(pages))
    (OUT / "README.md").write_text(f'''# TNS - complete chat collection

**{len(designs)} designs: the original plus {len(designs) - 1} variants.** All earlier deliverables are copied byte-for-byte into `01-design-files/`, retaining their original folder structure. The original working files remain untouched.

- [Massive chart PNG](02-variant-chart/{full.name}) - {chart_size[0]} x {chart_size[1]} pixels; zoom to read each cell.
- [Complete chart PDF](02-variant-chart/output/pdf/complete-variant-chart.pdf) - the entire chart on page 1, followed by eight detail pages.
- [Design index CSV](manifest.csv) - IDs, font/style/effect labels, exact file paths and actual dimensions.
- [Full manifest](manifest.json) - includes copied-file hashes and all design records.

| Set | Designs |
|---|---:|
| Original banner | 1 |
| Early generated brace variants | 6 |
| Menlo, Departure Mono, Maple Mono and Lofi Forest ASCII braces | 28 |
| Lofi Forest wordmark with Departure Mono disintegration | 1 |
| Thermochrome wordmarks across seven Departure effects | 280 |
| Electric Blue wordmarks across seven Departure effects | 70 |
| MetamorBit width variations across seven Departure effects | 35 |
| Hollow Electric Blue Regular with Departure disintegration | 1 |

## Readable chart pages

{page_links}

The chart has one row per font/style or design set and columns for Clean, Oversized, Tilted, Perspective, Trails, Dissolve and Disintegrate. The original reference appears in the first column. Blank cells correspond to combinations that were never made. Each cell's three-digit ID matches the index. Alternate resolutions, raw generated sources, editable SVGs, prompts, renderers, configuration, prior comparisons and earlier ZIPs are preserved with the design files.

This combined collection is private evaluation material because it includes trial-font previews. Font binaries, system metadata, Python caches and duplicate user-extracted ZIP contents are excluded. The trial ZIPs supplied as input remain in Downloads; no font files are embedded in this collection.
''')
    verification = {"designCount": len(designs), "rowCount": len(rows), "counts": counts,
                    "copiedFileCount": len(copied), "copyHashesMatch": True, "chartDimensions": chart_size,
                    "detailCharts": len(pages), "pdfPages": len(reader.pages), "allDesignIdsInPdf": True,
                    "fontBinariesExcluded": True, "sourceFilesPreserved": True}
    (OUT / "verification.json").write_text(json.dumps(verification, indent=2) + "\n")
    archive = ROOT / "all-chat-collection.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for file in sorted(OUT.rglob("*")):
            if file.is_file():
                z.write(file, file.relative_to(ROOT))
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        assert not any(Path(n).suffix.lower() in {".ttf", ".otf", ".ttc", ".woff", ".woff2"} for n in z.namelist())
        assert len(z.namelist()) == len([p for p in OUT.rglob("*") if p.is_file()])
    print(f'COMPLETE: {OUT}\nBundle: {archive}\n{len(designs)} designs, {len(copied)} copied deliverables, 9 PDF pages.', flush=True)


if __name__ == "__main__":
    main()
