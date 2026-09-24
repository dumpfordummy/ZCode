import type { GraphJsonSchema, GraphJsonValue } from "../artifact-types.js";

export const GRAPH_ARTIFACT_BYTES = 256 * 1024;
const MAX_DEPTH = 16;
const MAX_MEMBERS = 4096;
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const assertKey = (key: string): void => {
  if (["__proto__", "constructor", "prototype"].includes(key))
    throw new Error("Reserved object keys are unsupported in Graph JSON.");
};

/** JSON.parse remains the decoder; this bounded lexical pass rejects silent duplicate-key loss. */
export function parseBoundedGraphJson(text: string): GraphJsonValue {
  if (typeof text !== "string" || new TextEncoder().encode(text).length > GRAPH_ARTIFACT_BYTES)
    throw new Error("JSON exceeds the 256 KiB byte limit.");
  let offset = 0,
    members = 0;
  const whitespace = () => {
    while (/[\t\n\r ]/.test(text[offset] ?? "!")) offset++;
  };
  const string = (): string => {
    const start = offset++;
    while (offset < text.length) {
      const char = text[offset++];
      if (char === '"') return JSON.parse(text.slice(start, offset)) as string;
      if (char === "\\") offset++;
    }
    throw new Error("Invalid JSON string.");
  };
  const item = (depth: number): void => {
    if (depth > MAX_DEPTH) throw new Error("JSON exceeds the 16-level depth limit.");
    if (++members > MAX_MEMBERS) throw new Error("JSON exceeds the 4096-member limit.");
    whitespace();
    const char = text[offset];
    if (char === '"') {
      string();
      return;
    }
    if (char === "{" || char === "[") {
      const object = char === "{",
        end = object ? "}" : "]",
        keys = new Set<string>();
      offset++;
      whitespace();
      if (text[offset] === end) {
        offset++;
        return;
      }
      for (;;) {
        if (object) {
          if (text[offset] !== '"') throw new Error("Invalid JSON object key.");
          const key = string();
          assertKey(key);
          if (keys.has(key)) throw new Error(`Duplicate JSON key: ${key.slice(0, 80)}.`);
          keys.add(key);
          whitespace();
          if (text[offset++] !== ":") throw new Error("Invalid JSON object separator.");
        }
        item(depth + 1);
        whitespace();
        if (text[offset] === end) {
          offset++;
          return;
        }
        if (text[offset++] !== ",") throw new Error("Invalid JSON collection separator.");
        whitespace();
      }
    }
    const token = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(
      text.slice(offset),
    );
    if (!token) throw new Error("Invalid strict JSON value.");
    if (/^[\d-]/.test(token[0]) && !Number.isFinite(Number(token[0])))
      throw new Error("JSON number must be finite.");
    offset += token[0].length;
  };
  item(0);
  whitespace();
  if (offset !== text.length) throw new Error("Strict JSON has trailing data.");
  return JSON.parse(text) as GraphJsonValue;
}

