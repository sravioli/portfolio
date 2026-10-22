"""Subset the production Fira Code font to text present in the built site."""

from html.parser import HTMLParser
import os
from pathlib import Path
import tempfile

from fontTools import subset
from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parents[2]
DIST_DIRECTORY = ROOT / "dist"
SOURCE_DIRECTORY = ROOT / "src"
SOURCE_FONT = ROOT / "public" / "fonts" / "FiraCode-VF.woff2"
TARGET_FONT = DIST_DIRECTORY / "fonts" / "FiraCode-VF.woff2"
SOURCE_EXTENSIONS = {".astro", ".css", ".js", ".md", ".ts"}
TEXT_ATTRIBUTES = {"alt", "aria-label", "content", "placeholder", "title", "value"}


class HtmlText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.fragments = []

    def handle_data(self, data):
        self.fragments.append(data)

    def handle_starttag(self, tag, attrs):
        self.fragments.extend(
            value
            for name, value in attrs
            if name in TEXT_ATTRIBUTES and value is not None
        )

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)


def site_text(dist_directory, source_directory):
    fragments = []
    html_files = sorted(dist_directory.rglob("*.html"))
    if not html_files:
        raise ValueError(f"No generated HTML found in {dist_directory}")

    for path in html_files:
        parser = HtmlText()
        parser.feed(path.read_text(encoding="utf-8"))
        parser.close()
        fragments.extend(parser.fragments)

    for path in sorted(dist_directory.rglob("*.md")):
        fragments.append(path.read_text(encoding="utf-8"))

    for path in sorted(source_directory.rglob("*")):
        if path.is_file() and path.suffix in SOURCE_EXTENSIONS:
            fragments.append(path.read_text(encoding="utf-8"))

    return "".join(fragments)


def build_subset(source, target, text):
    with TTFont(source, recalcTimestamp=False) as original:
        original_cmap = original.getBestCmap()
        required = {ord(character) for character in text} & original_cmap.keys()
        variable_font = "fvar" in original
        if not required:
            raise ValueError("No supported Fira Code characters found.")

    with TTFont(source, recalcTimestamp=False) as font:
        options = subset.Options()
        options.flavor = "woff2"
        options.recalc_timestamp = False
        options.layout_features = ["*"]
        options.name_IDs = ["*"]
        options.name_legacy = True
        options.name_languages = ["*"]
        subsetter = subset.Subsetter(options=options)
        subsetter.populate(text=text)
        subsetter.subset(font)

        target.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            prefix=f".{target.name}.",
            suffix=".tmp",
            dir=target.parent,
            delete=False,
        ) as temporary:
            temporary_path = Path(temporary.name)

        try:
            font.save(temporary_path)
            with TTFont(temporary_path, recalcTimestamp=False) as generated:
                missing = required - generated.getBestCmap().keys()
                if missing:
                    raise ValueError(f"Subset is missing glyphs: {sorted(missing)}")
                if variable_font and "fvar" not in generated:
                    raise ValueError("Subset did not preserve variable font axes.")
            os.replace(temporary_path, target)
        finally:
            if temporary_path.exists():
                temporary_path.unlink()

    return len(required)


def main():
    text = site_text(DIST_DIRECTORY, SOURCE_DIRECTORY)
    count = build_subset(SOURCE_FONT, TARGET_FONT, text)
    print(
        f"Fira Code: {count} glyphs, "
        f"{SOURCE_FONT.stat().st_size:,} -> {TARGET_FONT.stat().st_size:,} bytes"
    )


if __name__ == "__main__":
    main()
