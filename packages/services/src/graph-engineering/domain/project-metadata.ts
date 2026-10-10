import type { GraphProjectCandidate } from "../project-setup-types.js";
import { PROJECT_INVENTORY_BUDGET } from "./project-budgets.js";

/** Metadata hints only: never evaluates properties, imports, targets or project code. */
export function projectMetadata(
  path: string,
  content: string,
  sources: string[],
): GraphProjectCandidate {
  const kind = /\.csproj$/i.test(path) ? "project" : "solution";
  const item: GraphProjectCandidate = {
    path,
    kind,
    frameworks: [],
    projects: [],
    runner: "unknown",
    evidence: [],
    sourcePaths: [...sources],
    coverage: "review-required",
    issues: [],
  };
  const issue = (message: string) => {
    if (item.issues.length < 16 && !item.issues.includes(message)) item.issues.push(message);
  };
  const unsafeXml = /<!DOCTYPE|<!ENTITY|&(?!(?:amp|lt|gt|quot|apos);)|<\?(?!xml\s)/i.test(content);
  if (unsafeXml) issue("Unsupported XML/entity metadata; no external references were read.");
  if (kind === "solution") {
    const refs: string[] = [];
    const expression = /\.slnx$/i.test(path)
      ? /<Project\s+[^>]*Path\s*=\s*"([^"]+)"/g
      : /^Project\([^\r\n]+?=\s*"[^"]*",\s*"([^"]+\.csproj)"/gm;
    for (const match of content.matchAll(expression)) {
      if (refs.length >= PROJECT_INVENTORY_BUDGET.referenceEdges) {
        issue("Reference edge limit exceeded.");
        break;
      }
      refs.push(match[1]!);
    }
    item.projects = refs.flatMap((value) => {
      const resolved = metadataReference(path, value);
      if (!resolved) issue("External or dynamic solution project reference is unsupported.");
      return resolved ? [resolved] : [];
    });
    item.evidence.push(
      "Solution project references are metadata only; explicitly choose projects and frameworks.",
    );
  } else {
    if (
      !/<Project(?:\s|>)/.test(content) ||
      (!/<\/Project\s*>/.test(content) && !/<Project[^>]*\/>/.test(content))
    )
      issue("Malformed or unsupported project XML.");
    const frameworks: string[] = [];
    outer: for (const match of content.matchAll(
      /<TargetFrameworks?\s*>([^<]*)<\/TargetFrameworks?\s*>/g,
    )) {
      for (const value of match[1]!.matchAll(/[^;]+/g)) {
        if (frameworks.length >= 32) {
          issue("Framework metadata exceeds the 32-framework budget.");
          break outer;
        }
        frameworks.push(value[0].trim());
      }
    }
    item.frameworks = [...new Set(frameworks.filter((value) => /^[A-Za-z0-9_.-]+$/.test(value)))];
    if (!frameworks.length || frameworks.some((value) => !/^[A-Za-z0-9_.-]+$/.test(value)))
      issue("Target frameworks are absent or dynamic; no framework was guessed.");
    if (
      /Microsoft\.Testing\.Platform|<UseMicrosoftTestingPlatformRunner\s*>true|<TestingPlatformDotnetTestSupport\s*>true/i.test(
        content,
      )
    ) {
      item.runner = "mtp";
      issue(
        "Microsoft.Testing.Platform has a different invocation/evidence contract and is unsupported by the VSTest preset.",
      );
    } else if (
      /Microsoft\.NET\.Test\.Sdk|Microsoft\.TestPlatform\.targets|<VSTestTargetsPath/i.test(content)
    ) {
      item.runner = "vstest";
      item.evidence.push(
        "Explicit VSTest/Test SDK metadata; installed toolchain and actual execution remain unverified.",
      );
    } else if (/<IsTestProject\s*>false/i.test(content)) item.runner = "not-test";
    else item.evidence.push("No decisive runner metadata; a Test-like filename is only a hint.");
    for (const match of content.matchAll(/<ProjectReference\b[^>]*\bInclude\s*=\s*"([^"]+)"/g)) {
      if (item.projects.length >= PROJECT_INVENTORY_BUDGET.referenceEdges) {
        issue("Reference edge limit exceeded.");
        break;
      }
      const resolved = metadataReference(path, match[1]!);
      if (resolved) item.projects.push(resolved);
      else issue("External or dynamic ProjectReference is unsupported.");
    }
    if (/<(?:Target|UsingTask|Exec)\b/.test(content))
      issue("Custom Target/task execution cannot be proven by metadata discovery.");
    if (/\$\(|@\(|%\(|\bCondition\s*=|<Import\b/.test(content))
      issue("Dynamic properties, conditions or imports require explicit source/toolchain review.");
    for (const match of content.matchAll(
      /<(?:Compile|Content|None|EmbeddedResource)\b[^>]*\b(?:Include|Update)\s*=\s*"([^"]+)"/g,
    ))
      if (!metadataReference(path, match[1]!) || /[*?;]/.test(match[1]!))
        issue("Linked/dynamic resource inputs need a complete reviewed manifest.");
  }
  if (unsafeXml || item.issues.length) item.coverage = "unsupported";
  item.projects = [...new Set(item.projects)];
  return item;
}
export function metadataReference(parent: string, value: string): string | undefined {
  if (!value || /[:$@%&*?;]/.test(value) || /^[\\/]/.test(value)) return;
  const parts = parent.split("/").slice(0, -1);
  for (const part of value.replaceAll("\\", "/").split("/")) {
    if (part === ".") continue;
    if (part === "..") {
      if (!parts.length) return;
      parts.pop();
    } else if (!part || /[ .]$/.test(part)) return;
    else parts.push(part);
  }
  return parts.join("/") || undefined;
}