export function validateGraphJsonSchema(input: unknown): GraphJsonSchema {
  const serialized = JSON.stringify(input);
  if (typeof serialized !== "string" || new TextEncoder().encode(serialized).length > 32 * 1024)
    throw new Error("Local JSON schema exceeds the 32 KiB byte limit.");
  let nodes = 0;
  const check = (value: unknown, depth: number): void => {
    if (!record(value) || depth > 8 || ++nodes > 256)
      throw new Error("Invalid or oversized local JSON schema.");
    const allowed: Record<string, string[]> = {
      object: ["type", "properties", "required", "additionalProperties"],
      array: ["type", "items", "minItems", "maxItems"],
      string: ["type", "enum", "minLength", "maxLength"],
      number: ["type", "enum", "minimum", "maximum"],
      boolean: ["type", "enum"],
      null: ["type"],
    };
    const kind = typeof value.type === "string" ? value.type : "";
    if (!own(allowed, kind) || Object.keys(value).some((key) => !allowed[kind]!.includes(key)))
      throw new Error("Unsupported local JSON schema keyword/type.");
    if (kind === "object") {
      if (
        !record(value.properties) ||
        Object.keys(value.properties).length > 64 ||
        !Array.isArray(value.required) ||
        value.additionalProperties !== false ||
        value.required.some(
          (key) => typeof key !== "string" || !own(value.properties as object, key),
        ) ||
        new Set(value.required).size !== value.required.length
      )
        throw new Error("Invalid object schema properties/required/additionalProperties.");
      for (const [key, child] of Object.entries(value.properties)) {
        assertKey(key);
        if (!key || key.length > 128) throw new Error("Invalid schema property name.");
        check(child, depth + 1);
      }
    }
    if (kind === "array") check(value.items, depth + 1);
    const bounds =
      kind === "string"
        ? ["minLength", "maxLength"]
        : kind === "array"
          ? ["minItems", "maxItems"]
          : kind === "number"
            ? ["minimum", "maximum"]
            : [];
    for (const key of bounds)
      if (
        value[key] !== undefined &&
        (typeof value[key] !== "number" ||
          !Number.isFinite(value[key]) ||
          (kind !== "number" &&
            (!Number.isInteger(value[key]) ||
              (value[key] as number) < 0 ||
              (value[key] as number) > GRAPH_ARTIFACT_BYTES)))
      )
        throw new Error("Invalid schema bound.");
    if (
      bounds.length &&
      value[bounds[0]!] !== undefined &&
      value[bounds[1]!] !== undefined &&
      (value[bounds[0]!] as number) > (value[bounds[1]!] as number)
    )
      throw new Error("Invalid schema bound order.");
    if (
      value.enum !== undefined &&
      (!Array.isArray(value.enum) ||
        !value.enum.length ||
        value.enum.length > 64 ||
        value.enum.some(
          (entry) => typeof entry !== kind || (kind === "number" && !Number.isFinite(entry)),
        ))
    )
      throw new Error("Invalid schema enum.");
  };
  check(input, 0);
  return structuredClone(input) as GraphJsonSchema;
}

function validateValue(value: GraphJsonValue, schema: GraphJsonSchema, path: string): void {
  const fail = () => {
    throw new Error(`Structured output does not match schema at ${path || "/"}.`);
  };
  if (schema.type === "null") {
    if (value !== null) fail();
    return;
  }
  if (schema.type === "object") {
    if (!record(value)) return fail();
    if (
      schema.required.some((key) => !own(value, key)) ||
      Object.keys(value).some((key) => !own(schema.properties, key))
    )
      fail();
    for (const [key, child] of Object.entries(value))
      validateValue(child as GraphJsonValue, schema.properties[key]!, `${path}/${key}`);
    return;
  }
  if (schema.type === "array") {
    if (!Array.isArray(value)) return fail();
    if (value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? MAX_MEMBERS))
      fail();
    value.forEach((child, index) => validateValue(child, schema.items, `${path}/${index}`));
    return;
  }
  if (typeof value !== schema.type) fail();
  if (schema.enum && !schema.enum.some((entry) => entry === value)) fail();
  if (
    schema.type === "string" &&
    ((value as string).length < (schema.minLength ?? 0) ||
      (value as string).length > (schema.maxLength ?? GRAPH_ARTIFACT_BYTES))
  )
    fail();
  if (
    schema.type === "number" &&
    ((value as number) < (schema.minimum ?? -Infinity) ||
      (value as number) > (schema.maximum ?? Infinity))
  )
    fail();
}

export function parseGraphJson(
  text: string,
  schema: GraphJsonSchema,
): Record<string, GraphJsonValue> {
  const checked = validateGraphJsonSchema(schema),
    value = parseBoundedGraphJson(text);
  if (checked.type !== "object" || !record(value))
    throw new Error("Structured output requires a declared JSON object root.");
  validateValue(value, checked, "");
  return value as Record<string, GraphJsonValue>;
}

export function selectGraphJsonPath(value: GraphJsonValue, pointer: string): GraphJsonValue {
  if (
    typeof pointer !== "string" ||
    pointer.length > 1024 ||
    (pointer !== "" && !pointer.startsWith("/"))
  )
    throw new Error("Invalid bounded JSON pointer.");
  if (!pointer) return value;
  const segments = pointer.slice(1).split("/");
  if (segments.length > MAX_DEPTH) throw new Error("JSON pointer exceeds depth limit.");
  let selected = value;
  for (const raw of segments) {
    if (/~(?:[^01]|$)/.test(raw)) throw new Error("Invalid JSON pointer escape.");
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    assertKey(key);
    if (
      typeof selected !== "object" ||
      selected === null ||
      !own(selected, key) ||
      (Array.isArray(selected) && !/^(?:0|[1-9]\d*)$/.test(key))
    )
      throw new Error("JSON pointer does not select an own value.");
    selected = (selected as Record<string, GraphJsonValue>)[key]!;
  }
  return selected;
}
