# 最终集成验收流水线（串行）：typecheck 会向 out/host 写文件，所以 Desktop 构建必须在它之后、原生运行之前。
# 用法：powershell -File final-pipeline.ps1 -Main <主 checkout 根目录，含 .tmp/z1-toolchain> -Log <日志目录>
param([string]$Main, [string]$Log)
$ErrorActionPreference = 'Continue'
$wt = (Resolve-Path "$PSScriptRoot\..\..\..\..").Path
Set-Location $wt
$env:PATH = "$Main\.tmp\z1-toolchain\node-v24.14.0-win-x64;$Main\.tmp\z1-toolchain;$env:PATH"
New-Item -ItemType Directory -Force $Log | Out-Null
$results = [ordered]@{}
function Step($name, [scriptblock]$body) {
  & $body *> "$Log\$name.log"
  $results[$name] = $LASTEXITCODE
  "$name exit=$LASTEXITCODE"
}
Step 'freshness' { node scripts/check-workspace-freshness.mjs }
Step 'typecheck' { pnpm typecheck }
Step 'lint' { pnpm lint }
Step 'architecture' { pnpm architecture:check --changed }
Step 'ui-tests' {
  $files = Get-ChildItem packages/ui/test -Filter 'graph*.test.ts' | ForEach-Object { $_.FullName }
  node --import tsx --test @files
}
Step 'services-graph-tests' {
  $files = Get-ChildItem packages/services/src/graph-engineering -Recurse -Filter '*.test.ts' | Sort-Object FullName | ForEach-Object { $_.FullName }
  node --import tsx --test @files
}
Step 'helper-tests' { node --test scripts/graph-engineering/pre-z8-u2-proof.test.mjs scripts/graph-engineering/pre-z8-u2-fixture.test.mjs scripts/graph-engineering/z6-provider-responses.test.mjs }
Step 'desktop-build' { pnpm --filter "@zcode/desktop" build:no-runtime-assets }
# 冻结产物哈希（CLI 为复用产物，其余为本次构建）
$hashes = [ordered]@{}
foreach ($f in @('apps/zcode-cli/packages/cli/dist/zcode.cjs','packages/desktop/out/main/index.js','packages/desktop/out/host/index.js','packages/desktop/out/preload/index.cjs')) {
  $hashes[$f] = @{ sha256 = (Get-FileHash $f -Algorithm SHA256).Hash.ToLower(); written = (Get-Item $f).LastWriteTime.ToString('o') }
}
$renderer = Get-ChildItem packages/desktop/out/renderer/assets -Filter 'index-*.js' | Select-Object -First 1
$hashes["packages/desktop/out/renderer/assets/$($renderer.Name)"] = @{ sha256 = (Get-FileHash $renderer.FullName -Algorithm SHA256).Hash.ToLower(); written = $renderer.LastWriteTime.ToString('o') }
$hashes | ConvertTo-Json -Depth 4 | Set-Content "$Log\artifact-hashes.json" -Encoding utf8
# 清理旧证据，然后用最终构建重跑
Remove-Item -Recurse -Force docs/graph-engineering/ux-audit/evidence -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force docs/graph-engineering/ux-audit/screenshots/after -ErrorAction SilentlyContinue
$native = [ordered]@{}
foreach ($s in 'pass','prose-fence','unbound-report','needs_changes','needs_human','test-failure') {
  $r = node scripts/graph-engineering/reviewer-native.mjs --scenario=$s 2>&1 | Out-String
  $native["reviewer-native:$s"] = if ($r -match '"status": "PASS"') { 'PASS' } else { 'FAIL' }
  "reviewer-native $s => $($native["reviewer-native:$s"])"
}
foreach ($a in @('--scenario=pass','--scenario=prose-fence','--scenario=unbound-report','--scenario=needs_changes','--scenario=needs_human','--scenario=test-failure','--scenario=prose-fence --theme=light','--scenario=pass --locale=zh-CN','--scenario=test-failure --locale=zh-CN')) {
  $r = node docs/graph-engineering/ux-audit/tools/tour-after.mjs @($a -split ' ') 2>&1 | Out-String
  $native["tour-after:$a"] = if ($r -match '(?m)^ok ') { 'PASS' } else { 'FAIL' }
  "tour-after $a => $($native["tour-after:$a"])"
}
[ordered]@{ steps = $results; native = $native } | ConvertTo-Json -Depth 4 | Set-Content "$Log\pipeline-results.json" -Encoding utf8
"done"
