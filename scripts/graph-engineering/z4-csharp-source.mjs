export const REQUIRED_TESTS = ["add-positive", "add-negative", "add-zero"];
export const GOOD_SOURCE =
  "public static class MathOps\n{\n    public static int Add(int left, int right) => left + right;\n}\n";
export const BAD_SOURCE = GOOD_SOURCE.replace("left + right;", "left + right + 1;");
export const PROJECT = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <EnableDefaultCompileItems>false</EnableDefaultCompileItems>
    <UseSharedCompilation>false</UseSharedCompilation>
    <NuGetAudit>false</NuGetAudit>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="MathOps.cs" />
    <Compile Include="Runner.cs" />
  </ItemGroup>
</Project>
`;
export const RUNNER = String.raw`using System.Text.Json;

var values = new Dictionary<string, string>(StringComparer.Ordinal);
var flags = new HashSet<string>(StringComparer.Ordinal);
for (var index = 0; index < args.Length; index++)
{
    var argument = args[index];
    if (argument is "--zero" or "--omit-report" or "--hold" or "--emit-synthetic-secret")
        flags.Add(argument);
    else if (argument is "--operation-id" or "--source-digest" or "--build-digest" or "--report" or "--ready-file")
    {
        if (++index >= args.Length || !values.TryAdd(argument, args[index]))
            throw new ArgumentException("Missing or repeated configured fixture argument.");
    }
    else throw new ArgumentException("Unknown configured fixture argument: " + argument);
}
string Required(string key) => values.TryGetValue(key, out var value) && value.Length > 0
    ? value : throw new ArgumentException("Missing configured fixture argument: " + key);
string WorkspaceFile(string relative)
{
    if (Path.IsPathRooted(relative)) throw new ArgumentException("Fixture report paths must be relative.");
    var root = Path.GetFullPath(Environment.CurrentDirectory) + Path.DirectorySeparatorChar;
    var absolute = Path.GetFullPath(relative, root);
    if (!absolute.StartsWith(root, OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal))
        throw new ArgumentException("Fixture output must remain within its synthetic workspace.");
    return absolute;
}
var operationId = Required("--operation-id");
var sourceDigest = Required("--source-digest");
var buildDigest = Required("--build-digest");
var reportPath = WorkspaceFile(Required("--report"));
if (flags.Contains("--emit-synthetic-secret"))
{
    var synthetic = Environment.GetEnvironmentVariable("Z4_FIXTURE_SECRET") ?? throw new InvalidOperationException("Synthetic secret was not configured.");
    Console.WriteLine("Synthetic stdout: " + synthetic);
    Console.Error.WriteLine("Synthetic stderr: " + synthetic);
}
if (flags.Contains("--hold"))
{
    var readyPath = WorkspaceFile(Required("--ready-file"));
    // 观察者会在进程运行时读取就绪文件；先写临时文件再原子重命名，避免读到尚未写完的 JSON。
    var readyTemporary = readyPath + ".tmp";
    await File.WriteAllTextAsync(readyTemporary, JsonSerializer.Serialize(new
    {
        operationId,
        processId = Environment.ProcessId,
        state = "actual-process-started",
    }));
    File.Move(readyTemporary, readyPath);
    Console.WriteLine("Z4_FIXTURE_PROCESS_READY " + operationId);
    await Task.Delay(Timeout.Infinite);
}
var tests = new List<Dictionary<string, object>>();
void Check(string name, Func<int> calculation, int expected)
{
    try
    {
        var actual = calculation();
        if (actual != expected)
            throw new InvalidOperationException($"Expected {expected}; actual {actual}.");
        tests.Add(new() { ["name"] = name, ["status"] = "passed" });
    }
    catch (Exception error)
    {
        tests.Add(new() { ["name"] = name, ["status"] = "failed", ["message"] = error.Message });
    }
}
if (!flags.Contains("--zero"))
{
    Check("add-positive", () => MathOps.Add(2, 3), 5);
    Check("add-negative", () => MathOps.Add(-2, 2), 0);
    Check("add-zero", () => MathOps.Add(0, 0), 0);
}
var report = new { format = "zcode-test-v1", operationId, sourceDigest, buildDigest, tests };
var serialized = JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true });
if (!flags.Contains("--omit-report")) await File.WriteAllTextAsync(reportPath, serialized);
Console.WriteLine(serialized);
return tests.Any(test => (string)test["status"] != "passed") ? 1 : 0;
`;
