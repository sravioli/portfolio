using System.Text.RegularExpressions;

namespace Srv.Portfolio.Services;

internal enum CommandAction
{
    None,
    ReturnToListing,
    OpenHelp,
    SetLeader,
    SetKeyboard,
    SetDevNotation,
    SetExplorer,
    SearchReadme,
    ClearSearchHighlight,
    OpenReadme,
    Reload,
    Invalid,
}

internal static partial class CommandHandler
{
    public static CommandAction Handle(NavigationState state, string commandText)
    {
        ArgumentNullException.ThrowIfNull(state);
        ArgumentNullException.ThrowIfNull(commandText);

        var isSearch = commandText.StartsWith('/');
        var command = isSearch ? commandText[1..].Trim() : commandText.TrimStart(':').Trim();
        state.EndCommand();
        if (isSearch)
        {
            if (command.Length == 0)
            {
                command = state.SearchQuery;
            }

            if (command.Length == 0)
            {
                state.ShowError("E35: No previous regular expression");
                return CommandAction.Invalid;
            }

            if (state.CurrentDocument is null)
            {
                state.ShowError($"E486: Pattern not found: {command}");
                return CommandAction.Invalid;
            }

            state.SearchQuery = command;
            return CommandAction.SearchReadme;
        }

        var leaderAssignment = LeaderAssignmentRegex().Match(command);
        if (leaderAssignment.Success)
        {
            var leader = leaderAssignment.Groups[2].Value;
            leader = leader switch
            {
                "<Space>" => " ",
                "<Bslash>" or "\\\\" => "\\",
                _ => leader,
            };
            if (leader.Length == 1 && !char.IsControl(leader[0]) && !char.IsSurrogate(leader[0]))
            {
                state.Leader = leader;
                state.Message =
                    $"Leader set to {state.LeaderLabel}. Press {state.LeaderLabel} then e to focus the explorer.";
                return CommandAction.SetLeader;
            }

            state.ShowError("E474: Invalid argument: mapleader must be a single key");
            return CommandAction.Invalid;
        }

        if (
            command.Equals("Ex", StringComparison.OrdinalIgnoreCase)
            || command.Equals("Explore", StringComparison.OrdinalIgnoreCase)
            || command.Equals("q", StringComparison.OrdinalIgnoreCase)
        )
        {
            state.GoToParent();
            return CommandAction.ReturnToListing;
        }

        if (HelpRegex().IsMatch(command))
        {
            state.IsHelpOpen = true;
            return CommandAction.OpenHelp;
        }

        if (
            command.Equals("nohl", StringComparison.OrdinalIgnoreCase)
            || command.Equals("nohlsearch", StringComparison.OrdinalIgnoreCase)
            || command.Equals("nohls", StringComparison.OrdinalIgnoreCase)
        )
        {
            return CommandAction.ClearSearchHighlight;
        }

        var booleanOption = BooleanOptionRegex().Match(command);
        if (booleanOption.Success)
        {
            var isKeys = booleanOption.Groups[2].Value == "keys";
            var current = isKeys ? state.KeyboardEnabled : state.DevNotation;
            var value = booleanOption.Groups[1].Value switch
            {
                "no" => false,
                "inv" => !current,
                _ => !booleanOption.Groups[3].Success || !current,
            };
            if (!isKeys)
            {
                state.DevNotation = value;
                state.Message =
                    $"{(value ? "Vim" : "Plain")} notation: "
                    + $"{KeyNotation.Leader("ff", value, state.LeaderLabel)}, {KeyNotation.Control('d', value)}.";
                return CommandAction.SetDevNotation;
            }

            state.SetKeyboardEnabled(value);
            return CommandAction.SetKeyboard;
        }

        var explorerOpen = command switch
        {
            _ when command.Equals("NvimTreeToggle", StringComparison.OrdinalIgnoreCase) =>
                !state.IsExplorerOpen,
            _ when command.Equals("NvimTreeOpen", StringComparison.OrdinalIgnoreCase) => true,
            _ when command.Equals("NvimTreeClose", StringComparison.OrdinalIgnoreCase) => false,
            _ => (bool?)null,
        };
        if (explorerOpen is { } open)
        {
            state.IsExplorerOpen = open;
            return CommandAction.SetExplorer;
        }

        var editSeparator = command.IndexOfAny([' ', '\t']);
        var editCommand = editSeparator < 0 ? command : command[..editSeparator];
        if (
            editCommand.Equals("e", StringComparison.OrdinalIgnoreCase)
            || editCommand.Equals("edit", StringComparison.OrdinalIgnoreCase)
        )
        {
            var path = editSeparator < 0 ? string.Empty : command[(editSeparator + 1)..].Trim();
            if (path.Length > 0)
            {
                if (state.NavigateToReadme(path) is null)
                {
                    state.ShowError($"E484: Can't open file {path}");
                    return CommandAction.Invalid;
                }

                state.IsExplorerOpen = true;
                return CommandAction.OpenReadme;
            }

            if (state.CurrentDocument is null)
            {
                state.ShowError("E32: No file name");
                return CommandAction.Invalid;
            }

            return CommandAction.Reload;
        }

        if (command.Length > 0)
        {
            state.ShowError($"E492: Not an editor command: {command}");
            return CommandAction.Invalid;
        }

        return CommandAction.None;
    }

    [GeneratedRegex(
        """^(?:let\s+(?:g:)?mapleader|lua\s+vim\.g\.mapleader)\s*=\s*(["'])(.*?)\1$""",
        RegexOptions.CultureInvariant
    )]
    private static partial Regex LeaderAssignmentRegex();

    [GeneratedRegex(@"^set?\s+(no|inv)?(keys|dev)(!)?$", RegexOptions.CultureInvariant)]
    private static partial Regex BooleanOptionRegex();

    [GeneratedRegex(
        @"^h(?:elp)?(?:\s+\S.*)?$",
        RegexOptions.CultureInvariant | RegexOptions.IgnoreCase
    )]
    private static partial Regex HelpRegex();
}
