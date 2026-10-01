// 定义核对：在一个合成 asar 上，electron-builder 的 hashHeader 与验证脚本使用的头部哈希是否一致。
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../../..");
const asar = createRequire(path.join(root, "packages/desktop/package.json"))("@electron/asar");
const builder = createRequire(path.join(root, "node_modules/app-builder-lib/package.json"))("./out/asar/asar.js");
const dir = mkdtempSync(path.join(tmpdir(), "z83-asar-"));
mkdirSync(path.join(dir, "src"));
writeFileSync(path.join(dir, "src", "a.js"), "console.log(1)");
const archive = path.join(dir, "synthetic.asar");
await asar.createPackage(path.join(dir, "src"), archive);
const sha = (v) => createHash("sha256").update(v).digest("hex");
const viaScript = sha(asar.getRawHeader(archive).headerString);
const { header } = await builder.readAsarHeader(archive);
console.log(JSON.stringify({ electronBuilderHashHeader: sha(header), verifierHashDefinition: viaScript, equal: sha(header) === viaScript }));
