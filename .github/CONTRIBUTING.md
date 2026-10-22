# Contributing

Thanks for your interest in improving this project.

## Before you start

- Search existing issues and pull requests to avoid duplicates.
- Keep changes focused and reviewable.
- Use clear, conventional commit messages when committing locally.

## Development setup

1. Install Node.js 24 or later, then install dependencies:
   - `npm ci`
2. Run the development server:
   - `npm run dev`
3. Type-check:
   - `npm run check`
4. Run tests:
   - `npm test`
   - Tests use the built-in `node:test` runner.
5. Build the static site into `dist/`, then preview it:
   - `npm run build`
   - `npm run preview`

Builds fetch the catalog's external READMEs from GitHub and fail if any fetch fails.
For offline builds, point `PORTFOLIO_README_DIR` at a directory with one
`<repository>.md` file per external catalog entry. Edit
`src/build/readmes.ts` to change the root README. See
[README snapshots](../docs/readme-snapshots.md) for the content pipeline and
[performance](../docs/performance.md) for payload measurements.

The symbol font is subset to the glyphs used in `src/`. After adding or removing a
Nerd Font icon, regenerate it with Python 3.14:

```powershell
python -m pip install -r .\src\tools\font-requirements.txt
python .\src\tools\subset-symbol-font.py
python -m unittest discover -s .\tests\tools
```

## Coding expectations

- Follow the repository conventions and existing patterns.
- Add or update tests for behavior changes.
- Avoid unrelated formatting-only changes in functional pull requests.

## Pull request checklist

- [ ] The change is scoped to a single purpose.
- [ ] Tests were added or updated when behavior changed.
- [ ] `npm run check`, `npm test`, and `npm run build` pass locally.
- [ ] README/docs were updated when user-facing behavior changed.

## Reporting bugs

Use the bug report issue template and include:

- Reproduction steps
- Expected behavior
- Actual behavior
- Relevant logs/screenshots

## Security issues

Do not open public issues for vulnerabilities. Follow the [security policy](SECURITY.md).
