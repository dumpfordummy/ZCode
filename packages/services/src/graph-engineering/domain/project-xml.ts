import { PROJECT_INVENTORY_BUDGET } from "./project-budgets.js";

export interface ProjectXmlElement {
  name: string;
  attributes: Record<string, string>;
  children: ProjectXmlElement[];
  text: string;
}

const space = (value: string | undefined) => value !== undefined && /^[\t\n\r ]$/.test(value);
const fail = (message: string): never => {
  throw new Error(`Project XML: ${message}`);
};
function legalCharacter(code: number): boolean {
  return (
    (code === 9 ||
      code === 10 ||
      code === 13 ||
      (code >= 32 && code <= 0xd7ff) ||
      (code >= 0xe000 && code <= 0xfffd) ||
      (code >= 0x10000 && code <= 0x10ffff)) &&
    // 与既有文件证据的控制字符边界保持一致，不能用 XML 合法性绕过 DEL 检查。
    code !== 127 &&
    !(code >= 0xfdd0 && code <= 0xfdef) &&
    (code & 0xffff) < 0xfffe
  );
}
function decodeEntities(value: string): string {
  const parts: string[] = [];
  let offset = 0;
  for (;;) {
    const begin = value.indexOf("&", offset);
    if (begin < 0) return parts.join("") + value.slice(offset);
    parts.push(value.slice(offset, begin));
    const end = value.indexOf(";", begin + 1);
    if (end < 0 || end - begin > 16) fail("unterminated or oversized entity reference.");
    const name = value.slice(begin + 1, end);
    const predefined: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (Object.hasOwn(predefined, name)) parts.push(predefined[name]!);
    else {
      const hexadecimal = /^#x[0-9a-fA-F]{1,8}$/.test(name);
      if (!hexadecimal && !/^#[0-9]{1,10}$/.test(name)) fail("undeclared entity reference.");
      const code = Number.parseInt(name.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      if (!legalCharacter(code)) fail("invalid Unicode character reference.");
      parts.push(String.fromCodePoint(code));
    }
    offset = end + 1;
  }
}

/** Restricted UTF-8 XML only. No resolver, filesystem, network or entity expansion exists. */
export function parseProjectXml(bytes: Uint8Array): ProjectXmlElement {
  if (
    !(bytes instanceof Uint8Array) ||
    !bytes.byteLength ||
    bytes.byteLength > PROJECT_INVENTORY_BUDGET.fileBytes
  )
    fail("input must be original UTF-8 bytes within the 4 MiB limit.");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return fail("invalid UTF-8 input.");
  }
  for (const character of text)
    if (!legalCharacter(character.codePointAt(0)!)) fail("invalid Unicode character.");
  text = text.replace(/\r\n?/g, "\n");
  let offset = 0,
    elements = 0,
    attributes = 0;
  const stack: ProjectXmlElement[] = [];
  let root: ProjectXmlElement | undefined;
  const whitespace = () => {
    while (space(text[offset])) offset++;
  };
  const name = (): string => {
    const match = /^[A-Za-z_][A-Za-z0-9_.:-]*/.exec(text.slice(offset));
    if (!match || match[0].length > 128) return fail("invalid or oversized name.");
    offset += match[0].length;
    return match[0];
  };
  const readAttributes = (
    declaration = false,
  ): { values: Record<string, string>; closed: boolean } => {
    const values: Record<string, string> = Object.create(null);
    let count = 0;
    for (;;) {
      const spaced = space(text[offset]);
      whitespace();
      if (declaration && text.startsWith("?>", offset)) {
        offset += 2;
        return { values, closed: true };
      }
      if (!declaration && text.startsWith("/>", offset)) {
        offset += 2;
        return { values, closed: true };
      }
      if (!declaration && text[offset] === ">") {
        offset++;
        return { values, closed: false };
      }
      if (!spaced) fail("attributes require whitespace separators.");
      const key = name();
      if (Object.hasOwn(values, key)) fail("duplicate attribute.");
      if (++count > 32 || ++attributes > 65536) fail("attribute limit exceeded.");
      whitespace();
      if (text[offset++] !== "=") fail("attribute equality is missing.");
      whitespace();
      const quote = text[offset++];
      if (quote !== '"' && quote !== "'") return fail("attribute must be quoted.");
      const end = text.indexOf(quote, offset);
      if (end < 0 || end - offset > 8192) fail("unterminated or oversized attribute.");
      const raw = text.slice(offset, end);
      if (raw.includes("<") || (declaration && raw.includes("&")))
        fail("invalid attribute content.");
      values[key] = decodeEntities(raw.replace(/[\t\n\r]/g, " "));
      offset = end + 1;
    }
  };
  if (text.startsWith("<?xml") && space(text[5])) {
    offset = 5;
    const { values } = readAttributes(true);
    const keys = Object.keys(values);
    if (
      keys[0] !== "version" ||
      values.version !== "1.0" ||
      (values.encoding !== undefined && values.encoding.toLowerCase() !== "utf-8") ||
      (values.standalone !== undefined && !["yes", "no"].includes(values.standalone)) ||
      keys.some((key) => !["version", "encoding", "standalone"].includes(key)) ||
      (keys.includes("encoding") && keys.indexOf("encoding") !== 1)
    )
      fail("unsupported XML declaration.");
  }
  const appendText = (content: string) => {
    const parent = stack.at(-1);
    if (parent) parent.text += content;
    else if (/[^\t\n\r ]/.test(content)) fail("text outside the single root.");
  };
  while (offset < text.length) {
    if (text[offset] !== "<") {
      let end = text.indexOf("<", offset);
      if (end < 0) end = text.length;
      const raw = text.slice(offset, end);
      if (raw.includes("]]>")) fail("CDATA terminator outside CDATA.");
      // XML 文档根节点外仅允许字面空白；先解码会把非法 &#32; 错当合法 prolog/epilog。
      if (!stack.length && /[^\t\n\r ]/.test(raw)) fail("non-whitespace outside the single root.");
      appendText(decodeEntities(raw));
      offset = end;
      continue;
    }
    if (text.startsWith("<!--", offset)) {
      const end = text.indexOf("-->", offset + 4);
      if (end < 0) fail("unterminated comment.");
      const body = text.slice(offset + 4, end);
      if (body.includes("--") || body.endsWith("-")) fail("invalid comment.");
      offset = end + 3;
      continue;
    }
    if (text.startsWith("<![CDATA[", offset)) {
      if (!stack.length) fail("CDATA outside root.");
      const end = text.indexOf("]]>", offset + 9);
      if (end < 0) fail("unterminated CDATA.");
      appendText(text.slice(offset + 9, end));
      offset = end + 3;
      continue;
    }
    if (text.startsWith("<!", offset) || text.startsWith("<?", offset))
      fail("DTD, entity declarations and processing instructions are unsupported.");
    if (text.startsWith("</", offset)) {
      offset += 2;
      const closing = name();
      whitespace();
      if (text[offset++] !== ">" || stack.pop()?.name !== closing) fail("mismatched closing tag.");
      continue;
    }
    offset++;
    const tag = name();
    if (++elements > 32768 || stack.length >= 16) fail("element or 16-level depth limit exceeded.");
    const { values, closed } = readAttributes();
    const element: ProjectXmlElement = { name: tag, attributes: values, children: [], text: "" };
    const parent = stack.at(-1);
    if (parent) parent.children.push(element);
    else {
      if (root) fail("multiple root elements.");
      root = element;
    }
    if (!closed) stack.push(element);
  }
  if (!root || stack.length) return fail("missing root or partial document.");
  return root;
}
