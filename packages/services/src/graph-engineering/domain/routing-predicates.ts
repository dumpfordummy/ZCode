import type { GraphPredicate } from "../contract.js";

export function pointerSegments(pointer: string): string[] {
  if (
    typeof pointer !== "string" ||
    pointer.length > 1024 ||
    (pointer !== "" && !pointer.startsWith("/"))
  )
    throw new Error("Invalid bounded JSON pointer.");
  if (!pointer) return [];
  const segments = pointer.slice(1).split("/");
  if (segments.length > 16) throw new Error("JSON pointer exceeds depth limit.");
  return segments.map((raw) => {
    if (/~(?:[^01]|$)/.test(raw)) throw new Error("Invalid JSON pointer escape.");
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (["__proto__", "prototype", "constructor"].includes(key))
      throw new Error("Unsafe JSON pointer key.");
    return key;
  });
}
/** Iterative validation bounds hostile nested input before recursive evaluation. */
export function predicateErrors(value: unknown): string[] {
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 1 }];
  let count = 0;
  while (stack.length) {
    const item = stack.pop()!;
    if (++count > 64 || item.depth > 8)
      return ["Condition predicate exceeds 64 nodes or depth eight."];
    if (!item.value || typeof item.value !== "object" || Array.isArray(item.value))
      return ["Condition predicate must be an object."];
    const p = item.value as Record<string, unknown>;
    // 操作符不能经过字符串强制转换；单元素数组会绕过枚举校验并落入错误的比较分支。
    if (typeof p.op !== "string") return ["Condition predicate operator must be a string."];
    let keys: string[];
    if (p.op === "all" || p.op === "any") {
      keys = ["op", "predicates"];
      if (!Array.isArray(p.predicates) || !p.predicates.length || p.predicates.length > 16)
        return ["Boolean combination requires one to sixteen predicates."];
      stack.push(...p.predicates.map((v) => ({ value: v, depth: item.depth + 1 })));
    } else if (p.op === "not") {
      keys = ["op", "predicate"];
      stack.push({ value: p.predicate, depth: item.depth + 1 });
    } else {
      if (!["eq", "neq", "gt", "gte", "lt", "lte", "present"].includes(p.op))
        return ["Unsupported condition predicate."];
      keys = p.op === "present" ? ["op", "alias", "pointer"] : ["op", "alias", "pointer", "value"];
      if (typeof p.alias !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(p.alias))
        return ["Invalid condition input alias."];
      try {
        pointerSegments(p.pointer as string);
      } catch (error) {
        return [(error as Error).message];
      }
      if (
        p.op !== "present" &&
        !(
          p.value === null ||
          typeof p.value === "boolean" ||
          (typeof p.value === "string" && p.value.length <= 2000) ||
          (typeof p.value === "number" && Number.isFinite(p.value))
        )
      )
        return ["Condition constants must be bounded finite JSON scalars."];
    }
    if (Object.keys(p).length !== keys.length || Object.keys(p).some((key) => !keys.includes(key)))
      return ["Unknown or missing condition predicate fields."];
  }
  return [];
}
export function predicateAliases(value: GraphPredicate): string[] {
  if ("predicates" in value) return value.predicates.flatMap(predicateAliases);
  return "predicate" in value ? predicateAliases(value.predicate) : [value.alias];
}
export function predicateNodeCount(value: GraphPredicate): number {
  if ("predicates" in value)
    return 1 + value.predicates.reduce((count, child) => count + predicateNodeCount(child), 0);
  return "predicate" in value ? 1 + predicateNodeCount(value.predicate) : 1;
}
