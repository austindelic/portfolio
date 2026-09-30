"""Focused checks for actual font identity, source editability, and the protected brace."""
import json
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET

from PIL import Image

import render


class TextBannerTests(unittest.TestCase):
    def test_missing_and_wrong_fonts_fail_without_substitution(self):
        with self.assertRaises(FileNotFoundError):
            render.font_path({"family": "Missing", "path": "/private/tmp/tns-nonexistent-font.ttf"})
        departure = render.CONFIG["fonts"][1]
        menlo = render.font_path(render.CONFIG["fonts"][0])
        with self.assertRaises(ValueError):
            render.validate_font(departure, menlo)

    def test_disintegration_fades_only_the_opening_brace(self):
        for spec in render.CONFIG["fonts"]:
            try:
                path = render.font_path(spec)
            except FileNotFoundError:
                if spec["trial"]:
                    continue
                raise
            with self.subTest(font=spec["id"]):
                clean, boundary = render.make_cells(path, "clean")
                dissolved, other_boundary = render.make_cells(path, "disintegrate")
                self.assertEqual(boundary, other_boundary)
                self.assertEqual([c for c in clean if c["part"] == "closing"],
                                 [c for c in dissolved if c["part"] == "closing"])
                opening = [c for c in clean if c["part"] == "opening"]
                retained = [c for c in dissolved if c["part"] == "opening"]
                self.assertLess(len(retained), len(opening))
                opacity = {(c["x"], c["y"]): c["opacity"] for c in opening}
                self.assertTrue(all(c["opacity"] <= opacity[(c["x"], c["y"])] for c in retained))
                samples = sorted((c["x"], c["opacity"] / opacity[(c["x"], c["y"])]) for c in retained)
                middle = (min(c["x"] for c in opening) + max(c["x"] for c in opening)) / 2
                left = [v for x, v in samples if x < middle]
                right = [v for x, v in samples if x >= middle]
                self.assertGreater(sum(right) / len(right), sum(left) / len(left))
                for scale in (1, 4):
                    region = (boundary * scale, 0, render.AW * scale, render.H * scale)
                    self.assertEqual(render.draw_cells(clean, path, scale).crop(region).tobytes(),
                                     render.draw_cells(dissolved, path, scale).crop(region).tobytes())
                self.assertEqual(render.draw_cells(dissolved, path, 1).tobytes(),
                                 render.draw_cells(render.make_cells(path, "disintegrate")[0], path, 1).tobytes())

    def test_exports_have_editable_text_and_untouched_branding(self):
        report = json.loads((render.BASE / "verification.json").read_text())
        self.assertTrue(report["originalUnchanged"])
        self.assertEqual(report["originalSha256"], render.digest(render.ORIGINAL))
        self.assertEqual(report["completedDesigns"], 7 * len(report["fonts"]))
        namespace = "{http://www.w3.org/2000/svg}"
        for font in report["fonts"]:
            self.assertEqual(len(font["variants"]), 7)
            for record in font["variants"]:
                with self.subTest(font=font["id"], effect=record["effect"]):
                    tree = ET.parse(render.BASE / record["svg"])
                    texts = tree.findall(".//" + namespace + "text")
                    self.assertEqual(len(texts), record["glyphCount"])
                    self.assertTrue(all(len(t.text or "") == 1 and t.text in render.CONFIG["glyphs"] for t in texts))
                    self.assertFalse(tree.findall(".//" + namespace + "image"))
                    for scale, file in zip((1, 4), record["images"]):
                        with Image.open(render.BASE / file) as image:
                            image.load()
                            self.assertEqual(image.size, (render.W * scale, render.H * scale))
                            region = (round(render.W * 0.485) * scale, 0, render.W * scale, render.H * scale)
                            self.assertEqual(image.crop(region).tobytes(), render.branding_plate(scale).crop(region).tobytes())


if __name__ == "__main__":
    unittest.main()
