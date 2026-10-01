#!/usr/bin/env node
// CLOUD-BOOTSTRAP-1: 以 PR 变更文件为范围运行架构检查。
// `pnpm architecture:check --changed` 只看工作区相对 HEAD 的差异，在干净的 CI 检出里等于空集；
// 这里改用 HEAD^1..HEAD 的 PR 差异，其余逻辑（策略、基线、global 违规）与仓库脚本完全一致。
import { checkArchitecture, formatReport } from "../architecture/index.mjs";
import { changedFilesSince } from "./pr-changed-files.mjs";

const changedFiles = await changedFilesSince(process.argv[2] ?? "HEAD^1");
console.log(`architecture: ${changedFiles.length} changed file(s) in scope`);
const result = await checkArchitecture({ cwd: process.cwd(), changedFiles });
console.log(formatReport(result));
process.exit(result.newViolations.length > 0 ? 1 : 0);
