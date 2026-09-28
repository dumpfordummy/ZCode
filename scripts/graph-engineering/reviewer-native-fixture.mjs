import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const REQUEST = "Modify zz-demo.txt file content to after";
export const TEST_NAME = "zz-demo contains after";
export const SOURCE_PATHS = ["zz-demo.txt", "build.mjs", "test.mjs"];
export const recipes = [
  {
    id: "reviewer-build",
    name: "Build demo",
    executable: "node",
    args: ["build.mjs", "{operationId}", "{sourceDigest}"],
    cwd: ".",
    timeoutMs: 30000,
    sourcePaths: SOURCE_PATHS,
    expectedOutputs: ["build.out"],
    verifier: { kind: "build" },
  },
  {
    id: "reviewer-test",
    name: "Test demo content",
    executable: "node",
    args: ["test.mjs", "{operationId}", "{sourceDigest}", "{buildDigest}", "{reportPath}"],
    cwd: ".",
    timeoutMs: 30000,
    sourcePaths: SOURCE_PATHS,
    expectedOutputs: [],
    verifier: {
      kind: "test",
      format: "zcode-json-v1",
      reportPath: "results/report.json",
      minimumTests: 1,
      expectedTests: 1,
      requiredTests: [TEST_NAME],
      buildNodeId: "build",
    },
  },
];

export async function prepareReviewerFixture(isolation) {
  const files = {
    "AGENTS.md":
      "Synthetic reviewer acceptance. Read zz-demo.txt; change only that file to the requested content. Preserve build.mjs and test.mjs. Graph executes the configured Build/Test. No external files, commands, credentials or network.\n",
    "Context.md":
      "Local file contents are the acceptance scope. Git tracking is not required. The configured check asserts that zz-demo.txt is exactly after.\n",
    ".gitignore": "zz-demo.txt\nbuild.out\nresults/\n.zcode/\n",
    "zz-demo.txt": "before",
    "build.mjs": `import { readFile, writeFile } from 'node:fs/promises';
const [operationId, sourceDigest] = process.argv.slice(2);
const content = await readFile('zz-demo.txt', 'utf8');
await writeFile('build.out', JSON.stringify({ operationId, sourceDigest, content }));
console.log(JSON.stringify({ operationId, sourceDigest, built: 'build.out' }));
`,
    "test.mjs": `import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const [operationId, sourceDigest, buildDigest, reportPath] = process.argv.slice(2);
const content = await readFile('zz-demo.txt', 'utf8');
const built = JSON.parse(await readFile('build.out', 'utf8'));
const passed = content === 'after' && built.content === content && built.sourceDigest === sourceDigest;
const report = { format: 'zcode-test-v1', operationId, sourceDigest, buildDigest,
  tests: [{ name: ${JSON.stringify(TEST_NAME)}, status: passed ? 'passed' : 'failed',
    message: passed ? 'Current source and build contain exactly after' : 'Expected exactly after in current source and build' }] };
await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, JSON.stringify(report));
console.log(JSON.stringify({ operationId, sourceDigest, buildDigest, reportPath, passed }));
process.exitCode = passed ? 0 : 1;
`,
  };
  for (const [name, content] of Object.entries(files))
    await writeFile(path.join(isolation.workspace, name), content);
  await mkdir(path.join(isolation.workspace, ".zcode"), { recursive: true });
  // 配置只声明命令；执行必须由 Graph Tool/native runtime 完成，驱动不预跑脚本。
  await writeFile(
    path.join(isolation.workspace, ".zcode/config.json"),
    JSON.stringify({ graphRecipes: recipes }),
  );
  return files;
}
