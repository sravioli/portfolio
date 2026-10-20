using Microsoft.JSInterop;

namespace Srv.Portfolio.Services;

internal static class JavaScriptModule
{
    internal static ValueTask InvokeVoidIfLoadedAsync(
        this IJSObjectReference? module,
        string method,
        params object?[] args
    ) => module?.InvokeVoidAsync(method, args) ?? ValueTask.CompletedTask;

    internal static ValueTask<bool> InvokeBooleanIfLoadedAsync(
        this IJSObjectReference? module,
        string method,
        bool fallback,
        params object?[] args
    ) => module?.InvokeAsync<bool>(method, args) ?? ValueTask.FromResult(fallback);

    internal static async ValueTask DisposeModuleAsync(this IJSObjectReference? module)
    {
        if (module is null)
        {
            return;
        }

        try
        {
            await module.InvokeVoidAsync("dispose").ConfigureAwait(true);
            await module.DisposeAsync().ConfigureAwait(true);
        }
        catch (JSDisconnectedException) { }
    }
}
