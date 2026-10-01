import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir, userInfo } from "node:os";
import path from "node:path";

/**
 * 打包内容检查（Z8.1 §6）。读取真实的 win-unpacked 与 app.asar，
 * 对每个命中按上下文分类：只有写在例外清单里、与规则/文件/文本/次数完全一致的命中才算 benign，
 * 其它一律是 unexplained 并使检查失败。扫描只证明搜索过的内容，不是零出网或隔离的证据。
 */

export const INSPECTION_FILE = "package-inspection.json";

const BINARY_EXTENSIONS = new Set([
  ".exe", ".dll", ".node", ".png", ".jpg", ".jpeg", ".gif", ".ico", ".icns", ".pak", ".bin",
  ".dat", ".so", ".dylib", ".woff", ".woff2", ".ttf", ".otf", ".eot", ".zip", ".gz", ".br",
  ".lib", ".pdb", ".wasm", ".mp3", ".mp4", ".webm", ".webp", ".avif", ".asar", ".snap", ".blockmap",
  ".7z", ".tar", ".nupkg", ".pyc", ".map",
]);
const MAX_SCAN_BYTES = 64 * 1024 * 1024;

const SECRET_RULES = [
  ["openai-style-key", /\bsk-[A-Za-z0-9_-]{24,}/g],
  ["aws-access-key", /\bAKIA[0-9A-Z]{16}\b/g],
  ["github-token", /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g],
  ["slack-token", /\bxox[baprs]-[A-Za-z0-9-]{10,}/g],
  ["private-key-block", /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g],
  ["jwt-literal", /\beyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g],
];
const FIXTURE_RULE = /z1-local-fixture|Z1_ALLOW_PROVIDER_NETWORK|scripts[\\/]graph-engineering|provider-fixture|Z1_PACKAGED_EXE/g;
const PROFILE_RULE = /\.zcode-graph-engineering/g;
const PRIVATE_ADDRESS_RULE =
  /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/g;
