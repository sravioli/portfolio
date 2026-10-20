using System.Text.Json;
using Srv.Portfolio.Models;
using Srv.Portfolio.Rendering;
using Srv.Portfolio.Services;

namespace Srv.Portfolio.ContentGenerator;

internal static class ReadmeSnapshotGenerator
{
    internal static async Task VerifyAsync(string outputDirectory, CancellationToken cancellationToken = default)
    {
        foreach (var entry in PortfolioCatalog.AllEntries().Where(entry =>
            entry.HasReadme && !entry.IsReadmeLocal))
        {
            var path = Path.Combine(outputDirectory, ReadmeSnapshot.AssetPath(entry));
            if (!File.Exists(path))
            {
                throw new FileNotFoundException(
                    "README snapshot missing. Run the content generator with --readmes <wwwroot> before publishing.", path);
            }
            await using var input = File.OpenRead(path);
            var snapshot = await JsonSerializer.DeserializeAsync(
                input, ReadmeSnapshotJsonContext.Default.ReadmeSnapshot, cancellationToken).ConfigureAwait(false);
            if (snapshot is null || !snapshot.Matches(entry))
            {
                throw new JsonException($"Invalid README snapshot: {path}.");
            }
        }
    }

    internal static async Task GenerateAsync(
        string outputDirectory,
        Func<PortfolioEntry, CancellationToken, Task<string>> readSource,
        CancellationToken cancellationToken = default)
    {
        var renderer = new MarkdownRenderer();
        foreach (var entry in PortfolioCatalog.AllEntries().Where(entry =>
            entry.HasReadme && !entry.IsReadmeLocal))
        {
            cancellationToken.ThrowIfCancellationRequested();
            var source = await readSource(entry, cancellationToken).ConfigureAwait(false);
            cancellationToken.ThrowIfCancellationRequested();
            var snapshot = new ReadmeSnapshot(
                entry.Repository, entry.ReadmePath!, source, renderer.Render(source, entry));
            var path = Path.Combine(outputDirectory, ReadmeSnapshot.AssetPath(entry));
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            await using var output = File.Create(path);
            await JsonSerializer.SerializeAsync(
                output, snapshot, ReadmeSnapshotJsonContext.Default.ReadmeSnapshot,
                cancellationToken).ConfigureAwait(false);
        }
    }
}
