using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;

namespace Srv.Portfolio.Services;

public sealed class FileFinderInterop(IJSRuntime jsRuntime) : IAsyncDisposable
{
    private const string ModulePath = "./Pages/FileFinder.razor.js";
    private const string OpenMethod = "open";
    private const string CloseMethod = "close";
    private IJSObjectReference? _module;

    public async ValueTask OpenAsync(ElementReference dialog)
    {
        _module = await jsRuntime.InvokeAsync<IJSObjectReference>("import", ModulePath);
        await _module.InvokeVoidAsync(OpenMethod, dialog);
    }

    public ValueTask CloseAsync(bool restoreFocus) =>
        _module.InvokeVoidIfLoadedAsync(CloseMethod, restoreFocus);

    public ValueTask DisposeAsync() => _module.DisposeModuleAsync();
}
