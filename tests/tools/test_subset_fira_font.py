import importlib.util
from pathlib import Path
import tempfile
import unittest

from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "subset_fira_font", ROOT / "src" / "tools" / "subset-fira-font.py"
)
FONT_TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(FONT_TOOL)


class FiraFontTests(unittest.TestCase):
    def test_site_text_includes_html_text_attributes_raw_markdown_and_sources(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            dist = root / "dist"
            source = root / "src"
            dist.mkdir()
            source.mkdir()
            (dist / "index.html").write_text(
                '<p title="tooltip">Rendered &amp; escaped</p>', encoding="utf-8"
            )
            (dist / "readme.md").write_text("Raw _Markdown_", encoding="utf-8")
            (dist / "featured.md").mkdir()
            (dist / "featured.md" / "index.html").write_text("<p>Page</p>", encoding="utf-8")
            (source / "view.ts").write_text("const label = 'source text';", encoding="utf-8")

            text = FONT_TOOL.site_text(dist, source)

            self.assertIn("Rendered & escaped", text)
            self.assertIn("tooltip", text)
            self.assertIn("Raw _Markdown_", text)
            self.assertIn("source text", text)

    def test_built_subset_preserves_supported_glyphs_metrics_and_variation_axes(self):
        if not FONT_TOOL.TARGET_FONT.is_file():
            self.skipTest("Run npm run build to generate the production font subset.")

        text = FONT_TOOL.site_text(FONT_TOOL.DIST_DIRECTORY, FONT_TOOL.SOURCE_DIRECTORY)
        with TTFont(FONT_TOOL.SOURCE_FONT) as original, TTFont(FONT_TOOL.TARGET_FONT) as shipped:
            original_cmap = original.getBestCmap()
            shipped_cmap = shipped.getBestCmap()
            required = {ord(character) for character in text} & original_cmap.keys()
            self.assertTrue(required)
            self.assertEqual(required, required & shipped_cmap.keys())
            self.assertEqual("fvar" in original, "fvar" in shipped)

            for point in required:
                original_glyph = original_cmap[point]
                shipped_glyph = shipped_cmap[point]
                self.assertEqual(
                    original["hmtx"][original_glyph],
                    shipped["hmtx"][shipped_glyph],
                )
                self.assertEqual(
                    original["glyf"][original_glyph].getCoordinates(original["glyf"]),
                    shipped["glyf"][shipped_glyph].getCoordinates(shipped["glyf"]),
                )

        self.assertLess(FONT_TOOL.TARGET_FONT.stat().st_size, FONT_TOOL.SOURCE_FONT.stat().st_size)

    def test_build_subset_is_reproducible(self):
        if not FONT_TOOL.TARGET_FONT.is_file():
            self.skipTest("Run npm run build to generate the production font subset.")

        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / "subset.woff2"
            text = FONT_TOOL.site_text(FONT_TOOL.DIST_DIRECTORY, FONT_TOOL.SOURCE_DIRECTORY)
            FONT_TOOL.build_subset(FONT_TOOL.SOURCE_FONT, target, text)
            self.assertEqual(target.read_bytes(), FONT_TOOL.TARGET_FONT.read_bytes())


if __name__ == "__main__":
    unittest.main()
