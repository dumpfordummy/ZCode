import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const requireFromDesktop = createRequire(path.join(root, "packages/desktop/package.json"));

/** 合成的打包目录（真实的 app.asar，由 @electron/asar 创建），供检查与清单测试共用。 */
export async function syntheticPackage(directory, { leak }) {
  const unpacked = path.join(directory, "win-unpacked");
  const resources = path.join(unpacked, "resources");
  const app = path.join(directory, "app-source");
  await mkdir(path.join(app, "out/main"), { recursive: true });
  await mkdir(path.join(resources, "glm"), { recursive: true });
  await mkdir(path.join(resources, "config/provider"), { recursive: true });
  await writeFile(
    path.join(app, "package.json"),
    JSON.stringify({
      name: "zcode",
      main: "out/main/graph-entry.mjs",
      version: "3.14.3-z8.1",
      zcodeProductFlavor: "graph",
    }),
  );
  await writeFile(path.join(app, "out/main/graph-entry.mjs"), leak ? `// ${leak}\n` : "// entry\n");
  await writeFile(path.join(app, "out/main/graph-profile.mjs"), "// profile\n");
  await requireFromDesktop("@electron/asar").createPackage(app, path.join(resources, "app.asar"));
  await writeFile(path.join(unpacked, "ZCode Graph.exe"), "MZ");
  await writeFile(path.join(resources, "THIRD-PARTY-NOTICES.md"), "notices");
  await writeFile(path.join(resources, "icon.png"), "png");
  await writeFile(path.join(resources, "config/default.json"), "{}");
  await writeFile(path.join(resources, "config/provider/zcode-builtin.json"), "{}");
  await writeFile(path.join(resources, "glm/zcode.cjs"), "// agent\n");
  await writeFile(
    path.join(resources, "graph-build-identity.json"),
    JSON.stringify({
      version: "3.14.3-z8.1",
      product: { productName: "ZCode Graph", appId: "dev.dumpfordummy.zcode.graph" },
      capabilityPolicy: { parallel: { mode: "disabled" }, automaticTelemetry: { enabled: false } },
    }),
  );
}
export const expected = {
  appId: "dev.dumpfordummy.zcode.graph",
  resources: [
    "graph-build-identity.json",
    "THIRD-PARTY-NOTICES.md",
    "config/default.json",
    "config/provider/zcode-builtin.json",
    "icon.png",
    "glm/zcode.cjs",
  ],
};
