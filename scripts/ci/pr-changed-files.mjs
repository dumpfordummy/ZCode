// CLOUD-BOOTSTRAP-1: PR 变更文件清单。CI 检出的是 pull_request 的 merge commit，
// 第一父提交是集成分支的当前顶端，因此 `HEAD^1..HEAD` 恰好是这个 PR 引入的变更。
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** 返回新增/复制/修改/重命名/类型变更的文件（排除删除），相对仓库根。 */
export async function changedFilesSince(base = "HEAD^1", cwd = process.cwd()) {
  const { stdout } = await execFileAsync(
    "git",
    ["diff", "-z", "--name-only", "--diff-filter=ACMRT", base, "HEAD"],
    { cwd, maxBuffer: 64 * 1024 * 1024 },
  );
  return stdout.split("\0").filter(Boolean);
}
