namespace Srv.Portfolio.Services;

internal static class ReadmeText
{
    internal static string[] SplitRawLines(string source) =>
        source.Replace("\r\n", "\n").Split('\n');
}
