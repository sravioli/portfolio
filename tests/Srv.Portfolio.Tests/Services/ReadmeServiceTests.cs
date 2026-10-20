using System.Net;
using Srv.Portfolio.Services;

namespace Srv.Portfolio.Tests;

public sealed class ReadmeServiceTests
{
    [Fact]
    public async Task GetAsync_RootReadme_UsesLocalPortfolioContent()
    {
        var handler = new RecordingHandler();
        var service = CreateService(handler);

        var content = await service.GetAsync(PortfolioCatalog.RootEntry, CancellationToken.None);

        Assert.Contains("# Hi, I'm Simone.", content);
        Assert.Contains("https://github.com/sravioli", content);
        Assert.Equal(0, handler.RequestCount);
    }

    [Fact]
    public async Task GetAsync_RepositoryReadme_CachesSuccessfulResponse()
    {
        var handler = new RecordingHandler();
        var service = CreateService(handler);
        var chrono = PortfolioCatalog.Find("chrono")!;

        var first = await service.GetAsync(chrono, CancellationToken.None);
        var second = await service.GetAsync(chrono, CancellationToken.None);

        Assert.Equal("README content", first);
        Assert.Equal(first, second);
        Assert.Equal(1, handler.RequestCount);
        Assert.Equal(
            "https://raw.githubusercontent.com/sravioli/chrono/main/.github/readme.md",
            handler.LastRequestUri?.ToString());
    }

    [Fact]
    public async Task GetAsync_Nap_UsesRootReadmePath()
    {
        var handler = new RecordingHandler();
        var service = CreateService(handler);

        await service.GetAsync(PortfolioCatalog.Find("nap.wz")!, CancellationToken.None);

        Assert.Equal(
            "https://raw.githubusercontent.com/sravioli/nap.wz/main/README.md",
            handler.LastRequestUri?.ToString());
    }

    [Fact]
    public async Task GetAsync_PluginFolder_FetchesAllDescriptionsInOneRequestAndStoresThem()
    {
        var handler = new RecordingHandler(_ => RepositoriesJson("Description from GitHub for"));
        var storage = new MemoryStorage();
        var service = CreateService(handler, storage);
        var plugins = PortfolioCatalog.Find("wezterm-plugins")!;

        var first = await service.GetAsync(plugins, CancellationToken.None);
        var second = await service.GetAsync(plugins, CancellationToken.None);

        Assert.Contains("Description from GitHub for beacon.wz", first);
        Assert.Contains("[memo.wz](https://github.com/sravioli/memo.wz) — Description from GitHub for memo.wz", first);
        Assert.Equal(first, second);
        Assert.Equal(1, handler.RequestCount);
        Assert.Equal("https://api.github.com/users/sravioli/repos?per_page=100", handler.LastRequestUri?.ToString());
        Assert.Contains("Description from GitHub for memo.wz", storage.Values[StorageKey]);
    }

    [Fact]
    public async Task GetAsync_PluginFolder_UsesFreshStoredDescriptionsWithoutRequests()
    {
        var time = new ManualTimeProvider();
        var storage = new MemoryStorage();
        await CreateService(new RecordingHandler(_ => RepositoriesJson("Stored")), storage, time)
            .GetAsync(PortfolioCatalog.Find("wezterm-plugins")!, CancellationToken.None);
        var handler = new RecordingHandler(_ => RepositoriesJson("Fresh"));
        time.Advance(TimeSpan.FromHours(5));

        var content = await CreateService(handler, storage, time)
            .GetAsync(PortfolioCatalog.Find("wezterm-plugins")!, CancellationToken.None);

        Assert.Contains("Stored memo.wz", content);
        Assert.Equal(0, handler.RequestCount);
    }

    [Fact]
    public async Task GetAsync_PluginFolder_RefreshesExpiredDescriptions()
    {
        var time = new ManualTimeProvider();
        var storage = new MemoryStorage();
        await CreateService(new RecordingHandler(_ => RepositoriesJson("Stored")), storage, time)
            .GetAsync(PortfolioCatalog.Find("wezterm-plugins")!, CancellationToken.None);
        var handler = new RecordingHandler(_ => RepositoriesJson("Fresh"));
        time.Advance(TimeSpan.FromHours(7));

        var content = await CreateService(handler, storage, time)
            .GetAsync(PortfolioCatalog.Find("wezterm-plugins")!, CancellationToken.None);

        Assert.Contains("Fresh memo.wz", content);
        Assert.Equal(1, handler.RequestCount);
    }

