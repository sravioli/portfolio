namespace Srv.Portfolio.Models;

public sealed record PickMenuItem(string Key, string Label, string Repository, string Kind, bool HasChildren);