const WINDOWS_USER_PATH = /[A-Za-z]:\\+Users\\+([^\\/"'`\s<>|:*?]+)\\+/gi;

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 构建上下文派生的、只与本机有关的规则：检出路径与构建用户名。 */
export function contextualRules({ checkoutRoot, userName }) {
  const rules = [];
  if (checkoutRoot) {
    const variants = new Set([checkoutRoot, checkoutRoot.replace(/\\/g, "/"), checkoutRoot.replace(/\\/g, "\\\\")]);
    rules.push(["build-checkout-path", new RegExp([...variants].map(escapeRegExp).join("|"), "gi")]);
  }
  if (userName)
    rules.push(["build-user-path", new RegExp(`[\\\\/]+Users[\\\\/]+${escapeRegExp(userName)}(?=[\\\\/"'\\s]|$)`, "gi")]);
  return rules;
}

const lineOf = (text, index) => {
  let line = 1;
  for (let i = text.indexOf("\n"); i !== -1 && i < index; i = text.indexOf("\n", i + 1)) line++;
  return line;
};
/** 上下文片段里出现的任何密钥形字面量一律遮蔽，避免报告本身泄漏它在寻找的东西。 */
const maskSecrets = (value) =>
  SECRET_RULES.reduce(
    (masked, [rule, pattern]) => masked.replace(new RegExp(pattern.source, pattern.flags), `[${rule}]`),
    value,
  );
const snippetOf = (text, index, length) =>
  maskSecrets(
    text
      .slice(Math.max(0, index - 50), Math.min(text.length, index + length + 50))
      .replace(/\s+/g, " "),
  ).slice(0, 160);
const redact = (rule, value) =>
  rule.endsWith("-key") || rule.endsWith("-token") || rule === "jwt-literal"
    ? `${value.slice(0, 6)}…(${value.length} chars)`
    : value.slice(0, 200);

/** 对一个文本做全部规则扫描。 */
export function scanText(relativePath, text, rules) {
  const hits = [];
  for (const [rule, pattern] of rules) {
    pattern.lastIndex = 0;
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
      hits.push({
        rule,
        file: relativePath,
        line: lineOf(text, match.index),
        match: redact(rule, match[0]),
        context: rule.endsWith("-key") || rule.endsWith("-token") ? "[redacted]" : snippetOf(text, match.index, match[0].length),
      });
      if (match[0].length === 0) pattern.lastIndex++;
    }
  }
  return hits;
}

function userPathRule() {
  // 通用的 Windows 用户目录：占位名称不算泄漏，其余作为 candidate 交由例外清单分类。
  return ["windows-user-directory", new RegExp(WINDOWS_USER_PATH.source, "gi")];
}

export function allRules(context) {
  return [
    ...SECRET_RULES,
    ["fixture-identifier", FIXTURE_RULE],
    ["profile-directory-name", PROFILE_RULE],
    ["private-address", PRIVATE_ADDRESS_RULE],
    userPathRule(),
    ...contextualRules(context),
  ].map(([rule, pattern]) => [rule, new RegExp(pattern.source, pattern.flags)]);
}

/**
 * 例外必须逐条写明：规则 + 精确文件 + 精确匹配文本 + 允许次数 + 原因。
 * 不接受目录级、通配或按规则整体豁免。
 */
export function validateExceptions(exceptions) {
  for (const e of exceptions) {
    for (const key of ["rule", "file", "match", "reason"])
      if (typeof e[key] !== "string" || !e[key].trim()) throw new Error(`Invalid scan exception: missing ${key}.`);
    if (!Number.isInteger(e.count) || e.count < 1) throw new Error("Invalid scan exception: count.");
    if (/[*?]/.test(e.file) || e.reason.trim().length < 20)
      throw new Error(`Scan exception for ${e.file} is not narrow or not explained.`);
  }
  return exceptions;
}

export function classifyHits(hits, exceptions) {
  const used = new Map();
  const explained = [];
  const unexplained = [];
  for (const hit of hits) {
    const index = exceptions.findIndex(
      (e) => e.rule === hit.rule && e.file === hit.file && e.match === hit.match,
    );
    const taken = index === -1 ? Infinity : (used.get(index) ?? 0);
    if (index !== -1 && taken < exceptions[index].count) {
      used.set(index, taken + 1);
      explained.push({ ...hit, classification: "benign", reason: exceptions[index].reason });
    } else unexplained.push({ ...hit, classification: "unexplained" });
  }
  const unused = exceptions.filter((e, i) => (used.get(i) ?? 0) < e.count);
  return { explained, unexplained, unusedExceptions: unused };
}

async function listAll(root) {
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) files.push(full);
    }
  }
  await walk(root);
  return files;
}

async function scanTree(root, label, rules, stats) {
  const hits = [];
  for (const full of await listAll(root)) {
    const relative = `${label}${path.relative(root, full).split(path.sep).join("/")}`;
    stats.files++;
    if (BINARY_EXTENSIONS.has(path.extname(full).toLowerCase())) {
      stats.skippedBinary++;
      continue;
    }
    const size = (await stat(full)).size;
    if (size > MAX_SCAN_BYTES) {
      stats.skippedLarge.push(relative);
      continue;
    }
    const buffer = await readFile(full);
    if (buffer.includes(0)) {
      stats.skippedBinary++;
      continue;
    }
    stats.bytes += size;
    hits.push(...scanText(relative, buffer.toString("utf8"), rules));
  }
  return hits;
}

const check = (id, ok, detail) => ({ id, status: ok ? "PASS" : "FAIL", detail });
const exists = async (file) => stat(file).then(() => true, () => false);

