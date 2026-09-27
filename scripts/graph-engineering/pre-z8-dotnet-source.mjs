export const SDK_VERSION = "8.0.425";
export const FRAMEWORK = "net8.0";
export const GOOD_SOURCE =
  "namespace PreZ8Fixture;\npublic static class MathOps { public static int Add(int left, int right) => left + right; }\n";
export const BAD_SOURCE = GOOD_SOURCE.replace("left + right;", "left + right + 1;");

export const TEST_CASES = `namespace PreZ8Fixture;

[AttributeUsage(AttributeTargets.Method)]
public sealed class FixtureCaseAttribute : Attribute
{
    public bool Skip { get; set; }
}

public static class Cases
{
    private static void Equal(int expected, int actual)
    {
        if (expected != actual)
            throw new InvalidOperationException($"Expected {expected}, actual {actual}.");
    }

    [FixtureCase] public static void AddPositive() => Equal(5, MathOps.Add(2, 3));
    [FixtureCase] public static void AddNegative() => Equal(0, MathOps.Add(-2, 2));
    [FixtureCase] public static void AddZero() => Equal(0, MathOps.Add(0, 0));
    [FixtureCase(Skip = true)] public static void Disabled() => throw new InvalidOperationException("Must stay skipped.");
}
`;

// Fixture infrastructure only: the actual SDK VSTest logger, never this adapter, writes TRX.
export const ADAPTER_SOURCE = `using System.Reflection;
using Microsoft.VisualStudio.TestPlatform.ObjectModel;
using Microsoft.VisualStudio.TestPlatform.ObjectModel.Adapter;
using Microsoft.VisualStudio.TestPlatform.ObjectModel.Logging;

namespace PreZ8Fixture.Adapter;

internal static class FixtureDiscovery
{
    internal const string Executor = "executor://pre-z8-synthetic/v1";
    internal static readonly Uri ExecutorUri = new(Executor);

    internal static IEnumerable<TestCase> Discover(IEnumerable<string> sources)
    {
        foreach (var source in sources)
        {
            if (!Path.GetFileName(source).EndsWith(".Tests.dll", StringComparison.Ordinal)) continue;
            var assembly = Assembly.LoadFrom(source);
            foreach (var type in assembly.GetTypes())
            foreach (var method in type.GetMethods(BindingFlags.Public | BindingFlags.Static))
            {
                if (!method.GetCustomAttributesData().Any(a => a.AttributeType.FullName == "PreZ8Fixture.FixtureCaseAttribute")) continue;
                yield return new TestCase($"{type.FullName}.{method.Name}", ExecutorUri, source)
                {
                    DisplayName = method.Name
                };
            }
        }
    }

    internal static MethodInfo Method(TestCase test)
    {
        var boundary = test.FullyQualifiedName.LastIndexOf('.');
        var assembly = Assembly.LoadFrom(test.Source);
        return assembly.GetType(test.FullyQualifiedName[..boundary], throwOnError: true)!
            .GetMethod(test.FullyQualifiedName[(boundary + 1)..], BindingFlags.Public | BindingFlags.Static)!;
    }
}

[FileExtension(".dll")]
[DefaultExecutorUri(FixtureDiscovery.Executor)]
public sealed class Discoverer : ITestDiscoverer
{
    public void DiscoverTests(IEnumerable<string> sources, IDiscoveryContext context,
        IMessageLogger logger, ITestCaseDiscoverySink sink)
    {
        foreach (var test in FixtureDiscovery.Discover(sources)) sink.SendTestCase(test);
    }
}

[ExtensionUri(FixtureDiscovery.Executor)]
public sealed class Executor : ITestExecutor
{
    private volatile bool cancelled;
    public void Cancel() => cancelled = true;
    public void RunTests(IEnumerable<string>? sources, IRunContext? context, IFrameworkHandle? handle)
        => RunTests(FixtureDiscovery.Discover(sources ?? []), context, handle);

    public void RunTests(IEnumerable<TestCase>? tests, IRunContext? context, IFrameworkHandle? handle)
    {
        if (handle is null) throw new InvalidOperationException("Native test framework handle missing.");
        var filter = context?.GetTestCaseFilter(["FullyQualifiedName", "Name"], _ => null);
        foreach (var test in tests ?? [])
        {
            if (cancelled) break;
            if (filter is not null && !filter.MatchTestCase(test, property =>
                property == "FullyQualifiedName" ? test.FullyQualifiedName :
                property == "Name" ? test.DisplayName : null)) continue;
            handle.RecordStart(test);
            var result = new TestResult(test) { StartTime = DateTimeOffset.UtcNow };
            try
            {
                var method = FixtureDiscovery.Method(test);
                var attribute = method.GetCustomAttributesData().Single(a => a.AttributeType.FullName == "PreZ8Fixture.FixtureCaseAttribute");
                var skip = attribute.NamedArguments.Any(a => a.MemberName == "Skip" && a.TypedValue.Value is true);
                if (skip) result.Outcome = TestOutcome.Skipped;
                else
                {
                    method.Invoke(null, null);
                    result.Outcome = TestOutcome.Passed;
                }
            }
            catch (Exception error)
            {
                var actual = error is TargetInvocationException { InnerException: not null } invocation
                    ? invocation.InnerException : error;
                result.Outcome = TestOutcome.Failed;
                result.ErrorMessage = actual!.Message;
                result.ErrorStackTrace = actual.StackTrace;
            }
            result.EndTime = DateTimeOffset.UtcNow;
            result.Duration = result.EndTime - result.StartTime;
            handle.RecordResult(result);
            handle.RecordEnd(test, result.Outcome);
        }
    }
}
`;

