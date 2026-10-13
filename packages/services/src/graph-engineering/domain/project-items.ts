import { validateGraphRelativePath } from "./artifact-schemas.js";
import type { ProjectXmlElement } from "./project-xml.js";

export const fileItemNames = new Set(["Compile", "Content", "None", "EmbeddedResource"]);
const excluded = new Set(["bin", "obj", ".git", ".zcode"]);
export interface ProjectFileOperation {
  kind: string;
  action: "Include" | "Update" | "Remove";
  patterns: string[];
  excludes: string[];
  metadata: Record<string, string>;
}
export function projectItemPath(project: string, value: string, allowExcluded = false): string {
  if (!value || /[:$@%&]|^[\\/]/.test(value))
    throw Error(`Unresolved or external input path: ${value}.`);
  const parts = project.split("/").slice(0, -1);
  for (const part of value.replaceAll("\\", "/").split("/")) {
    if (part === ".") continue;
    if (part === "..") {
      if (!parts.length) throw Error(`Input resolves outside the workspace: ${value}.`);
      parts.pop();
    } else {
      if (!part) throw Error(`Empty input path segment: ${value}.`);
      parts.push(part);
    }
  }
  const path = parts.join("/");
  validateGraphRelativePath(path.replaceAll("*", "x").replaceAll("?", "x"));
  if (!allowExcluded && parts.some((part) => excluded.has(part.toLowerCase())))
    throw Error(`Declared input contradicts an excluded state/output directory: ${value}.`);
  if (parts.some((part) => part.includes("**") && part !== "**"))
    throw Error(`Recursive wildcard must occupy a complete path segment: ${value}.`);
  return path;
}
export function projectPattern(pattern: string): RegExp {
  const pieces = pattern.split("/");
  const expression = pieces
    .map((part, index) => {
      if (part === "**") return index === pieces.length - 1 ? ".*" : "(?:[^/]+/)*";
      return (
        part
          .replace(/[.+^${}()|[\]\\]/g, "\\$&")
          .replaceAll("*", "[^/]*")
          .replaceAll("?", "[^/]") + (index < pieces.length - 1 ? "/" : "")
      );
    })
    .join("");
  return new RegExp(`^${expression}$`, "i");
}
export function projectPatternMayEnter(pattern: string, directory: string): boolean {
  const segments = pattern.split("/");
  return segments.some(
    (_, index) =>
      index < segments.length - 1 &&
      projectPattern(segments.slice(0, index + 1).join("/")).test(directory),
  );
}
export function projectPatternExcludesTree(pattern: string, directory: string): boolean {
  return (
    pattern === "**" ||
    (pattern.endsWith("/**") && projectPattern(pattern.slice(0, -3)).test(directory))
  );
}
export function readFileOperation(project: string, entry: ProjectXmlElement): ProjectFileOperation {
  const actions = (["Include", "Update", "Remove"] as const).filter(
    (key) => key in entry.attributes,
  );
  if (actions.length !== 1 || entry.text.trim())
    throw Error(`Invalid ${entry.name} item operation.`);
  const action = actions[0]!;
  const metadata: Record<string, string> = {};
  const allowed = new Set([
    "CopyToOutputDirectory",
    "CopyToPublishDirectory",
    "Link",
    "TargetPath",
    "LogicalName",
    "DependentUpon",
  ]);
  const setMetadata = (key: string, value: string) => {
    if (!allowed.has(key) || /[$@%]|[\r\n]/.test(value) || Object.hasOwn(metadata, key))
      throw Error(`Unsupported ${entry.name} metadata: ${key}.`);
    if (key.startsWith("CopyTo")) {
      if (!["Never", "Always", "PreserveNewest", "IfDifferent"].includes(value))
        throw Error(`Unsupported ${key} value: ${value}.`);
    } else if (key === "LogicalName") {
      if (!/^[A-Za-z0-9_.-]+$/.test(value)) throw Error("Unsupported LogicalName.");
    } else {
      validateGraphRelativePath(value.replaceAll("\\", "/"));
      if (/[;*?]/.test(value)) throw Error(`Unsafe output mapping: ${key}.`);
    }
    metadata[key] = value;
  };
  for (const [key, value] of Object.entries(entry.attributes)) {
    if ([action, "Exclude"].includes(key)) continue;
    setMetadata(key, value);
  }
  for (const child of entry.children) {
    if (Object.keys(child.attributes).length || child.children.length)
      throw Error(`Unsupported ${entry.name} metadata: ${child.name}.`);
    setMetadata(child.name, child.text.trim());
  }
  if (
    (action !== "Include" && entry.attributes.Exclude !== undefined) ||
    (action === "Remove" && Object.keys(metadata).length)
  )
    throw Error(`Unsupported ${entry.name} ${action} metadata/Exclude.`);
  const list = (value: string, allowExcluded = false) => {
    const values = value
      .split(";")
      .filter((part) => part.trim())
      .map((part) => projectItemPath(project, part.trim(), allowExcluded));
    if (!values.length || values.length > 1024)
      throw Error("File-list budget exceeded or empty declaration.");
    return values;
  };
  return {
    kind: entry.name,
    action,
    patterns: list(entry.attributes[action]!, action === "Remove"),
    excludes: entry.attributes.Exclude ? list(entry.attributes.Exclude, true) : [],
    metadata,
  };
}

