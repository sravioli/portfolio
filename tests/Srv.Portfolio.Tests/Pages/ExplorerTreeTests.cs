using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.RenderTree;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Srv.Portfolio.Models;
using Srv.Portfolio.Pages;
using Srv.Portfolio.Services;

namespace Srv.Portfolio.Tests.Pages;

[TestFixture]
internal sealed class ExplorerTreeTests
{
    [TestCase(0)]
    [TestCase(1)]
    [TestCase(4)]
    public async Task OnClick_VisibleEntry_InvokesOpenOnce(int index)
    {
        using var services = new ServiceCollection().BuildServiceProvider();
        await using var renderer = new TreeRenderer(services);
        var opened = new List<int>();
        var state = new NavigationState();

        await renderer.Dispatcher.InvokeAsync(async () =>
        {
            var id = renderer.Attach(new ExplorerTree());
            await renderer.RenderAsync(id, ParameterView.FromDictionary(new Dictionary<string, object?>
            {
                [nameof(ExplorerTree.Entries)] = state.Entries,
                [nameof(ExplorerTree.OnOpen)] = EventCallback.Factory.Create<int>(
                    opened, (int entry) => opened.Add(entry)),
            }));

            var events = renderer.Events(id);
            Assert.That(events.Count(item => item.Name == "onclick"), Is.EqualTo(state.Entries.Count));
            Assert.That(events.Any(item => item.Name == "ondblclick"), Is.False);

            await renderer.ClickAsync(events.Where(item => item.Name == "onclick").ElementAt(index).Id);
        });

        Assert.That(opened, Is.EqualTo(new[] { index }));
    }

    [TestCase(0)]
    [TestCase(2)]
    public async Task OnClick_SearchResult_OpensClickedFileOnce(int index)
    {
        using var services = new ServiceCollection().BuildServiceProvider();
        await using var renderer = new TreeRenderer(services);
        var opened = new List<PortfolioEntry>();
        var results = FileSearch.Search(string.Empty);

        await renderer.Dispatcher.InvokeAsync(async () =>
        {
            var id = renderer.Attach(new FinderWithoutPreview());
            await renderer.RenderAsync(id, ParameterView.FromDictionary(new Dictionary<string, object?>
            {
                [nameof(FileFinder.OnOpen)] = EventCallback.Factory.Create<PortfolioEntry>(
                    opened, (PortfolioEntry entry) => opened.Add(entry)),
            }));

            var events = renderer.Events(id);
            Assert.That(events.Any(item => item.Name == "ondblclick"), Is.False);
            await renderer.ClickAsync(events.Where(item => item.Name == "onclick").ElementAt(index).Id);
        });

        Assert.That(opened, Is.EqualTo(new[] { results[index].Entry }));
    }

    [Test]
    public async Task OnKeyDown_EnterInSearch_OpensSelectedFileOnce()
    {
        using var services = new ServiceCollection().BuildServiceProvider();
        await using var renderer = new TreeRenderer(services);
        var opened = new List<PortfolioEntry>();

        await renderer.Dispatcher.InvokeAsync(async () =>
        {
            var id = renderer.Attach(new FinderWithoutPreview());
            await renderer.RenderAsync(id, ParameterView.FromDictionary(new Dictionary<string, object?>
            {
                [nameof(FileFinder.OnOpen)] = EventCallback.Factory.Create<PortfolioEntry>(
                    opened, (PortfolioEntry entry) => opened.Add(entry)),
            }));

            await renderer.KeyAsync(renderer.Events(id).Single(item => item.Name == "onkeydown").Id, "Enter");
        });

        Assert.That(opened, Is.EqualTo(new[] { FileSearch.Search(string.Empty)[0].Entry }));
    }

    private sealed class FinderWithoutPreview : FileFinder
    {
        protected override Task OnAfterRenderAsync(bool firstRender) => Task.CompletedTask;
    }

    // Capture Blazor's real event bindings without introducing a browser-test dependency.
#pragma warning disable BL0006
    private sealed class TreeRenderer(IServiceProvider services)
        : Renderer(services, NullLoggerFactory.Instance)
    {
        public override Dispatcher Dispatcher { get; } = Dispatcher.CreateDefault();

        public int Attach(IComponent component) => AssignRootComponentId(component);

        public Task RenderAsync(int id, ParameterView parameters) =>
            RenderRootComponentAsync(id, parameters);

        public Task ClickAsync(ulong eventId) =>
            DispatchEventAsync(eventId, null, new MouseEventArgs());

        public Task KeyAsync(ulong eventId, string key) =>
            DispatchEventAsync(eventId, null, new KeyboardEventArgs { Key = key });

        public List<(string Name, ulong Id)> Events(int id)
        {
            var frames = GetCurrentRenderTreeFrames(id);
            var events = new List<(string, ulong)>();
            for (var index = 0; index < frames.Count; index++)
            {
                var frame = frames.Array[index];
                if (frame.FrameType == RenderTreeFrameType.Attribute && frame.AttributeEventHandlerId != 0)
                {
                    events.Add((frame.AttributeName, frame.AttributeEventHandlerId));
                }
            }
            return events;
        }

        protected override Task UpdateDisplayAsync(in RenderBatch renderBatch) => Task.CompletedTask;

        protected override void HandleException(Exception exception) =>
            System.Runtime.ExceptionServices.ExceptionDispatchInfo.Capture(exception).Throw();
    }
#pragma warning restore BL0006
}
