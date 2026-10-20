using System.Runtime.CompilerServices;
using Microsoft.AspNetCore.Components.WebAssembly.Services;

namespace Srv.Portfolio.Services;

internal interface IMarkdownRendererLoader
{
    Task<IMarkdownRenderer> LoadAsync();
}

internal sealed class MarkdownRendererLoader(LazyAssemblyLoader assemblies) : IMarkdownRendererLoader
{
    private Task<IMarkdownRenderer>? _loading;

    public async Task<IMarkdownRenderer> LoadAsync()
    {
        var loading = _loading ??= LoadCoreAsync();
        try
        {
            return await loading.ConfigureAwait(true);
        }
        catch
        {
            if (ReferenceEquals(_loading, loading))
            {
                _loading = null;
            }
            throw;
        }
    }

    private async Task<IMarkdownRenderer> LoadCoreAsync()
    {
        await assemblies.LoadAssembliesAsync([
            "Srv.Portfolio.Rendering.wasm",
            "AngleSharp.wasm",
            "AngleSharp.Css.wasm",
            "HtmlSanitizer.wasm",
            "Markdig.wasm",
            "System.Text.Encoding.CodePages.wasm",
        ]).ConfigureAwait(true);
        return CreateRenderer();
    }

    // Resolve renderer types only after their assemblies have been downloaded.
    [MethodImpl(MethodImplOptions.NoInlining)]
    private static IMarkdownRenderer CreateRenderer() => new Rendering.MarkdownRenderer();
}
