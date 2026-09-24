# Reproduce the project-local Windows toolchain

The implementation session used Node 24.14.0 and pnpm 10.33.2, matching `mise.toml`. These commands download public tool distributions into the checkout, not global installation directories. Run in the repository root using PowerShell. They do not read or change ZCode/Codex settings.

```powershell
$z1Tools = Join-Path (Get-Location) '.tmp/z1-toolchain'
New-Item -ItemType Directory -Force $z1Tools | Out-Null
Invoke-WebRequest 'https://nodejs.org/dist/v24.14.0/node-v24.14.0-win-x64.zip' -OutFile (Join-Path $z1Tools 'node-v24.14.0-win-x64.zip')
Expand-Archive -LiteralPath (Join-Path $z1Tools 'node-v24.14.0-win-x64.zip') -DestinationPath $z1Tools -Force
Invoke-WebRequest 'https://registry.npmjs.org/pnpm/-/pnpm-10.33.2.tgz' -OutFile (Join-Path $z1Tools 'pnpm-10.33.2.tgz')
tar -xf (Join-Path $z1Tools 'pnpm-10.33.2.tgz') -C $z1Tools
@'
@echo off
"%~dp0node-v24.14.0-win-x64\node.exe" "%~dp0package\bin\pnpm.cjs" %*
'@ | Set-Content -LiteralPath (Join-Path $z1Tools 'pnpm.cmd') -Encoding ascii
$env:PATH = "$z1Tools;$z1Tools\node-v24.14.0-win-x64;$env:PATH"
$env:HUSKY = '0'
$env:PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN = 'false'
$env:npm_config_cache = Join-Path (Get-Location) '.npm-cache'
$env:ELECTRON_CACHE = Join-Path (Get-Location) '.electron-cache'
node --version
pnpm --version
```

Continue with the sequential build and native/manual commands in [Z1_REPORT.md](Z1_REPORT.md). Keep the PowerShell session open so these process-local environment variables remain active. Do not launch the standard `dev:desktop` command for this isolated verification: the documented wrapper additionally isolates early home reads and suppresses shared OS registration mutations.
