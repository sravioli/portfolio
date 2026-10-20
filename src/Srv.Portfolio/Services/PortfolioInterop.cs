using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;

namespace Srv.Portfolio.Services;

public sealed class PortfolioInterop(IJSRuntime jsRuntime) : IAsyncDisposable
{
    private const string ModulePath = "./Pages/Home.razor.js";
    private const string InitializeMethod = "initialize";
    private const string SetKeyboardMethod = "setKeyboardEnabled";
    private const string RefreshMethod = "refreshPreview";
    private const string MoveCursorMethod = "moveCursor";
    private const string FollowLinkMethod = "followLink";
    private const string JumpMethod = "jump";
    private const string JumpHeadingMethod = "jumpHeading";
    private const string CopyTextMethod = "copyText";
    private const string FocusCommandMethod = "focusCommand";
    private const string FocusPreviewMethod = "focusPreview";
    private const string FocusExplorerMethod = "focusExplorer";
    private const string ApplyLeaderMethod = "applyLeader";
    private const string SetHelpOpenMethod = "setHelpOpen";

    private IJSObjectReference? _module;

    public async ValueTask InitializeAsync<T>(DotNetObjectReference<T> dotNetReference, bool keyboardEnabled, string leader) where T : class
    {
        _module = await jsRuntime.InvokeAsync<IJSObjectReference>("import", ModulePath);
        await _module.InvokeVoidAsync(InitializeMethod, dotNetReference, keyboardEnabled, leader);
    }

    public ValueTask SetKeyboardEnabledAsync(bool enabled) =>
        _module.InvokeVoidIfLoadedAsync(SetKeyboardMethod, enabled);

    public ValueTask RefreshPreviewAsync() =>
        _module.InvokeVoidIfLoadedAsync(RefreshMethod);

    public ValueTask MoveCursorAsync(string motion) =>
        _module.InvokeVoidIfLoadedAsync(MoveCursorMethod, motion);

    public ValueTask<bool> FollowLinkAsync(bool fallbackDown) =>
        _module.InvokeIfLoadedAsync(FollowLinkMethod, false, fallbackDown);

    public ValueTask JumpAsync(int direction) =>
        _module.InvokeVoidIfLoadedAsync(JumpMethod, direction);

    public ValueTask JumpHeadingAsync(int direction) =>
        _module.InvokeVoidIfLoadedAsync(JumpHeadingMethod, direction);

    public ValueTask<bool> CopyTextAsync(string text) =>
        _module.InvokeIfLoadedAsync(CopyTextMethod, false, text);

    public ValueTask FocusCommandAsync() =>
        _module.InvokeVoidIfLoadedAsync(FocusCommandMethod);

    public ValueTask FocusPreviewAsync() =>
        _module.InvokeVoidIfLoadedAsync(FocusPreviewMethod);

    public ValueTask FocusExplorerAsync(ElementReference explorer) =>
        _module.InvokeVoidIfLoadedAsync(FocusExplorerMethod, explorer);

    public ValueTask ApplyLeaderAsync(string leader) =>
        _module.InvokeVoidIfLoadedAsync(ApplyLeaderMethod, leader);

    public ValueTask SetHelpOpenAsync(ElementReference dialog, bool open) =>
        _module.InvokeVoidIfLoadedAsync(SetHelpOpenMethod, dialog, open);

    public async ValueTask DisposeAsync()
    {
        await _module.DisposeModuleAsync();
        _module = null;
    }
}
