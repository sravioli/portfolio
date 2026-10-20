using System.Text.Json;
using Srv.Portfolio.ContentGenerator;
using Srv.Portfolio.Models;
using Srv.Portfolio.Services;

namespace Srv.Portfolio.Tests.Services;

[TestFixture]
internal sealed class ReadmeSnapshotGeneratorTests
{
    private string _directory = null!;

    [SetUp]
    public void SetUp() => _directory = Directory.CreateTempSubdirectory("portfolio-snapshots-").FullName;

    [TearDown]
    public void TearDown() => Directory.Delete(_directory, recursive: true);

    [Test]
    public async Task GenerateAsync_ExternalCatalog_WritesMatchingSanitizedSourceAndHtml()
    {
        const string source = "# Fixture\n\n<script>alert(1)</script>\n\n[Guide](guide.md)\n\n![Image](image.png)";
        var entries = new List<PortfolioEntry>();
        await ReadmeSnapshotGenerator.GenerateAsync(_directory, (entry, _) =>
        {
            entries.Add(entry);
            return Task.FromResult(source);
        });
        var external = PortfolioCatalog.AllEntries().Where(entry =>
            entry.HasReadme && !entry.IsReadmeLocal).ToArray();

        Assert.That(entries, Is.EqualTo(external));
        Assert.That(Directory.GetFiles(_directory, "*.json", SearchOption.AllDirectories), Has.Length.EqualTo(external.Length));
        foreach (var entry in external)
        {
            var json = await File.ReadAllTextAsync(Path.Combine(_directory, ReadmeSnapshot.AssetPath(entry)));
            var snapshot = JsonSerializer.Deserialize(json, ReadmeSnapshotJsonContext.Default.ReadmeSnapshot)!;
            using (Assert.EnterMultipleScope())
            {
                Assert.That(snapshot.Repository, Is.EqualTo(entry.Repository));
                Assert.That(snapshot.ReadmePath, Is.EqualTo(entry.ReadmePath));
                Assert.That(snapshot.Source, Is.EqualTo(source));
                Assert.That(snapshot.Html, Is.EqualTo(MarkdownProcessor.Render(source, entry)));
                Assert.That(snapshot.Html, Does.Not.Contain("<script"));
            }
        }
        await ReadmeSnapshotGenerator.VerifyAsync(_directory);
    }

    [Test]
    public async Task VerifyAsync_MissingSnapshot_RejectsIncompletePublish()
    {
        await Assert.ThrowsAsync<FileNotFoundException>(async () =>
            await ReadmeSnapshotGenerator.VerifyAsync(_directory));
    }

    [Test]
    public async Task VerifyAsync_InvalidSnapshot_RejectsPublish()
    {
        await ReadmeSnapshotGenerator.GenerateAsync(_directory, (_, _) => Task.FromResult("# Valid"));
        var entry = PortfolioCatalog.Find("chrono")!;
        await File.WriteAllTextAsync(Path.Combine(_directory, ReadmeSnapshot.AssetPath(entry)), "{}");

        await Assert.ThrowsAsync<JsonException>(async () =>
            await ReadmeSnapshotGenerator.VerifyAsync(_directory));
    }

    [Test]
    public async Task GenerateAsync_FailedFetch_PropagatesFailureWithoutPublishingSnapshot()
    {
        await Assert.ThrowsAsync<HttpRequestException>(async () =>
            await ReadmeSnapshotGenerator.GenerateAsync(_directory, (_, _) =>
                Task.FromException<string>(new HttpRequestException("Fixture failure"))));
        Assert.That(Directory.GetFiles(_directory, "*.json", SearchOption.AllDirectories), Is.Empty);
    }

    [Test]
    public async Task GenerateAsync_CanceledAfterFetch_DoesNotRenderOrWriteSnapshot()
    {
        using var cancellation = new CancellationTokenSource();
        await Assert.ThrowsAsync<OperationCanceledException>(async () =>
            await ReadmeSnapshotGenerator.GenerateAsync(_directory, (_, _) =>
            {
                cancellation.Cancel();
                return Task.FromResult("# Canceled");
            }, cancellation.Token));
        Assert.That(Directory.GetFiles(_directory, "*.json", SearchOption.AllDirectories), Is.Empty);
    }
}
