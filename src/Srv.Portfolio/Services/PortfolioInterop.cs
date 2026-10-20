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
    private const string DisposeMethod = "dispose";

    private IJSObjectReference? _module;

    public async ValueTask InitializeAsync<T>(DotNetObjectReference<T> dotNetReference, bool keyboardEnabled, string leader) where T : class
    {
        _module = await jsRuntime.InvokeAsync<IJSObjectReference>("import", ModulePath);
        await _module.InvokeVoidAsync(InitializeMethod, dotNetReference, keyboardEnabled, leader);
    }

    public ValueTask SetKeyboardEnabledAsync(bool enabled) =>
        _module?.InvokeVoidAsync(SetKeyboardMethod, enabled) ?? ValueTask.CompletedTask;

    public ValueTask RefreshPreviewAsync() =>
        _module?.InvokeVoidAsync(RefreshMethod) ?? ValueTask.CompletedTask;

    public ValueTask MoveCursorAsync(string motion) =>
        _module?.InvokeVoidAsync(MoveCursorMethod, motion) ?? ValueTask.CompletedTask;

    public ValueTask<bool> FollowLinkAsync(bool fallbackDown) =>
        _module?.InvokeAsync<bool>(FollowLinkMethod, fallbackDown) ?? ValueTask.FromResult(false);

    public ValueTask JumpAsync(int direction) =>
        _module?.InvokeVoidAsync(JumpMethod, direction) ?? ValueTask.CompletedTask;

    public ValueTask JumpHeadingAsync(int direction) =>
        _module?.InvokeVoidAsync(JumpHeadingMethod, direction) ?? ValueTask.CompletedTask;

    public ValueTask<bool> CopyTextAsync(string text) =>
        _module?.InvokeAsync<bool>(CopyTextMethod, text) ?? ValueTask.FromResult(false);

    public ValueTask FocusCommandAsync() =>
        _module?.InvokeVoidAsync(FocusCommandMethod) ?? ValueTask.CompletedTask;

    public ValueTask FocusPreviewAsync() =>
        _module?.InvokeVoidAsync(FocusPreviewMethod) ?? ValueTask.CompletedTask;

    public ValueTask FocusExplorerAsync(ElementReference explorer) =>
        _module?.InvokeVoidAsync(FocusExplorerMethod, explorer) ?? ValueTask.CompletedTask;

    public ValueTask ApplyLeaderAsync(string leader) =>
        _module?.InvokeVoidAsync(ApplyLeaderMethod, leader) ?? ValueTask.CompletedTask;

    public ValueTask SetHelpOpenAsync(ElementReference dialog, bool open) =>
        _module?.InvokeVoidAsync(SetHelpOpenMethod, dialog, open) ?? ValueTask.CompletedTask;

    public async ValueTask DisposeAsync()
    {
        if (_module is null)
        {
            return;
        }

        try
        {
            await _module.InvokeVoidAsync(DisposeMethod);
            await _module.DisposeAsync();
        }
        catch (JSDisconnectedException)
        {
        }

        _module = null;
    }
}
