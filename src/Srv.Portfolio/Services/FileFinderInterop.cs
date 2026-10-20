using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;

namespace Srv.Portfolio.Services;

public sealed class FileFinderInterop(IJSRuntime jsRuntime) : IAsyncDisposable
{
    private const string ModulePath = "./Pages/FileFinder.razor.js";
    private const string OpenMethod = "open";
    private const string CloseMethod = "close";
    private const string DisposeMethod = "dispose";
    private IJSObjectReference? _module;

    public async ValueTask OpenAsync(ElementReference dialog)
    {
        _module = await jsRuntime.InvokeAsync<IJSObjectReference>("import", ModulePath);
        await _module.InvokeVoidAsync(OpenMethod, dialog);
    }

    public ValueTask CloseAsync(bool restoreFocus) =>
        _module?.InvokeVoidAsync(CloseMethod, restoreFocus) ?? ValueTask.CompletedTask;

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
    }
}
