# Contributing

Thanks for your interest in improving this project.

## Before you start

- Search existing issues and pull requests to avoid duplicates.
- Keep changes focused and reviewable.
- Use clear, conventional commit messages when committing locally.

## Development setup

1. Install .NET 10 SDK.
2. Restore dependencies:
   - `dotnet restore .\Srv.Portfolio.slnx`
3. Build:
   - `dotnet build .\Srv.Portfolio.slnx`
4. Run tests:
   - `dotnet test .\tests\Srv.Portfolio.Tests\Srv.Portfolio.Tests.csproj`

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

Do not open public issues for vulnerabilities. Follow `SECURITY.md`.