const properties = `
    <TargetFramework>${FRAMEWORK}</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <LangVersion>12.0</LangVersion>
    <EnableDefaultCompileItems>false</EnableDefaultCompileItems>
    <UseSharedCompilation>false</UseSharedCompilation>
    <NuGetAudit>false</NuGetAudit>`;

export const ADAPTER_PROJECT = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>${properties}
    <AssemblyName>PreZ8Fixture.TestAdapter</AssemblyName>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="Adapter.cs" />
    <Reference Include="Microsoft.VisualStudio.TestPlatform.ObjectModel">
      <HintPath>$(MSBuildToolsPath)/Microsoft.VisualStudio.TestPlatform.ObjectModel.dll</HintPath>
      <Private>false</Private>
    </Reference>
  </ItemGroup>
</Project>
`;

export const SDK_HOST_ASSEMBLIES = [
  "testhost",
  "Newtonsoft.Json",
  "Microsoft.TestPlatform.CommunicationUtilities",
  "Microsoft.TestPlatform.CoreUtilities",
  "Microsoft.TestPlatform.CrossPlatEngine",
  "Microsoft.VisualStudio.TestPlatform.ObjectModel",
  "Microsoft.TestPlatform.PlatformAbstractions",
  "Microsoft.TestPlatform.Utilities",
  "Microsoft.VisualStudio.TestPlatform.Common",
];

// 无 Test.Sdk 包时诊断显示 testhost 的扩展列表为空；保留项目引用的输出复制，让标准测试目录发现适配器。
export const TEST_PROJECT = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>${properties}
    <IsTestProject>true</IsTestProject>
    <GenerateRuntimeConfigurationFiles>true</GenerateRuntimeConfigurationFiles>
    <VSTestTestAdapterPath>$(MSBuildProjectDirectory)/adapter/bin/$(Configuration)/${FRAMEWORK}</VSTestTestAdapterPath>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="MathOps.cs" />
    <Compile Include="Cases.cs" />
    <ProjectReference Include="adapter/Fixture.TestAdapter.csproj" />
${SDK_HOST_ASSEMBLIES.map(
  (name) => `    <Reference Include="${name}">
      <HintPath>$(MSBuildToolsPath)/${name}.dll</HintPath>
      <Private>true</Private>
    </Reference>`,
).join("\n")}
  </ItemGroup>
</Project>
`;

export const SOURCE_PATHS = [
  "Fixture.Tests.csproj",
  "MathOps.cs",
  "Cases.cs",
  "adapter/Fixture.TestAdapter.csproj",
  "adapter/Adapter.cs",
  "global.json",
  "NuGet.Config",
  "Directory.Build.props",
  "Directory.Build.targets",
  "Directory.Packages.props",
];
export const BUILD_PATHS = [
  `bin/Release/${FRAMEWORK}/Fixture.Tests.dll`,
  `bin/Release/${FRAMEWORK}/Fixture.Tests.deps.json`,
  `bin/Release/${FRAMEWORK}/Fixture.Tests.runtimeconfig.json`,
  `adapter/bin/Release/${FRAMEWORK}/PreZ8Fixture.TestAdapter.dll`,
  `bin/Release/${FRAMEWORK}/PreZ8Fixture.TestAdapter.dll`,
];
