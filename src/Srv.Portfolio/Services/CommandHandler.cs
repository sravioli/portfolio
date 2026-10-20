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
    Reload,
    Invalid,
}

internal static partial class CommandHandler
{
    public static CommandAction Handle(NavigationState state, string commandText)
    {
        ArgumentNullException.ThrowIfNull(state);
        ArgumentNullException.ThrowIfNull(commandText);

        var command = commandText.TrimStart(':').Trim();
        state.EndCommand();
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

            state.Message =
                "Leader must be one printable key. Use :let mapleader = \" \" for Space.";
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

        if (
            command.Equals("help", StringComparison.OrdinalIgnoreCase)
            || command.Equals("h", StringComparison.OrdinalIgnoreCase)
        )
        {
            state.IsHelpOpen = true;
            return CommandAction.OpenHelp;
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

        if (
            command.Equals("e", StringComparison.OrdinalIgnoreCase)
            || command.Equals("edit", StringComparison.OrdinalIgnoreCase)
        )
        {
            if (state.CurrentDocument is null)
            {
                state.Message = "E32: No file name";
                return CommandAction.Invalid;
            }

            return CommandAction.Reload;
        }

        if (command.Length > 0)
        {
            state.Message = $"Not an available command: {command}. Try :Ex or :help.";
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
}
