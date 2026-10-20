# Contributing

Thanks for your interest in improving this project.

## Before you start

- Search existing issues and pull requests to avoid duplicates.
- Keep changes focused and reviewable.
- Use clear, conventional commit messages when committing locally.

## Development setup

1. Install .NET 10 SDK and the native WebAssembly workload:
   - `dotnet workload install wasm-tools`
2. Restore dependencies:
   - `dotnet restore .\Srv.Portfolio.slnx`
3. Build:
   - `dotnet build .\Srv.Portfolio.slnx`
4. Run tests:
   - `dotnet test --solution .\Srv.Portfolio.slnx`
   - Tests use NUnit and the native Microsoft.Testing.Platform runner selected by `global.json`.
   - For coverage: `dotnet test --solution .\Srv.Portfolio.slnx --coverlet --coverlet-output-format cobertura --results-directory TestResults`

The root README HTML is generated under the app's `obj/` directory during builds.
Edit `src/Srv.Portfolio.Content/Services/RootReadmeContent.cs` to change its source.
The generator and browser use the same sanitizer and Markdown transformations.
External READMEs are sanitized and rendered before deployment. Prepare the ignored
snapshot files before running the browser locally:

```powershell
dotnet run --project .\src\Srv.Portfolio.ContentGenerator -c Release -- --readmes .\src\Srv.Portfolio\wwwroot
```

This command fetches the catalog's external READMEs from GitHub and fails if any
fetch/render fails. Normal builds/tests stay offline. Re-run generation after
changing catalog paths or renderer behavior. See
[README snapshots](../docs/readme-snapshots.md) for offline fixture input and
[performance checks](../docs/performance.md) for benchmark commands and limitations.
The generated plugin collection still lazy-loads the renderer; verify both that
path and external snapshots in a Release browser publish when changing renderer
dependencies or the lazy assembly list.

## Coding expectations

- Follow the repository conventions and existing patterns.
- Add or update tests for behavior changes.
- Avoid unrelated formatting-only changes in functional pull requests.

## Pull request checklist

- [ ] The change is scoped to a single purpose.
- [ ] Tests were added or updated when behavior changed.
- [ ] `dotnet build` and `dotnet test` pass locally.
- [ ] README/docs were updated when user-facing behavior changed.

## Reporting bugs

Use the bug report issue template and include:

- Reproduction steps
- Expected behavior
- Actual behavior
- Relevant logs/screenshots

## Security issues

Do not open public issues for vulnerabilities. Follow the [security policy](SECURITY.md).
