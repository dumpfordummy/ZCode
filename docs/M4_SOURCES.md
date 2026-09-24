# M4 primary sources and compatibility notes

Researched 2026-09-24. Sources below support API/tool facts, not a claim that the user's
installed version was tested here. The task's stricter limits are project design decisions.
Current OpenAI documentation redirects some developers.openai.com URLs to learn.chatgpt.com.

## Source-derived facts (brief)

1. Codex non-interactive mode supports batch execution, JSONL events, stdin tasks and
   saved CLI authentication. Individual flags are version-dependent.
   https://developers.openai.com/codex/noninteractive
   Current redirect: https://learn.chatgpt.com/docs/non-interactive-mode

2. Local Codex supports ChatGPT sign-in and API-key sign-in; these are different access/billing
   modes. The app must let Codex manage authentication, not read its token files.
   https://developers.openai.com/codex/auth
   Current redirect: https://learn.chatgpt.com/docs/auth

3. Native Windows sandbox implementations differ. Supported setup and effective permissions
   must be checked on the selected installation; do not silently use full access.
   https://developers.openai.com/codex/windows
   Current redirect: https://learn.chatgpt.com/docs/windows/windows-sandbox

4. Codex CLI command reference and configuration documentation: use them with local --help,
   not as a reason to assume a new flag exists in the reported older PATH executable.
   https://developers.openai.com/codex/cli/reference
   https://developers.openai.com/codex/config-advanced

5. .NET ArgumentList handles argument escaping. It does not make an untrusted command or
   executable safe; selection and values still need authorization.
   https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.processstartinfo.argumentlist?view=net-10.0

6. Windows Job Objects manage associated process lifetimes, including kill-on-close behavior.
   This is distinct from a full filesystem/network security sandbox.
   https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects

7. dotnet build has explicit restore/build-server controls. dotnet test behavior/options
   depend on the selected test platform; .NET 10 supports a runner selection.
   https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-build
   https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-test

## Project evidence (not external research)

- The supplied M3 report lists PATH Codex 0.106.0. That is a historical reported observation,
  not a reason to hardcode this version or assume it equals the user's desktop app version.
- M3's user screenshots and “restart works as well” establish the lead's progression gate,
  not independent code-security certification.
- The original ARCHITECTURE.md already distinguished provider credentials from Codex login,
  control/data separation, human gates, one writer, and disposable-workspace limitations.

## Explicit design choices in this handoff

Dedicated local runner home; first live adapter uses Codex-managed ChatGPT login; three
approval purposes; named .NET recipes only; synthetic template only; 24-hour wait expiry and
30-minute active-work cap; no auto-resume/retry/merge. These are chosen M4 constraints, not
claims that external tools enforce all of them automatically.

## Unverified until implementation/operator checks

Exact installed CLI support, native sandbox setup, available models/account entitlements,
real login, JSONL compatibility with that executable, nested-job behavior, live solution
quality, and the complete real workflow. Report gaps rather than filling them with fixture
success or current-documentation assumptions.
