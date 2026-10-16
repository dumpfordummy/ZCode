import template from "./web-profile-restore-policy.json" with { type: "json" };
import { parseProjectXml } from "./project-xml.js";

export interface WebRestoreIdentities {
  workspace: string;
  packageRoot: string;
  sdkDirectory: string;
  webProject: string;
  testProject: string;
}
const slash = (value: string) => value.replaceAll("\\", "/").replace(/\/+$/, "");
function relativeProject(from: string, to: string) {
  const a = from.split("/").slice(0, -1),
    b = to.split("/");
  while (a.length && b.length && a[0] === b[0]) {
    a.shift();
    b.shift();
  }
  return [...a.map(() => ".."), ...b].join("/");
}
/** Only known identity slots vary; every other restored dependency/target field stays exact. */
export function normalizeWebRestore(value: unknown, ids: WebRestoreIdentities): unknown {
  const workspace = slash(ids.workspace),
    packages = slash(ids.packageRoot),
    sdk = slash(ids.sdkDirectory);
  const web = slash(ids.webProject),
    tests = slash(ids.testProject);
  const webFile = web.split("/").at(-1)!,
    testFile = tests.split("/").at(-1)!;
  const webName = webFile.slice(0, -7),
    testName = testFile.slice(0, -7);
  const pairs = [
    [`${workspace}/${web}`, "$WEB_PROJECT_ABSOLUTE"],
    [`${workspace}/${tests}`, "$TEST_PROJECT_ABSOLUTE"],
    [`${workspace}/${web.slice(0, web.lastIndexOf("/"))}`, "$WEB_DIRECTORY"],
    [`${workspace}/${tests.slice(0, tests.lastIndexOf("/"))}`, "$TEST_DIRECTORY"],
    [packages, "$PACKAGES"],
    [sdk, "$SDK"],
    [workspace, "$WORKSPACE"],
    [relativeProject(tests, web), "$WEB_REFERENCE"],
    [web, "$WEB_PROJECT"],
    [tests, "$TEST_PROJECT"],
    [webFile, "$WEB_PROJECT_FILE"],
    [testFile, "$TEST_PROJECT_FILE"],
    [`${webName}.dll`, "$WEB_ASSEMBLY.dll"],
    [`${testName}.dll`, "$TEST_ASSEMBLY.dll"],
    [`${webName}/1.0.0`, "$WEB_NAME/1.0.0"],
    [`${testName}/1.0.0`, "$TEST_NAME/1.0.0"],
    [`${webName} >=`, "$WEB_NAME >="],
    [`${testName} >=`, "$TEST_NAME >="],
  ];
  const string = (raw: string) => {
    let result = raw.replaceAll("\\", "/");
    if (result === webName) return "$WEB_NAME";
    if (result === testName) return "$TEST_NAME";
    for (const [from, to] of pairs) if (from) result = result.replaceAll(from!, to!);
    return result;
  };
  const visit = (item: unknown): unknown => {
    if (typeof item === "string") return string(item);
    if (Array.isArray(item)) return item.map(visit);
    if (item && typeof item === "object") {
      const entries = Object.entries(item).map(
        ([key, child]) => [string(key), visit(child)] as const,
      );
      if (new Set(entries.map(([key]) => key)).size !== entries.length)
        throw Error("Ambiguous normalized restore identity.");
      return Object.fromEntries(entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    }
    return item;
  };
  return visit(value);
}
export function webRestoreXml(text: string) {
  const trim = (element: ReturnType<typeof parseProjectXml>): unknown => ({
    name: element.name,
    attributes: Object.fromEntries(
      Object.entries(element.attributes).map(([key, value]) => [key, value.trim()]),
    ),
    text: element.text.trim(),
    children: element.children.map(trim),
  });
  return trim(parseProjectXml(new TextEncoder().encode(text)));
}

export function validateWebRestoreShape(
  role: "web" | "test",
  value: unknown,
  ids: WebRestoreIdentities,
) {
  if (JSON.stringify(normalizeWebRestore(value, ids)) !== JSON.stringify(template[role]))
    throw Error(
      "Prior restore metadata has unmodeled packages, imports or configuration for this Web profile; setup will not restore or rewrite it.",
    );
}