export async function inspectPackage({ root, distDirectory, version, exceptions, expected }) {
  const unpacked = path.join(distDirectory, "win-unpacked");
  const resources = path.join(unpacked, "resources");
  const checks = [];
  const need = async (id, relative) => checks.push(check(id, await exists(path.join(unpacked, relative)), relative));
  await need("executable", "ZCode Graph.exe");
  await need("asar", "resources/app.asar");
  for (const relative of expected.resources) await need(`resource:${relative}`, `resources/${relative}`);

  const requireFromDesktop = createRequire(path.join(root, "packages/desktop/package.json"));
  const asar = requireFromDesktop("@electron/asar");
  const extracted = await mkdtemp(path.join(tmpdir(), "graph-package-inspect-"));
  try {
    asar.extractAll(path.join(resources, "app.asar"), extracted);
    const manifest = JSON.parse(await readFile(path.join(extracted, "package.json"), "utf8"));
    checks.push(check("asar-main-entry", manifest.main === "out/main/graph-entry.mjs", `main=${manifest.main}`));
    checks.push(check("asar-version", manifest.version === version, `version=${manifest.version}`));
    checks.push(check("asar-flavor", manifest.zcodeProductFlavor === "graph", `zcodeProductFlavor=${manifest.zcodeProductFlavor}`));
    for (const relative of ["out/main/graph-entry.mjs", "out/main/graph-profile.mjs"])
      checks.push(check(`asar:${relative}`, await exists(path.join(extracted, relative)), relative));
    const identityPath = path.join(resources, "graph-build-identity.json");
    if (await exists(identityPath)) {
      const identity = JSON.parse(await readFile(identityPath, "utf8"));
      checks.push(check("identity-version", identity.version === version, `version=${identity.version}`));
      checks.push(check("identity-product", identity.product?.productName === "ZCode Graph" && identity.product?.appId === expected.appId, `${identity.product?.productName} ${identity.product?.appId}`));
      checks.push(check("identity-parallel-disabled", identity.capabilityPolicy?.parallel?.mode === "disabled", `parallel=${identity.capabilityPolicy?.parallel?.mode}`));
      checks.push(check("identity-telemetry-disabled", identity.capabilityPolicy?.automaticTelemetry?.enabled === false, "automaticTelemetry.enabled=false"));
    }
    const all = (await listAll(unpacked)).map((f) => path.relative(unpacked, f).split(path.sep).join("/"));
    const maps = all.filter((f) => f.endsWith(".map"));
    checks.push(check("no-sourcemaps-outside-asar", maps.length === 0, `${maps.length} .map file(s) beside the asar`));
    const asarFiles = (await listAll(extracted)).map((f) => path.relative(extracted, f).split(path.sep).join("/"));
    const asarMaps = asarFiles.filter((f) => f.endsWith(".map"));
    checks.push(check("no-sourcemaps-in-asar", asarMaps.length === 0, `${asarMaps.length} .map file(s) inside the asar`));
    const envFiles = [...all, ...asarFiles].filter((f) => /(^|\/)\.env(\.|$)/.test(f));
    checks.push(check("no-env-files", envFiles.length === 0, envFiles.slice(0, 5).join(", ") || "none"));

    const rules = allRules({ checkoutRoot: root, userName: userInfo().username });
    const stats = { files: 0, bytes: 0, skippedBinary: 0, skippedLarge: [] };
    const hits = [
      ...(await scanTree(extracted, "app.asar/", rules, stats)),
      ...(await scanTree(unpacked, "win-unpacked/", rules, stats)),
    ];
    const classified = classifyHits(hits, validateExceptions(exceptions));
    checks.push(check("content-scan-unexplained", classified.unexplained.length === 0, `${classified.unexplained.length} unexplained hit(s)`));
    const report = {
      schema: "zcode-graph-package-inspection/1",
      version,
      status: checks.every((c) => c.status === "PASS") ? "PASS" : "FAIL",
      checks,
      scan: {
        note: "A content scan is not evidence of zero network egress or of security isolation.",
        scannedFiles: stats.files,
        scannedBytes: stats.bytes,
        skippedBinaryFiles: stats.skippedBinary,
        skippedLargeFiles: stats.skippedLarge,
        totalHits: hits.length,
        explained: classified.explained.length,
        unexplained: classified.unexplained,
        unusedExceptions: classified.unusedExceptions,
        explainedHits: classified.explained,
      },
    };
    await writeFile(path.join(distDirectory, INSPECTION_FILE), `${JSON.stringify(report, null, 2)}\n`);
    return report;
  } finally {
    await rm(extracted, { recursive: true, force: true });
  }
}

export const digestOf = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