    [Fact]
    public async Task GetAsync_PluginFolder_KeepsExpiredDescriptionsWhenRateLimited()
    {
        var time = new ManualTimeProvider();
        var storage = new MemoryStorage();
        await CreateService(new RecordingHandler(_ => RepositoriesJson("Stored")), storage, time)
            .GetAsync(PortfolioCatalog.Find("wezterm-plugins")!, CancellationToken.None);
        time.Advance(TimeSpan.FromDays(2));

        var content = await CreateService(new RecordingHandler(status: HttpStatusCode.Forbidden), storage, time)
            .GetAsync(PortfolioCatalog.Find("wezterm-plugins")!, CancellationToken.None);

        Assert.Contains("Stored memo.wz", content);
    }

    [Fact]
    public async Task GetAsync_PluginFolder_UsesCatalogDescriptionsWhenRateLimitedWithoutStoredData()
    {
        var handler = new RecordingHandler(status: HttpStatusCode.Forbidden);
        var service = CreateService(handler);
        var plugins = PortfolioCatalog.Find("wezterm-plugins")!;

        var first = await service.GetAsync(plugins, CancellationToken.None);
        await service.GetAsync(plugins, CancellationToken.None);

        Assert.Contains("Non-blocking update notifications.", first);
        Assert.Equal(1, handler.RequestCount);
    }

    [Fact]
    public async Task GetAsync_PluginFolder_UsesCatalogDescriptionWhenGitHubDescriptionIsEmpty()
    {
        var handler = new RecordingHandler(_ => """[{"name":"update.wz","description":null}]""");
        var service = CreateService(handler);

        var content = await service.GetAsync(PortfolioCatalog.Find("wezterm-plugins")!, CancellationToken.None);

        Assert.Contains("Non-blocking update notifications.", content);
        Assert.Equal(1, handler.RequestCount);
    }

    [Fact]
    public async Task GetAsync_PluginFolder_IgnoresCorruptStoredDescriptions()
    {
        var storage = new MemoryStorage();
        storage.Values[StorageKey] = "not json";
        var handler = new RecordingHandler(_ => RepositoriesJson("Fresh"));

        var content = await CreateService(handler, storage)
            .GetAsync(PortfolioCatalog.Find("wezterm-plugins")!, CancellationToken.None);

        Assert.Contains("Fresh memo.wz", content);
    }

    private const string StorageKey = "srv.github-descriptions";

    private static ReadmeService CreateService(
        HttpMessageHandler handler,
        MemoryStorage? storage = null,
        TimeProvider? time = null) =>
        new(new HttpClient(handler), storage ?? new MemoryStorage(), time ?? new ManualTimeProvider());

    private static string RepositoriesJson(string prefix) =>
        System.Text.Json.JsonSerializer.Serialize(PortfolioCatalog.Find("wezterm-plugins")!.Children
            .Select(plugin => new { name = plugin.Repository, description = $"{prefix} {plugin.Repository}" })
            .Append(new { name = "unrelated", description = "Not a plugin" }));

    private sealed class MemoryStorage : IBrowserStorage
    {
        public Dictionary<string, string> Values { get; } = [];

        public ValueTask<string?> GetAsync(string key) => ValueTask.FromResult(Values.GetValueOrDefault(key));

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

    private sealed class RecordingHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, string> _response;
        private readonly HttpStatusCode _status;

        public RecordingHandler(
            Func<HttpRequestMessage, string>? response = null,
            HttpStatusCode status = HttpStatusCode.OK)
        {
            _response = response ?? (_ => "README content");
            _status = status;
        }

        public int RequestCount { get; private set; }
        public Uri? LastRequestUri { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            RequestCount++;
            LastRequestUri = request.RequestUri;
            return Task.FromResult(new HttpResponseMessage(_status)
            {
                Content = new StringContent(_response(request), System.Text.Encoding.UTF8, "application/json")
            });
        }
    }
}
