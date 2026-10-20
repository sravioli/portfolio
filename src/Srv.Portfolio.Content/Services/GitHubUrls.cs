namespace Srv.Portfolio.Services;

internal static class GitHubUrls
{
    internal const string Host = "github.com";
    internal const string Owner = "sravioli";
    internal const string Branch = "main";
    internal const string RepositoriesApiUrl =
        $"https://api.github.com/users/{Owner}/repos?per_page=100";

    internal static string Repository(string repository) => $"https://{Host}/{Owner}/{repository}";

    internal static string RawFile(string repository, string path) =>
        $"https://raw.githubusercontent.com/{Owner}/{repository}/{Branch}/{path}";

    internal static string File(string repository, string path) =>
        $"{Repository(repository)}/blob/{Branch}/{path}";
}
