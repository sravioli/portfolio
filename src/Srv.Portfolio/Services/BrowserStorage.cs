using Microsoft.JSInterop;

namespace Srv.Portfolio.Services;

internal interface IBrowserStorage
{
    ValueTask<string?> GetAsync(string key);

    ValueTask SetAsync(string key, string value);
}

// Storage can be disabled or full (private mode, quotas); callers treat it as best effort.
internal sealed class BrowserStorage(IJSRuntime jsRuntime) : IBrowserStorage
{
    public async ValueTask<string?> GetAsync(string key)
    {
        try
        {
            return await jsRuntime
                .InvokeAsync<string?>("localStorage.getItem", key)
                .ConfigureAwait(true);
        }
        catch (JSException)
        {
            return null;
        }
    }

    public async ValueTask SetAsync(string key, string value)
    {
        try
        {
            await jsRuntime
                .InvokeVoidAsync("localStorage.setItem", key, value)
                .ConfigureAwait(true);
        }
        catch (JSException) { }
    }
}
