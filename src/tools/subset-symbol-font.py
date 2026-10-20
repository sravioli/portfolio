"""Keep the symbol font limited to glyphs referenced by application source."""

from pathlib import Path
import re

from fontTools import subset
from fontTools.ttLib import TTFont


APP = Path(__file__).resolve().parents[1] / "Srv.Portfolio"
FONT_DIRECTORY = APP / "wwwroot" / "fonts"
SOURCE_FONT = FONT_DIRECTORY / "SymbolsNerdFont-Regular.woff2"
TARGET_FONT = FONT_DIRECTORY / "SymbolsNerdFont-Subset.woff2"
SOURCE_EXTENSIONS = {".cs", ".razor", ".css", ".js", ".html"}


def codepoints(text):
    result = set(map(ord, text))
    for pattern, base in [
        (r"&#[xX]([0-9a-fA-F]+);", 16),
        (r"&#([0-9]+);", 10),
        (r"\\u\{([0-9a-fA-F]+)\}", 16),
        (r"\\u([0-9a-fA-F]{4})", 16),
        (r"\\U([0-9a-fA-F]{8})", 16),
        (r"\\([0-9a-fA-F]{1,6})(?:\s|(?=[^0-9a-fA-F])|$)", 16),
    ]:
        result.update(int(value, base) for value in re.findall(pattern, text))
    return result


def referenced_codepoints(root):
    result = set()
    for path in sorted(root.rglob("*")):
        if path.suffix in SOURCE_EXTENSIONS and not {"bin", "obj"} & set(path.parts):
            result.update(codepoints(path.read_text(encoding="utf-8-sig")))
    return result


def build_subset(source, target, references):
    with TTFont(source, recalcTimestamp=False) as font:
        required = references & font.getBestCmap().keys()
        if not required:
            raise ValueError("No referenced symbol glyphs found.")
        options = subset.Options()
        options.flavor = "woff2"
        options.recalc_timestamp = False
        options.drop_tables += ["PfEd"]
        subsetter = subset.Subsetter(options=options)
        subsetter.populate(unicodes=required)
        subsetter.subset(font)
        font.save(target)
    with TTFont(target) as font:
        missing = required - font.getBestCmap().keys()
        if missing:
            raise ValueError(f"Subset is missing glyphs: {sorted(missing)}")
    return len(required)


if __name__ == "__main__":
    count = build_subset(SOURCE_FONT, TARGET_FONT, referenced_codepoints(APP))
    print(
        f"Symbol font: {count} glyphs, "
        f"{SOURCE_FONT.stat().st_size:,} -> {TARGET_FONT.stat().st_size:,} bytes"
    )
