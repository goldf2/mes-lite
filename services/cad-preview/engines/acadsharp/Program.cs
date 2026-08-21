using ACadSharp;
using ACadSharp.IO;

if (args.Length != 2)
{
    Console.Error.WriteLine("usage: acadsharp-dwg2dxf <source.dwg> <target.dxf>");
    return 2;
}

var source = Path.GetFullPath(args[0]);
var target = Path.GetFullPath(args[1]);
if (!File.Exists(source))
{
    Console.Error.WriteLine($"source file does not exist: {source}");
    return 2;
}
if (!string.Equals(Path.GetExtension(source), ".dwg", StringComparison.OrdinalIgnoreCase)
    || !string.Equals(Path.GetExtension(target), ".dxf", StringComparison.OrdinalIgnoreCase))
{
    Console.Error.WriteLine("source must be DWG and target must be DXF");
    return 2;
}

try
{
    CadDocument document = DwgReader.Read(source, (_, notification) =>
        Console.Error.WriteLine(notification.Message));
    DxfWriter.Write(target, document);
    if (!File.Exists(target) || new FileInfo(target).Length == 0)
    {
        Console.Error.WriteLine("ACadSharp did not produce a DXF file");
        return 1;
    }
    return 0;
}
catch (Exception error)
{
    Console.Error.WriteLine(error);
    return 1;
}
