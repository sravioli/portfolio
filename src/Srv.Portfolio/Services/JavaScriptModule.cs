using Microsoft.JSInterop;

namespace Srv.Portfolio.Services;

internal static class JavaScriptModule
{
    internal static ValueTask InvokeVoidIfLoadedAsync(
        this IJSObjectReference? module, string method, params object?[] args) =>
        module?.InvokeVoidAsync(method, args) ?? ValueTask.CompletedTask;

    internal static ValueTask<T> InvokeIfLoadedAsync<T>(
        this IJSObjectReference? module, string method, T fallback, params object?[] args) =>
        module?.InvokeAsync<T>(method, args) ?? ValueTask.FromResult(fallback);

    internal static async ValueTask DisposeModuleAsync(this IJSObjectReference? module)
    {
        if (module is null)
        {
            return;
        }

        try
        {
            await module.InvokeVoidAsync("dispose");
            await module.DisposeAsync();
        }
        catch (JSDisconnectedException)
        {
        }
    }
}
