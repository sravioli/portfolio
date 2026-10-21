using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.RenderTree;
using Microsoft.Extensions.DependencyInjection;
using Srv.Portfolio.Pages;

namespace Srv.Portfolio.Tests.Pages;

[TestFixture]
internal sealed class RawDocumentTests
{
    [Test]
    public async Task SetParameters_SameLinesAndRepository_SkipsRender()
    {
        using var services = new ServiceCollection().BuildServiceProvider();
        await using var renderer = new ExplorerTreeTests.TreeRenderer(services);
        string[] lines = ["# Title", "", "body"];

        await renderer.Dispatcher.InvokeAsync(async () =>
        {
            var id = renderer.Attach(new RawDocument());
            Task RenderAsync(IReadOnlyList<string> value, string? repository) =>
                renderer.RenderAsync(id, ParameterView.FromDictionary(new Dictionary<string, object?>
                {
                    [nameof(RawDocument.Lines)] = value,
                    [nameof(RawDocument.Repository)] = repository,
                }));

            await RenderAsync(lines, "repo");
            Assert.That(renderer.RenderedComponents, Is.EqualTo(1));
            Assert.That(Markup(renderer.Frames(id)), Is.EqualTo(
                "<pre class=\"raw-readme\" data-repository=\"repo\">"
                + "<span class=\"raw-line\"># Title</span><span class=\"raw-line\"></span>"
                + "<span class=\"raw-line\">body</span></pre>"));

            await RenderAsync(lines, "repo");
            Assert.That(renderer.RenderedComponents, Is.EqualTo(1));

            await RenderAsync([.. lines], "repo");
            Assert.That(renderer.RenderedComponents, Is.EqualTo(2));

            string[] replacement = ["other"];
            await RenderAsync(replacement, "repo");
            Assert.That(renderer.RenderedComponents, Is.EqualTo(3));
            Assert.That(Markup(renderer.Frames(id)), Does.Contain("<span class=\"raw-line\">other</span></pre>"));

            await RenderAsync(replacement, "next");
            Assert.That(renderer.RenderedComponents, Is.EqualTo(4));
            Assert.That(Markup(renderer.Frames(id)), Does.Contain("data-repository=\"next\""));
        });
    }

    // Serializes captured render frames so the test pins the markup the cursor and search scripts query.
#pragma warning disable BL0006
    private static string Markup(ArrayRange<RenderTreeFrame> frames)
    {
        var builder = new System.Text.StringBuilder();
        Append(frames.Array, 0, frames.Count, builder);
        return builder.ToString();
    }

    private static void Append(RenderTreeFrame[] frames, int start, int end, System.Text.StringBuilder builder)
    {
        for (var index = start; index < end; index++)
        {
            var frame = frames[index];
            switch (frame.FrameType)
            {
                case RenderTreeFrameType.Element:
                    builder.Append('<').Append(frame.ElementName);
                    var child = index + 1;
                    for (; child < index + frame.ElementSubtreeLength
                        && frames[child].FrameType == RenderTreeFrameType.Attribute; child++)
                    {
                        builder.Append(' ').Append(frames[child].AttributeName)
                            .Append("=\"").Append(frames[child].AttributeValue).Append('"');
                    }

                    builder.Append('>');
                    Append(frames, child, index + frame.ElementSubtreeLength, builder);
                    builder.Append("</").Append(frame.ElementName).Append('>');
                    index += frame.ElementSubtreeLength - 1;
                    break;
                case RenderTreeFrameType.Text:
                    builder.Append(frame.TextContent);
                    break;
                case RenderTreeFrameType.Markup:
                    builder.Append(frame.MarkupContent);
                    break;
            }
        }
    }
#pragma warning restore BL0006
}
