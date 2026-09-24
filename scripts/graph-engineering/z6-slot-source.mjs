export const RULE_TESTS = {
  R1: ["normal-basic-R1", "normal-reset-R1"],
  R2: ["normal-trigger-R2", "normal-cap-trigger-R2-R4"],
  R3: ["free-shared-win-R3", "free-first-retrigger-R3", "free-second-retrigger-R3"],
  R4: ["normal-cap-trigger-R2-R4", "free-cap-stops-R4", "free-overflow-cap-R4"],
  R5: [
    "free-exhausted-inert-R5",
    "free-stopped-inert-R5",
    "normal-negative-atomic-R5",
    "free-negative-atomic-R5",
  ],
};
export const REQUIRED_SLOT_TESTS = [...new Set(Object.values(RULE_TESTS).flat())];
export const GAME_DOC = `# Z6 synthetic slot fixture authority

This document defines this development fixture only. It is not a real game's math or certification.

## R1
Normal starts a new round, resetting accumulated win and retrigger count, then adds the supplied nonnegative win.

## R2
A Normal trigger awards exactly three Free spins unless the win cap already stopped the round.

## R3
Free consumes one remaining spin, then adds its supplied nonnegative win to the shared total. A retrigger awards two spins at most once per round.

## R4
Accumulated win is capped at ten. Reaching or exceeding ten clamps the stored total to ten, marks stopped and clears all remaining Free spins. A retrigger cannot revive a stopped round.

## R5
Free input after stop or zero remaining spins is inert. A negative win throws before changing state in Normal or Free.

## Explicit exclusions and unknowns
Bonus and Respin are not present in this fixture and must be excluded from instantiated native tasks.
No RTP target, sample size or tolerance is supplied. RTP comparison is not applicable. There is no probability model, certification claim or company pilot result.
The selected engine is this C# fixture. The operator selects the explicit offline Build/Test recipes; no other project command is assumed.
`;

export const NORMAL_GOOD = `    public static void Normal(SlotState state, int win, bool trigger)
    {
        if (win < 0) throw new ArgumentOutOfRangeException(nameof(win));
        state.TotalWin = Math.Min(10, win);
        state.Retriggers = 0;
        state.Stopped = state.TotalWin == 10;
        state.FreeSpins = state.Stopped ? 0 : trigger ? 3 : 0;
    }`;
export const FREE_GOOD = `    public static void Free(SlotState state, int win, bool retrigger)
    {
        if (win < 0) throw new ArgumentOutOfRangeException(nameof(win));
        if (state.Stopped || state.FreeSpins == 0) return;
        state.FreeSpins--;
        state.TotalWin = (int)Math.Min(10L, (long)state.TotalWin + win);
        if (state.TotalWin == 10)
        {
            state.Stopped = true;
            state.FreeSpins = 0;
            return;
        }
        if (retrigger && state.Retriggers == 0)
        {
            state.Retriggers++;
            state.FreeSpins += 2;
        }
    }`;
export const NORMAL_BAD = NORMAL_GOOD.replace("Math.Min(10, win)", "Math.Min(10, win + 1)");
export const FREE_BAD = FREE_GOOD.replace("state.TotalWin + win)", "state.TotalWin + win + 1)");
const source = (normal, free) => `public sealed class SlotState
{
    public int TotalWin { get; set; }
    public int FreeSpins { get; set; }
    public int Retriggers { get; set; }
    public bool Stopped { get; set; }
}

public static class SlotRules
{
${normal}

${free}
}
`;
export const SEED_SLOT_SOURCE = source(NORMAL_BAD, FREE_BAD);
export const NORMAL_ONLY_SOURCE = source(NORMAL_GOOD, FREE_BAD);
export const GOOD_SLOT_SOURCE = source(NORMAL_GOOD, FREE_GOOD);
export const SLOT_PROJECT = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net8.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable><EnableDefaultCompileItems>false</EnableDefaultCompileItems><UseSharedCompilation>false</UseSharedCompilation><NuGetAudit>false</NuGetAudit></PropertyGroup>
  <ItemGroup><Compile Include="SlotRules.cs" /><Compile Include="Runner.cs" /></ItemGroup>
</Project>
`;
export const SLOT_RUNNER = String.raw`using System.Text.Json;

var values = new Dictionary<string, string>(StringComparer.Ordinal);
for (var index = 0; index < args.Length; index++)
{
    var argument = args[index];
    if (argument is not ("--operation-id" or "--source-digest" or "--build-digest" or "--report"))
        throw new ArgumentException("Unknown configured fixture argument: " + argument);
    if (++index >= args.Length || !values.TryAdd(argument, args[index]))
        throw new ArgumentException("Missing or repeated configured fixture argument.");
}
string Required(string key) => values.TryGetValue(key, out var value) && value.Length > 0
    ? value : throw new ArgumentException("Missing configured fixture argument: " + key);
