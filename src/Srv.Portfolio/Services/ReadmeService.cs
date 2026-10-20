using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Srv.Portfolio.Models;

namespace Srv.Portfolio.Services;

internal sealed partial class ReadmeService(
    HttpClient httpClient,
    IBrowserStorage storage,
    TimeProvider timeProvider
)
{
    private const string DescriptionsStorageKey = "srv.github-descriptions";
    private static readonly TimeSpan DescriptionsLifetime = TimeSpan.FromHours(6);

    private readonly Dictionary<string, string> _cache = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<(string Repository, string? Path), (string Source, string Html)>
        _renderedCache = [];
    private Dictionary<string, string?>? _descriptions;

    public string Render(string source, PortfolioEntry entry)
    {
        ArgumentNullException.ThrowIfNull(source);
        ArgumentNullException.ThrowIfNull(entry);

        var key = (entry.Repository, entry.ReadmePath);
        if (_renderedCache.TryGetValue(key, out var cached) &&
            string.Equals(cached.Source, source, StringComparison.Ordinal))
        {
            return cached.Html;
        }

        var html = MarkdownProcessor.Render(source, entry);
        _renderedCache[key] = (source, html);
        return html;
    }

    public async Task<string> GetAsync(PortfolioEntry entry, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(entry);
        if (entry.IsReadmeLocal)
        {
            return entry.IsRoot
                ? RootReadme
                : await BuildPluginReadmeAsync(cancellationToken).ConfigureAwait(true);
        }

        if (!entry.HasReadme)
        {
            return "No README published.";
        }

        if (_cache.TryGetValue(entry.Repository, out var cached))
        {
            return cached;
        }

        var uri = new Uri(GitHubUrls.RawFile(entry.Repository, entry.ReadmePath!));
        var content = await httpClient.GetStringAsync(uri, cancellationToken).ConfigureAwait(true);
        _cache[entry.Repository] = content;
        return content;
    }

    private async Task<string> BuildPluginReadmeAsync(CancellationToken cancellationToken)
    {
        var plugins = PortfolioCatalog.Find("wezterm-plugins")!.Children;
        var descriptions = await GetRepositoryDescriptionsAsync(cancellationToken)
            .ConfigureAwait(true);

        return "# WezTerm plugins\n\nA collection of small, composable plugins for WezTerm.\n\n"
            + string.Join(
                "\n",
                plugins.Select(plugin =>
                    $"- [{plugin.Name}]({GitHubUrls.Repository(plugin.Repository)}) — "
                    + $"{descriptions.GetValueOrDefault(plugin.Repository) ?? plugin.Description}"
                )
            )
            + "\n";
    }

    // One unauthenticated request covers every plugin; the result is kept in localStorage so reloads
    // stay well under GitHub's 60 requests/hour limit. Failures fall back to stale or catalog text.
    private async Task<Dictionary<string, string?>> GetRepositoryDescriptionsAsync(
        CancellationToken cancellationToken
    )
    {
        if (_descriptions is not null)
        {
            return _descriptions;
        }

        var stored = await ReadStoredDescriptionsAsync().ConfigureAwait(true);
        if (
            stored is not null
            && timeProvider.GetUtcNow() - stored.FetchedAt < DescriptionsLifetime
        )
        {
            return _descriptions = ToLookup(stored.Descriptions);
        }

        try
        {
            var repositories =
                await httpClient
                    .GetFromJsonAsync(
                        GitHubUrls.RepositoriesApiUrl,
                        ReadmeJsonContext.Default.GitHubRepositoryArray,
                        cancellationToken
                    )
                    .ConfigureAwait(true)
                ?? [];
            _descriptions = ToLookup(
                repositories
                    .Where(repository => repository.Name is not null)
                    .DistinctBy(repository => repository.Name, StringComparer.OrdinalIgnoreCase)
                    .ToDictionary(
                        repository => repository.Name!,
                        repository => repository.Description
                    )
            );
            await storage
                .SetAsync(
                    DescriptionsStorageKey,
                    JsonSerializer.Serialize(
                        new StoredDescriptions(timeProvider.GetUtcNow(), _descriptions),
                        ReadmeJsonContext.Default.StoredDescriptions
                    )
                )
                .ConfigureAwait(true);
        }
        catch (Exception exception)
            when (exception is HttpRequestException or JsonException or NotSupportedException)
        {
            _descriptions = ToLookup(stored?.Descriptions ?? []);
        }

        return _descriptions;
    }

    private async Task<StoredDescriptions?> ReadStoredDescriptionsAsync()
    {
        var json = await storage.GetAsync(DescriptionsStorageKey).ConfigureAwait(true);
        if (string.IsNullOrEmpty(json))
        {
            return null;
        }

        try
        {
            return
                JsonSerializer.Deserialize(json, ReadmeJsonContext.Default.StoredDescriptions)
                    is { Descriptions: not null } stored
                ? stored
                : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static Dictionary<string, string?> ToLookup(Dictionary<string, string?> descriptions) =>
        new(descriptions, StringComparer.OrdinalIgnoreCase);

    private sealed record GitHubRepository(
        [property: JsonPropertyName("name")] string? Name,
        [property: JsonPropertyName("description")] string? Description
    );

    private sealed record StoredDescriptions(
        DateTimeOffset FetchedAt,
        Dictionary<string, string?> Descriptions
    );

    [JsonSourceGenerationOptions(PropertyNameCaseInsensitive = true)]
    [JsonSerializable(typeof(GitHubRepository[]))]
    [JsonSerializable(typeof(StoredDescriptions))]
    private sealed partial class ReadmeJsonContext : JsonSerializerContext;

    private const string RootReadme = """
        # Hi, I'm Simone.

        I work with .NET. I build Lua tools in my own time.

        ## At work

        C#, ASP.NET, and MAUI.

        ## Outside work

        WezTerm plugins, Neovim, Python, and some C/C++.

        [GitHub](https://github.com/sravioli)

        `j/k move · gx open link · - parent · :Ex explorer · ? help`
        """;
}
