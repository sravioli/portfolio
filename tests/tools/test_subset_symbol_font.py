import importlib.util
from pathlib import Path
import tempfile
import unittest

from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "subset_symbol_font", ROOT / "src" / "tools" / "subset-symbol-font.py"
)
FONT_TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(FONT_TOOL)


class SymbolFontTests(unittest.TestCase):
    def test_codepoints_recognizes_source_escape_formats(self):
        text = "\uf48a &#xf002; &#983627; " + r"\u{f0645} \ue712 \U000f0770 \f0c9 "
        expected = {0xF48A, 0xF002, 983627, 0xF0645, 0xE712, 0xF0770, 0xF0C9}
        self.assertTrue(expected <= FONT_TOOL.codepoints(text))

    def test_references_excludes_build_output(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "view.ts").write_text("&#xf002;", encoding="utf-8")
            (root / "node_modules").mkdir()
            (root / "node_modules" / "generated.js").write_text(r"\u{f0770}", encoding="utf-8")
            references = FONT_TOOL.referenced_codepoints(root)
            self.assertIn(0xF002, references)
            self.assertNotIn(0xF0770, references)

    def test_shipped_subset_contains_every_referenced_glyph(self):
        with TTFont(FONT_TOOL.SOURCE_FONT) as original, TTFont(FONT_TOOL.TARGET_FONT) as shipped:
            required = (
                FONT_TOOL.referenced_codepoints(FONT_TOOL.SOURCE_DIRECTORY)
                & original.getBestCmap().keys()
            )
            self.assertTrue(required)
            self.assertEqual(required, shipped.getBestCmap().keys())
            for point in required:
                original_glyph = original.getBestCmap()[point]
                shipped_glyph = shipped.getBestCmap()[point]
                self.assertEqual(
                    original["hmtx"][original_glyph],
                    shipped["hmtx"][shipped_glyph],
                )
                self.assertEqual(
                    original["glyf"][original_glyph].getCoordinates(original["glyf"]),
                    shipped["glyf"][shipped_glyph].getCoordinates(shipped["glyf"]),
                )
        self.assertLess(FONT_TOOL.TARGET_FONT.stat().st_size, 20_000)

    def test_build_subset_is_reproducible(self):
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / "subset.woff2"
            FONT_TOOL.build_subset(
                FONT_TOOL.SOURCE_FONT,
                target,
                FONT_TOOL.referenced_codepoints(FONT_TOOL.SOURCE_DIRECTORY),
            )
            self.assertEqual(target.read_bytes(), FONT_TOOL.TARGET_FONT.read_bytes())


if __name__ == "__main__":
    unittest.main()
