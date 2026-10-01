#!/usr/bin/env bash
# CLOUD-BOOTSTRAP-1: Linux Cloud job 的工具链与依赖安装，并记录被测试的确切身份。
# 版本以仓库自身的 pin 为准（mise.toml 与 package.json#packageManager），不在 workflow 里重复硬编码。
# 依赖用 `--frozen-lockfile --ignore-scripts` 安装：原生模块的 postinstall（electron、node-pty 等）
# 没有执行，因此本任务的原生部分设置是不完整的，相关检查不属于本套件。
set -euo pipefail

node_pin="$(sed -n 's/^node = "\(.*\)"$/\1/p' mise.toml)"
pnpm_pin="$(sed -n 's/^pnpm = "\(.*\)"$/\1/p' mise.toml)"
pm_field="$(node -p "require('./package.json').packageManager")"
[ -n "$node_pin" ] && [ -n "$pnpm_pin" ] || { echo "cannot read pins from mise.toml" >&2; exit 1; }
[ "$pm_field" = "pnpm@$pnpm_pin" ] || { echo "package.json packageManager '$pm_field' != pnpm@$pnpm_pin" >&2; exit 1; }

# 身份校验：检出必须是 pull_request 的 merge commit，且第二父提交就是 PR head。
head_sha="$(git rev-parse HEAD)"
[ "$head_sha" = "$GITHUB_SHA" ] || { echo "checked out $head_sha, expected $GITHUB_SHA" >&2; exit 1; }
[ "$(git rev-parse HEAD^2)" = "$PR_HEAD_SHA" ] || { echo "HEAD^2 is not the PR head $PR_HEAD_SHA" >&2; exit 1; }

toolchain="$RUNNER_TEMP/toolchain"
mkdir -p "$toolchain"
npm install --prefix "$toolchain" --no-audit --no-fund "node@$node_pin" "pnpm@$pnpm_pin"
tool_path="$toolchain/node_modules/node/bin:$toolchain/node_modules/.bin"
echo "$tool_path" >> "$GITHUB_PATH"
export PATH="$tool_path:$PATH"
[ "$(node -v)" = "v$node_pin" ] || { echo "node $(node -v) != v$node_pin" >&2; exit 1; }
[ "$(pnpm -v)" = "$pnpm_pin" ] || { echo "pnpm $(pnpm -v) != $pnpm_pin" >&2; exit 1; }

pnpm install --frozen-lockfile --ignore-scripts

{
  echo "### Tested identity"
  echo ""
  echo "- merge commit (tested): \`$head_sha\`"
  echo "- PR head (HEAD^2): \`$(git rev-parse HEAD^2)\`"
  echo "- integration base tip (HEAD^1): \`$(git rev-parse HEAD^1)\`"
  echo "- tree: \`$(git rev-parse 'HEAD^{tree}')\`"
  echo "- pnpm-lock.yaml sha256: \`$(sha256sum pnpm-lock.yaml | cut -d' ' -f1)\`"
  echo "- node \`$(node -v)\`, pnpm \`$(pnpm -v)\`, runner \`${ImageOS:-unknown}/${ImageVersion:-unknown}\`"
  echo "- dependency install: frozen lockfile, \`--ignore-scripts\` (native postinstall not run; native setup incomplete)"
} | tee -a "$GITHUB_STEP_SUMMARY"