string WorkspaceFile(string relative)
{
    if (Path.IsPathRooted(relative)) throw new ArgumentException("Report must be relative.");
    var root = Path.GetFullPath(Environment.CurrentDirectory) + Path.DirectorySeparatorChar;
    var absolute = Path.GetFullPath(relative, root);
    if (!absolute.StartsWith(root, OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal))
        throw new ArgumentException("Report must remain in synthetic workspace.");
    return absolute;
}
var tests = new List<Dictionary<string, object>>();
void Check(string name, Action action)
{
    try { action(); tests.Add(new() { ["name"] = name, ["status"] = "passed" }); }
    catch (Exception error) { tests.Add(new() { ["name"] = name, ["status"] = "failed", ["message"] = error.Message }); }
}
void Same(SlotState state, int total, int spins, int retriggers, bool stopped)
{
    if ((state.TotalWin, state.FreeSpins, state.Retriggers, state.Stopped) != (total, spins, retriggers, stopped))
        throw new InvalidOperationException($"Expected ({total},{spins},{retriggers},{stopped}); actual ({state.TotalWin},{state.FreeSpins},{state.Retriggers},{state.Stopped}).");
}
void Negative(Action action)
{
    try { action(); } catch (ArgumentOutOfRangeException) { return; }
    throw new InvalidOperationException("Negative win did not throw before mutation.");
}
Check("normal-basic-R1", () => { var s = new SlotState(); SlotRules.Normal(s, 2, false); Same(s, 2, 0, 0, false); });
Check("normal-reset-R1", () => { var s = new SlotState { TotalWin = 8, FreeSpins = 4, Retriggers = 1, Stopped = true }; SlotRules.Normal(s, 1, false); Same(s, 1, 0, 0, false); });
Check("normal-trigger-R2", () => { var s = new SlotState(); SlotRules.Normal(s, 2, true); Same(s, 2, 3, 0, false); });
Check("normal-cap-trigger-R2-R4", () => { var s = new SlotState(); SlotRules.Normal(s, 12, true); Same(s, 10, 0, 0, true); });
Check("free-shared-win-R3", () => { var s = new SlotState { TotalWin = 2, FreeSpins = 3 }; SlotRules.Free(s, 3, false); Same(s, 5, 2, 0, false); });
Check("free-first-retrigger-R3", () => { var s = new SlotState { TotalWin = 2, FreeSpins = 3 }; SlotRules.Free(s, 1, true); Same(s, 3, 4, 1, false); });
Check("free-second-retrigger-R3", () => { var s = new SlotState { TotalWin = 3, FreeSpins = 4, Retriggers = 1 }; SlotRules.Free(s, 1, true); Same(s, 4, 3, 1, false); });
Check("free-cap-stops-R4", () => { var s = new SlotState { TotalWin = 8, FreeSpins = 3 }; SlotRules.Free(s, 4, true); Same(s, 10, 0, 0, true); });
Check("free-overflow-cap-R4", () => { var s = new SlotState { TotalWin = 8, FreeSpins = 3 }; SlotRules.Free(s, int.MaxValue, true); Same(s, 10, 0, 0, true); });
Check("free-exhausted-inert-R5", () => { var s = new SlotState { TotalWin = 5, FreeSpins = 0, Retriggers = 1 }; SlotRules.Free(s, 3, true); Same(s, 5, 0, 1, false); });
Check("free-stopped-inert-R5", () => { var s = new SlotState { TotalWin = 10, FreeSpins = 0, Retriggers = 1, Stopped = true }; SlotRules.Free(s, 4, true); Same(s, 10, 0, 1, true); });
Check("normal-negative-atomic-R5", () => { var s = new SlotState { TotalWin = 4, FreeSpins = 2, Retriggers = 1 }; Negative(() => SlotRules.Normal(s, -1, true)); Same(s, 4, 2, 1, false); });
Check("free-negative-atomic-R5", () => { var s = new SlotState { TotalWin = 4, FreeSpins = 2, Retriggers = 1 }; Negative(() => SlotRules.Free(s, -1, true)); Same(s, 4, 2, 1, false); });
var report = new { format = "zcode-test-v1", operationId = Required("--operation-id"), sourceDigest = Required("--source-digest"), buildDigest = Required("--build-digest"), tests };
var serialized = JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true });
await File.WriteAllTextAsync(WorkspaceFile(Required("--report")), serialized);
Console.WriteLine(serialized);
return tests.Any(test => (string)test["status"] != "passed") ? 1 : 0;
`;
