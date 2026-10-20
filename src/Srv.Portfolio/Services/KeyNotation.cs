namespace Srv.Portfolio.Services;

internal static class KeyNotation
{
    internal static string Leader(string keys, bool dev, string leaderLabel) =>
        dev ? $"<leader>{keys}" : $"{leaderLabel} then {string.Join(" ", keys.ToCharArray())}";

    internal static string Control(char key, bool dev) => dev ? $"<C-{key}>" : $"Ctrl+{key}";
}
