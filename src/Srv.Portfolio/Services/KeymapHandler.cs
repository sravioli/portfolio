namespace Srv.Portfolio.Services;

internal enum KeyAction
{
    Ignored,
    Changed,
    OpenSelected,
    ScrollUp,
    ScrollDown,
    ScrollTop,
    ScrollBottom,
    FocusCommand,
    FocusExplorer,
    CloseExplorer,
    OpenFileFinder,
    CloseCommand,
    HalfPageUp,
    HalfPageDown,
    NextHeading,
    PreviousHeading,
    FocusPreview,
    CloseDocument,
    CopyDocument,
    CursorLeft,
    CursorRight,
    WordForward,
    WordBackward,
    WordEnd,
    LineStart,
    LineEnd,
    FollowLink,
    OpenLink,
    JumpBack,
    JumpForward,
}

internal sealed class KeymapHandler
{
    private bool _waitingForSecondG;

    public KeyAction Handle(NavigationState state, string key, bool explorerFocused = false)
    {
        ArgumentNullException.ThrowIfNull(state);
        if (!state.KeyboardEnabled)
        {
            _waitingForSecondG = false;
            if (key == ":" && !state.IsHelpOpen)
            {
                state.BeginCommand();
                return KeyAction.FocusCommand;
            }

            return KeyAction.Ignored;
        }

        if (state.IsHelpOpen)
        {
            if (key == "Escape")
            {
                state.IsHelpOpen = false;
                return KeyAction.Changed;
            }

            return KeyAction.Ignored;
        }

        var waitingForSecondG = _waitingForSecondG;
        if (key != "g")
        {
            _waitingForSecondG = false;
        }

        switch (key)
        {
            case "<leader>e" when state.IsExplorerOpen && explorerFocused:
                state.IsExplorerOpen = false;
                return KeyAction.CloseExplorer;
            case "<leader>e" or "<C-h>":
                state.IsExplorerOpen = true;
                return KeyAction.FocusExplorer;
            case "<leader>ff" or "<C-p>":
                return KeyAction.OpenFileFinder;
            case "<C-d>":
                return state.IsReading ? KeyAction.HalfPageDown : KeyAction.Ignored;
            case "<C-u>":
                return state.IsReading ? KeyAction.HalfPageUp : KeyAction.Ignored;
            case "]]":
                return state.IsReading ? KeyAction.NextHeading : KeyAction.Ignored;
            case "[[":
                return state.IsReading ? KeyAction.PreviousHeading : KeyAction.Ignored;
            case "<C-l>":
                return state.IsReading ? KeyAction.FocusPreview : KeyAction.Ignored;
            case "<leader>bx":
                return state.IsReading ? KeyAction.CloseDocument : KeyAction.Ignored;
            case "<C-c>":
                return state.IsReading ? KeyAction.CopyDocument : KeyAction.Ignored;
            case "<C-o>":
                return state.IsReading ? KeyAction.JumpBack : KeyAction.Ignored;
            case "<C-i>":
                return state.IsReading ? KeyAction.JumpForward : KeyAction.Ignored;
            case "gx":
                return state.IsReading || state.IsWelcome
                    ? KeyAction.FollowLink
                    : KeyAction.Ignored;
        }

        if (key == "x" && waitingForSecondG && state.IsWelcome)
        {
            return KeyAction.FollowLink;
        }

        if (state.IsReading && !explorerFocused && !state.IsCommandMode)
        {
            var cursorAction = key switch
            {
                "x" when waitingForSecondG => KeyAction.FollowLink,
                "h" or "ArrowLeft" => KeyAction.CursorLeft,
                "l" or "ArrowRight" => KeyAction.CursorRight,
                "w" => KeyAction.WordForward,
                "b" => KeyAction.WordBackward,
                "e" => KeyAction.WordEnd,
                "0" => KeyAction.LineStart,
                "$" => KeyAction.LineEnd,
                "Enter" => KeyAction.OpenLink,
                _ => KeyAction.Ignored,
            };
            if (cursorAction != KeyAction.Ignored)
            {
                return cursorAction;
            }
        }

        if (key == "Escape" && state.IsCommandMode)
        {
            state.EndCommand();
            return KeyAction.CloseCommand;
        }

        if (key == "g")
        {
            if (!_waitingForSecondG)
            {
                _waitingForSecondG = true;
                return KeyAction.Changed;
            }

            _waitingForSecondG = false;
            if (state.IsReading && !explorerFocused)
            {
                return KeyAction.ScrollTop;
            }

            state.IsExplorerOpen = true;
            state.SelectEdge(last: false);
            return KeyAction.Changed;
        }

        if (key == "G")
        {
            if (state.IsReading && !explorerFocused)
            {
                return KeyAction.ScrollBottom;
            }

            state.IsExplorerOpen = true;
            state.SelectEdge(last: true);
            return KeyAction.Changed;
        }

        if (key is "j" or "ArrowDown")
        {
            if (state.IsReading && !explorerFocused)
            {
                return KeyAction.ScrollDown;
            }

            state.IsExplorerOpen = true;
            state.MoveSelection(1);
            return KeyAction.Changed;
        }

        if (key is "k" or "ArrowUp")
        {
            if (state.IsReading && !explorerFocused)
            {
                return KeyAction.ScrollUp;
            }

            state.IsExplorerOpen = true;
            state.MoveSelection(-1);
            return KeyAction.Changed;
        }

        if (key is "Enter" or "l")
        {
            var folder = state.SelectedEntry.Kind == Models.ExplorerItemKind.Folder;
            state.OpenSelected();
            return folder ? KeyAction.FocusExplorer : KeyAction.OpenSelected;
        }

        if (key is "h" or "-")
        {
            if (explorerFocused)
            {
                state.CollapseSelected();
                return KeyAction.FocusExplorer;
            }

            state.GoToParent();
            return KeyAction.Changed;
        }

        if (key == "p" && state.IsReading)
        {
            state.IsRawView = !state.IsRawView;
            return KeyAction.Changed;
        }

        if (key == ":")
        {
            state.BeginCommand();
            return KeyAction.FocusCommand;
        }

        if (key == "?")
        {
            state.IsHelpOpen = true;
            return KeyAction.Changed;
        }

        return KeyAction.Ignored;
    }
}
