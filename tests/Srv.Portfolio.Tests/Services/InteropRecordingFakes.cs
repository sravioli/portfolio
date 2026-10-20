using Microsoft.JSInterop;

namespace Srv.Portfolio.Tests.Services;

internal sealed record JsInvocation(string Identifier, object?[] Arguments);

internal sealed class RecordingJsRuntime(params IJSObjectReference[] modules) : IJSRuntime
{
    private readonly Queue<IJSObjectReference> _modules = new(modules);

    public List<JsInvocation> Calls { get; } = [];
    public Exception? ImportFailure { get; set; }

    public ValueTask<TValue> InvokeAsync<TValue>(string identifier, object?[]? args) =>
        InvokeAsync<TValue>(identifier, CancellationToken.None, args);

    public ValueTask<TValue> InvokeAsync<TValue>(
        string identifier,
        CancellationToken cancellationToken,
        object?[]? args
    )
    {
        Calls.Add(new JsInvocation(identifier, args?.ToArray() ?? []));
        if (identifier == "import" && ImportFailure is { } importFailure)
            return ValueTask.FromException<TValue>(importFailure);
        if (identifier != "import" || _modules.Count == 0)
            throw new InvalidOperationException($"Unexpected runtime invocation: {identifier}");
        return ValueTask.FromResult((TValue)(object)_modules.Dequeue());
    }
}

internal sealed class RecordingJsModule : IJSObjectReference
{
    public List<JsInvocation> Calls { get; } = [];
    public List<string> Trace { get; } = [];
    public Dictionary<string, object?> Results { get; } = [];
    public Dictionary<string, Exception> InvocationFailures { get; } = [];
    public Exception? DisposeFailure { get; set; }

    public ValueTask<TValue> InvokeAsync<TValue>(string identifier, object?[]? args) =>
        InvokeAsync<TValue>(identifier, CancellationToken.None, args);

    public ValueTask<TValue> InvokeAsync<TValue>(
        string identifier,
        CancellationToken cancellationToken,
        object?[]? args
    )
    {
        Calls.Add(new JsInvocation(identifier, args?.ToArray() ?? []));
        Trace.Add($"invoke:{identifier}");
        if (InvocationFailures.TryGetValue(identifier, out var failure))
            return ValueTask.FromException<TValue>(failure);
        if (Results.TryGetValue(identifier, out var result) && result is TValue typed)
            return ValueTask.FromResult(typed);
        return ValueTask.FromResult(default(TValue)!);
    }

    public ValueTask DisposeAsync()
    {
        Trace.Add("module.DisposeAsync");
        return DisposeFailure is null
            ? ValueTask.CompletedTask
            : ValueTask.FromException(DisposeFailure);
    }
}