/** 保留声明顺序：Update 不创造项，Exclude 仅过滤本次 Include；覆盖清单另取保守超集。 */
export function evaluateFileItems(
  project: string,
  files: string[],
  operations: ProjectFileOperation[],
  defaults: { all: boolean; compile: boolean; resource: boolean; none: boolean },
) {
  const available = new Set(files);
  if (
    operations.length > 2048 ||
    operations.reduce((sum, operation) => sum + operation.patterns.length * files.length, 0) >
      1000000
  )
    throw Error("File-item expansion budget exceeded; narrow the selected scope or declarations.");
  const folder = project.slice(0, project.lastIndexOf("/") + 1);
  const items = new Map<string, { kind: string; path: string; metadata: Record<string, string> }>();
  const key = (kind: string, path: string) => `${kind}:${path.toLowerCase()}`;
  if (defaults.all)
    for (const path of files) {
      if (
        !path.startsWith(folder) ||
        path
          .slice(folder.length)
          .split("/")
          .slice(0, -1)
          .some((p) => p.startsWith(".")) ||
        /(?:\.(?:user|[^/.]*proj|sln|vssscc)|\/\.DS_Store)$/i.test(path)
      )
        continue;
      const kind =
        /\.cs$/i.test(path) && defaults.compile
          ? "Compile"
          : /\.resx$/i.test(path) && defaults.resource
            ? "EmbeddedResource"
            : defaults.none && !/\.(cs|resx)$/i.test(path)
              ? "None"
              : undefined;
      if (kind) items.set(key(kind, path), { kind, path, metadata: {} });
    }
  for (const operation of operations) {
    const patterns = operation.patterns.map(projectPattern);
    if (operation.action !== "Include") {
      for (const [id, item] of items)
        if (item.kind === operation.kind && patterns.some((p) => p.test(item.path))) {
          if (operation.action === "Remove") items.delete(id);
          else Object.assign(item.metadata, operation.metadata);
        }
      continue;
    }
    const excludes = operation.excludes.map(projectPattern);
    const selected = operation.patterns.flatMap((pattern, index) =>
      /[*?]/.test(pattern) ? files.filter((path) => patterns[index]!.test(path)) : [pattern],
    );
    for (const path of selected) {
      if (excludes.some((pattern) => pattern.test(path))) continue;
      const id = key(operation.kind, path);
      if (items.has(id))
        throw Error(`Duplicate ${operation.kind} item: ${path}. Use Update for existing items.`);
      items.set(id, { kind: operation.kind, path, metadata: { ...operation.metadata } });
    }
  }
  for (const item of items.values()) {
    if (!available.has(item.path))
      throw Error(`Required literal ${item.kind} input is absent or case-ambiguous: ${item.path}.`);
  }
  return [...items.values()];
}
