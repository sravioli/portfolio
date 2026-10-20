using System.Net;
using System.Text.Json;
using Srv.Portfolio.Services;

namespace Srv.Portfolio.Tests.Services;

[TestFixture]
internal sealed class ReadmeServiceTests : IDisposable
{
    private readonly List<HttpClient> _clients = [];

    public void Dispose()
    {
        foreach (var client in _clients)
            client.Dispose();
    }

    [Test]
    public async Task RenderAsync_UnchangedSource_ReusesSanitizedHtml()
    {
        using var handler = new RecordingHandler();
        var service = CreateService(handler);
        const string source = "# Cached\n\n<script>alert(1)</script>\n\nText";

        var first = await service.RenderAsync(source, PortfolioCatalog.RootEntry);
        var second = await service.RenderAsync(new string(source.ToCharArray()), PortfolioCatalog.RootEntry);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(first, Does.Contain("id=\"readme-cached\""));
            Assert.That(first, Does.Not.Contain("<script"));
            Assert.That(second, Is.SameAs(first));
            Assert.That(handler.RequestCount, Is.Zero);
        }
    }

    [Test]
    public async Task RenderAsync_ChangedSource_ReplacesCachedHtml()
    {
        using var handler = new RecordingHandler();
        var service = CreateService(handler);
        await service.RenderAsync("# Original", PortfolioCatalog.RootEntry);

        var updated = await service.RenderAsync("# Updated", PortfolioCatalog.RootEntry);
        var repeated = await service.RenderAsync("# Updated", PortfolioCatalog.RootEntry);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(updated, Does.Contain("id=\"readme-updated\""));
            Assert.That(updated, Does.Not.Contain("Original"));
            Assert.That(repeated, Is.SameAs(updated));
        }
    }

    [Test]
    public async Task RenderAsync_DifferentRepositoryOrPath_ResolvesEachContext()
    {
        using var handler = new RecordingHandler();
        var service = CreateService(handler);
        var chrono = PortfolioCatalog.Find("chrono")!;
        const string source = "[Guide](guide.md)";

        var first = await service.RenderAsync(source, chrono);
        var repository = await service.RenderAsync(source, chrono with { Repository = "wezterm" });
        var path = await service.RenderAsync(source, chrono with { ReadmePath = "docs/README.md" });

        using (Assert.EnterMultipleScope())
        {
            Assert.That(first, Does.Contain("/chrono/blob/main/.github/guide.md"));
            Assert.That(repository, Does.Contain("/wezterm/blob/main/.github/guide.md"));
            Assert.That(path, Does.Contain("/chrono/blob/main/docs/guide.md"));
        }
    }

    [Test]
    public async Task RenderAsync_RootReadme_UsesBuildTimeHtmlWithoutLoadingRenderer()
    {
        using var handler = new RecordingHandler();
        var loader = new RecordingRendererLoader();
        var service = CreateService(handler, renderer: loader);

        var source = await service.GetAsync(PortfolioCatalog.RootEntry, CancellationToken.None);
        var html = await service.RenderAsync(source, PortfolioCatalog.RootEntry);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(html, Is.EqualTo(MarkdownProcessor.Render(source, PortfolioCatalog.RootEntry)));
            Assert.That(loader.LoadCount, Is.Zero);
            Assert.That(handler.RequestCount, Is.Zero);
        }
    }

    [Test]
    public async Task RenderAsync_CachedExternalReadme_LoadsRendererOnlyOnce()
    {
        using var handler = new RecordingHandler();
        var loader = new RecordingRendererLoader();
        var service = CreateService(handler, renderer: loader);
        var entry = PortfolioCatalog.Find("chrono")!;

        var first = await service.RenderAsync("# External", entry);
        var second = await service.RenderAsync("# External", entry);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(first, Does.Contain("id=\"readme-external\""));
            Assert.That(second, Is.SameAs(first));
            Assert.That(loader.LoadCount, Is.EqualTo(1));
        }
    }

    [Test]
    public async Task RenderAsync_CanceledRequest_DoesNotLoadRenderer()
    {
        using var handler = new RecordingHandler();
        var loader = new RecordingRendererLoader();
        var service = CreateService(handler, renderer: loader);
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();

        await Assert.ThrowsAsync<OperationCanceledException>(async () =>
            await service.RenderAsync("# External", PortfolioCatalog.Find("chrono")!, cancellation.Token));
        Assert.That(loader.LoadCount, Is.Zero);
    }

    [Test]
    public async Task RenderAsync_CanceledWhileLoading_DoesNotCancelSharedLoad()
    {
        using var handler = new RecordingHandler();
        var pending = new TaskCompletionSource<IMarkdownRenderer>(
            TaskCreationOptions.RunContinuationsAsynchronously);
        var loader = new RecordingRendererLoader(() => pending.Task);
        var service = CreateService(handler, renderer: loader);
        var entry = PortfolioCatalog.Find("chrono")!;
        using var cancellation = new CancellationTokenSource();

        var canceled = service.RenderAsync("# Canceled", entry, cancellation.Token);
        cancellation.Cancel();
        await Assert.ThrowsAsync<TaskCanceledException>(async () => await canceled);

        var next = service.RenderAsync("# Current", entry);
        pending.SetResult(new Rendering.MarkdownRenderer());
        var html = await next;

        using (Assert.EnterMultipleScope())
        {
            Assert.That(html, Does.Contain("id=\"readme-current\""));
            Assert.That(html, Does.Not.Contain("Canceled"));
            Assert.That(pending.Task.IsCompletedSuccessfully, Is.True);
        }
    }

    [Test]
    public async Task RenderAsync_FailedLoad_SurfacesErrorAndAllowsRetry()
    {
        using var handler = new RecordingHandler();
        var attempts = 0;
        var loader = new RecordingRendererLoader(() => ++attempts == 1
            ? Task.FromException<IMarkdownRenderer>(new HttpRequestException("Download failed"))
            : Task.FromResult<IMarkdownRenderer>(new Rendering.MarkdownRenderer()));
        var service = CreateService(handler, renderer: loader);
        var entry = PortfolioCatalog.Find("chrono")!;

        await Assert.ThrowsAsync<HttpRequestException>(async () =>
            await service.RenderAsync("# Retry", entry));
        var html = await service.RenderAsync("# Retry", entry);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(html, Does.Contain("id=\"readme-retry\""));
            Assert.That(loader.LoadCount, Is.EqualTo(2));
        }
    }

    [Test]
    public async Task GetAsyncRootReadmeUsesLocalPortfolioContent()
    {
        using var handler = new RecordingHandler();
        var service = CreateService(handler);

        var content = await service
            .GetAsync(PortfolioCatalog.RootEntry, CancellationToken.None)
            .ConfigureAwait(true);

        Assert.That(content, Does.Contain("# Hi, I'm Simone."));
        using (Assert.EnterMultipleScope())
        {
            Assert.That(content, Does.Contain("https://github.com/sravioli"));
            Assert.That(handler.RequestCount, Is.Zero);
        }
    }

    [Test]
    public async Task GetAsyncRepositoryReadmeCachesSuccessfulResponse()
    {
        using var handler = new RecordingHandler();
        var service = CreateService(handler);
        var chrono = PortfolioCatalog.Find("chrono")!;

        var first = await service.GetAsync(chrono, CancellationToken.None).ConfigureAwait(true);
        var second = await service.GetAsync(chrono, CancellationToken.None).ConfigureAwait(true);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(first, Is.EqualTo("README content"));
            Assert.That(second, Is.EqualTo(first));
            Assert.That(handler.RequestCount, Is.EqualTo(1));
            Assert.That(
                handler.LastRequestUri?.ToString(),
                Is.EqualTo(
                    "https://raw.githubusercontent.com/sravioli/chrono/main/.github/readme.md"
                )
            );
        }
    }

    [Test]
    public async Task GetAsyncNapUsesRootReadmePath()
    {
        using var handler = new RecordingHandler();
        var service = CreateService(handler);

        await service
            .GetAsync(PortfolioCatalog.Find("nap.wz")!, CancellationToken.None)
            .ConfigureAwait(true);

        Assert.That(
            handler.LastRequestUri?.ToString(),
            Is.EqualTo("https://raw.githubusercontent.com/sravioli/nap.wz/main/README.md")
        );
    }

    [Test]
    public async Task GetAsyncPluginFolderFetchesAllDescriptionsInOneRequestAndStoresThem()
    {
        using var handler = new RecordingHandler(_ =>
            RepositoriesJson("Description from GitHub for")
        );
        var storage = new MemoryStorage();
        var service = CreateService(handler, storage);
        var plugins = PortfolioCatalog.Find("wezterm-plugins")!;

        var first = await service.GetAsync(plugins, CancellationToken.None).ConfigureAwait(true);
        var second = await service.GetAsync(plugins, CancellationToken.None).ConfigureAwait(true);

        Assert.That(first, Does.Contain("Description from GitHub for beacon.wz"));
        using (Assert.EnterMultipleScope())
        {
            Assert.That(
                first,
                Does.Contain(
                    "[memo.wz](https://github.com/sravioli/memo.wz) — Description from GitHub for memo.wz"
                )
            );
            Assert.That(second, Is.EqualTo(first));
            Assert.That(handler.RequestCount, Is.EqualTo(1));
            Assert.That(
                handler.LastRequestUri?.ToString(),
                Is.EqualTo("https://api.github.com/users/sravioli/repos?per_page=100")
            );
            Assert.That(
                storage.Values[StorageKey],
                Does.Contain("Description from GitHub for memo.wz")
            );
        }
        using var stored = JsonDocument.Parse(storage.Values[StorageKey]);
        using (Assert.EnterMultipleScope())
        {
            Assert.That(
                stored
                    .RootElement.EnumerateObject()
                    .Select(property => property.Name)
                    .Order(StringComparer.Ordinal),
                Is.EqualTo(new object?[] { "Descriptions", "FetchedAt" })
            );
            Assert.That(
                stored.RootElement.GetProperty("Descriptions").GetProperty("memo.wz").GetString(),
                Is.EqualTo("Description from GitHub for memo.wz")
            );
        }
    }

    [Test]
    public async Task GetAsyncPluginFolderUsesFreshStoredDescriptionsWithoutRequests()
    {
        var time = new ManualTimeProvider();
        var storage = new MemoryStorage();
        using var storedHandler = new RecordingHandler(_ => RepositoriesJson("Stored"));
        await CreateService(storedHandler, storage, time)
            .GetAsync(PortfolioCatalog.Find("wezterm-plugins")!, CancellationToken.None)
            .ConfigureAwait(true);
        using var handler = new RecordingHandler(_ => RepositoriesJson("Fresh"));
        time.Advance(TimeSpan.FromHours(5));

        var content = await CreateService(handler, storage, time)
            .GetAsync(PortfolioCatalog.Find("wezterm-plugins")!, CancellationToken.None)
            .ConfigureAwait(true);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(content, Does.Contain("Stored memo.wz"));
            Assert.That(handler.RequestCount, Is.Zero);
        }
    }

    [Test]
    public async Task GetAsyncPluginFolderRefreshesExpiredDescriptions()
    {
        var time = new ManualTimeProvider();
        var storage = new MemoryStorage();
        using var storedHandler = new RecordingHandler(_ => RepositoriesJson("Stored"));
        await CreateService(storedHandler, storage, time)
            .GetAsync(PortfolioCatalog.Find("wezterm-plugins")!, CancellationToken.None)
            .ConfigureAwait(true);
        using var handler = new RecordingHandler(_ => RepositoriesJson("Fresh"));
        time.Advance(TimeSpan.FromHours(7));

        var content = await CreateService(handler, storage, time)
            .GetAsync(PortfolioCatalog.Find("wezterm-plugins")!, CancellationToken.None)
            .ConfigureAwait(true);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(content, Does.Contain("Fresh memo.wz"));
            Assert.That(handler.RequestCount, Is.EqualTo(1));
        }
    }

    [Test]
    public async Task GetAsyncPluginFolderKeepsExpiredDescriptionsWhenRateLimited()
    {
        var time = new ManualTimeProvider();
        var storage = new MemoryStorage();
        using var storedHandler = new RecordingHandler(_ => RepositoriesJson("Stored"));
        await CreateService(storedHandler, storage, time)
            .GetAsync(PortfolioCatalog.Find("wezterm-plugins")!, CancellationToken.None)
            .ConfigureAwait(true);
        time.Advance(TimeSpan.FromDays(2));

        using var handler = new RecordingHandler(status: HttpStatusCode.Forbidden);
        var content = await CreateService(handler, storage, time)
            .GetAsync(PortfolioCatalog.Find("wezterm-plugins")!, CancellationToken.None)
            .ConfigureAwait(true);

        Assert.That(content, Does.Contain("Stored memo.wz"));
    }

    [Test]
    public async Task GetAsyncPluginFolderUsesCatalogDescriptionsWhenRateLimitedWithoutStoredData()
    {
        using var handler = new RecordingHandler(status: HttpStatusCode.Forbidden);
        var service = CreateService(handler);
        var plugins = PortfolioCatalog.Find("wezterm-plugins")!;

        var first = await service.GetAsync(plugins, CancellationToken.None).ConfigureAwait(true);
        await service.GetAsync(plugins, CancellationToken.None).ConfigureAwait(true);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(first, Does.Contain("Non-blocking update notifications."));
            Assert.That(handler.RequestCount, Is.EqualTo(1));
        }
    }

    [Test]
    public async Task GetAsyncPluginFolderUsesCatalogDescriptionWhenGitHubDescriptionIsEmpty()
    {
        using var handler = new RecordingHandler(_ =>
            """[{"name":"update.wz","description":null}]"""
        );
        var service = CreateService(handler);

        var content = await service
            .GetAsync(PortfolioCatalog.Find("wezterm-plugins")!, CancellationToken.None)
            .ConfigureAwait(true);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(content, Does.Contain("Non-blocking update notifications."));
            Assert.That(handler.RequestCount, Is.EqualTo(1));
        }
    }

    [Test]
    public async Task GetAsyncPluginFolderIgnoresCorruptStoredDescriptions()
    {
        var storage = new MemoryStorage();
        storage.Values[StorageKey] = "not json";
        using var handler = new RecordingHandler(_ => RepositoriesJson("Fresh"));

        var content = await CreateService(handler, storage)
            .GetAsync(PortfolioCatalog.Find("wezterm-plugins")!, CancellationToken.None)
            .ConfigureAwait(true);

        Assert.That(content, Does.Contain("Fresh memo.wz"));
    }

    private const string StorageKey = "srv.github-descriptions";

    [Test]
    public async Task GetAsyncPluginFolderReadsExistingStoredJsonShape()
    {
        var storage = new MemoryStorage();
        storage.Values[StorageKey] =
            """{"FetchedAt":"2026-01-01T00:00:00+00:00","Descriptions":{"memo.wz":"Previously stored description"}}""";
        using var handler = new RecordingHandler();

        var content = await CreateService(handler, storage)
            .GetAsync(PortfolioCatalog.Find("wezterm-plugins")!, CancellationToken.None)
            .ConfigureAwait(true);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(content, Does.Contain("Previously stored description"));
            Assert.That(handler.RequestCount, Is.Zero);
        }
    }

    [Test]
    public async Task GetAsyncPluginFolderReadsCaseInsensitiveGitHubProperties()
    {
        using var handler = new RecordingHandler(_ =>
            """[{"NAME":"memo.wz","DESCRIPTION":"Mixed-case description"}]"""
        );

        var content = await CreateService(handler)
            .GetAsync(PortfolioCatalog.Find("wezterm-plugins")!, CancellationToken.None)
            .ConfigureAwait(true);

        using (Assert.EnterMultipleScope())
        {
            Assert.That(content, Does.Contain("Mixed-case description"));
            Assert.That(handler.RequestCount, Is.EqualTo(1));
        }
    }

    private ReadmeService CreateService(
        HttpMessageHandler handler,
        MemoryStorage? storage = null,
        TimeProvider? time = null,
        IMarkdownRendererLoader? renderer = null
    )
    {
        var client = new HttpClient(handler);
        _clients.Add(client);
        return new(client, storage ?? new MemoryStorage(), time ?? new ManualTimeProvider(),
            renderer ?? new RecordingRendererLoader());
    }

    private sealed class RecordingRendererLoader(
        Func<Task<IMarkdownRenderer>>? load = null) : IMarkdownRendererLoader
    {
        public int LoadCount { get; private set; }

        public Task<IMarkdownRenderer> LoadAsync()
        {
            LoadCount++;
            return load?.Invoke()
                ?? Task.FromResult<IMarkdownRenderer>(new Rendering.MarkdownRenderer());
        }
    }

    private static string RepositoriesJson(string prefix) =>
        System.Text.Json.JsonSerializer.Serialize(
            PortfolioCatalog
                .Find("wezterm-plugins")!
                .Children.Select(plugin => new
                {
                    name = plugin.Repository,
                    description = $"{prefix} {plugin.Repository}",
                })
                .Append(new { name = "unrelated", description = "Not a plugin" })
        );

    private sealed class MemoryStorage : IBrowserStorage
    {
        public Dictionary<string, string> Values { get; } = [];

        public ValueTask<string?> GetAsync(string key) =>
            ValueTask.FromResult(Values.GetValueOrDefault(key));

        public ValueTask SetAsync(string key, string value)
        {
            Values[key] = value;
            return ValueTask.CompletedTask;
        }
    }

    private sealed class ManualTimeProvider : TimeProvider
    {
        private DateTimeOffset _now = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

        public override DateTimeOffset GetUtcNow() => _now;

        public void Advance(TimeSpan delta) => _now += delta;
    }

    private sealed class RecordingHandler(
        Func<HttpRequestMessage, string>? response = null,
        HttpStatusCode status = HttpStatusCode.OK
    ) : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, string> _response =
            response ?? (_ => "README content");
        private readonly HttpStatusCode _status = status;

        public int RequestCount { get; private set; }
        public Uri? LastRequestUri { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken
        )
        {
            RequestCount++;
            LastRequestUri = request.RequestUri;
            return Task.FromResult(
                new HttpResponseMessage(_status)
                {
                    Content = new StringContent(
                        _response(request),
                        System.Text.Encoding.UTF8,
                        "application/json"
                    ),
                }
            );
        }
    }
}
