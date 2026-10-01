# 演练 GRAPH_DATA_OPERATIONS.md 里的 PowerShell 命令：只针对一次性数据；USERPROFILE 仅在本进程里指向临时目录。
$ErrorActionPreference = 'Continue'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $repo
$doc = Get-Content -LiteralPath (Join-Path $repo 'docs/graph-engineering/z8/GRAPH_DATA_OPERATIONS.md') -Raw
$blocks = [regex]::Matches($doc, '(?s)```powershell\r?\n(.*?)```') | ForEach-Object { $_.Groups[1].Value }
"doc powershell blocks: $($blocks.Count)"

$sandbox = Join-Path ([IO.Path]::GetTempPath()) ("z82-docrehearsal-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $sandbox | Out-Null
$realProfile = $env:USERPROFILE
$env:USERPROFILE = $sandbox   # 仅本进程；文档里的 $env:USERPROFILE 因此指向一次性目录
try {
  $graph = Join-Path $env:USERPROFILE '.zcode-graph-engineering\home\.zcode\v2\graph-engineering'
  New-Item -ItemType Directory -Path $graph -Force | Out-Null
  $fixture = Join-Path $repo 'docs/graph-engineering/z8/fixtures/historical/z75-approval-pending-prereconcile/graph-engineering'
  Copy-Item -Path (Join-Path $fixture '*') -Destination $graph -Recurse
  New-Item -ItemType Directory -Path (Join-Path $graph 'artifacts\w\r') -Force | Out-Null
  Set-Content -LiteralPath (Join-Path $graph 'artifacts\w\r\a.json') -Value '{}'
  # 必须被排除在备份之外的东西
  New-Item -ItemType Directory -Path (Join-Path $graph 'workspaces\project-copy') -Force | Out-Null
  Set-Content -LiteralPath (Join-Path $graph 'workspaces\project-copy\source.txt') -Value 'project source copy'
  New-Item -ItemType Directory -Path (Join-Path $graph 'abc.json.lock') -Force | Out-Null
  Set-Content -LiteralPath (Join-Path $graph 'abc.json.lock\owner.json') -Value '{}'
  Set-Content -LiteralPath (Join-Path $graph 'provider_config.json') -Value '{"synthetic":"not a graph file"}'

  $recordFile = Get-ChildItem -LiteralPath $graph -File | Where-Object { $_.Name -match '^[0-9a-f]{64}\.json$' } | Select-Object -First 1
  $originalHash = (Get-FileHash -LiteralPath $recordFile.FullName -Algorithm SHA256).Hash.ToLower()
  $key = (Get-Content -LiteralPath $recordFile.FullName -Raw | ConvertFrom-Json).workspaceKey

  # 1) 文档里的备份块（原样执行）
  $count = Invoke-Expression $blocks[0]
  $backupDir = Get-ChildItem -LiteralPath $sandbox -Directory -Filter 'graph-engineering-backup-*' | Select-Object -First 1
  $names = Get-ChildItem -LiteralPath $backupDir.FullName -Recurse -File | ForEach-Object { $_.FullName.Substring($backupDir.FullName.Length + 1) }
  "backup file count reported: $count"
  "backup contains workspaces: " + [bool]($names | Where-Object { $_ -like 'workspaces*' })
  "backup contains lock: " + [bool]($names | Where-Object { $_ -like '*.lock*' })
  "backup contains provider_config: " + [bool]($names | Where-Object { $_ -like 'provider_config*' })
  "backup contains record: " + [bool]($names | Where-Object { $_ -match '^[0-9a-f]{64}\.json$' })
  "backup contains artifacts: " + [bool]($names | Where-Object { $_ -like 'artifacts*' })

  # 2) 对账一次（产生快照），再运行文档里的 list 与 restore 块
  $status = node --import tsx scripts/graph-engineering/reconcile-directory.mjs $graph 2>$null
  "reconciled status: $status"
  $afterHash = (Get-FileHash -LiteralPath $recordFile.FullName -Algorithm SHA256).Hash.ToLower()
  "record changed by reconcile: " + ($afterHash -ne $originalHash)
  $listText = Invoke-Expression $blocks[1] 2>$null | Out-String
  $listed = $listText | ConvertFrom-Json
  "list shows snapshot ids: " + (($listed[0].snapshots | ForEach-Object { $_.id.Substring(0, 12) }) -join ',')
  $restoreBlock = $blocks[2] -replace '<exact workspace key from the list output>', ($key -replace "'", "''")
  $restoreBlock = $restoreBlock -replace '<id-or-prefix>', $originalHash.Substring(0, 12)
  $hashBeforeRefusal = (Get-FileHash -LiteralPath $recordFile.FullName -Algorithm SHA256).Hash
  Invoke-Expression ($restoreBlock -replace '--yes', '') 2>$null | Out-Null
  "restore without --yes refused (nonzero exit, record unchanged): " + (($LASTEXITCODE -ne 0) -and ((Get-FileHash -LiteralPath $recordFile.FullName -Algorithm SHA256).Hash -eq $hashBeforeRefusal))
  $out = Invoke-Expression $restoreBlock 2>$null | Out-String
  "restore result: " + ($out -replace '\s+', ' ').Substring(0, [Math]::Min(160, ($out -replace '\s+', ' ').Length))
  $restoredHash = (Get-FileHash -LiteralPath $recordFile.FullName -Algorithm SHA256).Hash.ToLower()
  "restored bytes equal original: " + ($restoredHash -eq $originalHash)
  "provider_config untouched: " + ((Get-Content -LiteralPath (Join-Path $graph 'provider_config.json') -Raw) -match 'synthetic')
} finally {
  $env:USERPROFILE = $realProfile
}
node -e "require('fs').rmSync(process.argv[1], { recursive: true, force: true })" $sandbox
"sandbox removed: " + (-not (Test-Path -LiteralPath $sandbox))
