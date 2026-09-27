import type { GraphTrxParseInput } from "../dotnet-types.js";
import { trxFail } from "./trx-shape.js";

const hasControl = (value: string) =>
  Array.from(value).some(
    (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
  );

export function trxGuid(value: string): string {
  if (
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value) ||
    /^0{8}(?:-0{4}){3}-0{12}$/.test(value)
  )
    return trxFail("invalid report/test/execution identity.");
  return value.toLowerCase();
}
export function trxTime(value: string): number {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,7}))?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!match) return trxFail("invalid timestamp format.");
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const calendar = new Date(0);
  calendar.setUTCFullYear(year!, month! - 1, day!);
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month! - 1 ||
    calendar.getUTCDate() !== day ||
    hour! > 23 ||
    minute! > 59 ||
    second! > 59
  )
    trxFail("invalid calendar timestamp.");
  const zone = match[8]!;
  if (
    zone !== "Z" &&
    (Number(zone.slice(1, 3)) > 14 ||
      Number(zone.slice(4)) > 59 ||
      (Number(zone.slice(1, 3)) === 14 && Number(zone.slice(4)) !== 0))
  )
    trxFail("invalid timestamp offset.");
  const result = Date.parse(value);
  if (!Number.isFinite(result)) return trxFail("invalid timestamp.");
  return result;
}
export function trxWindow(value: number, start: number, finish: number): void {
  if (value < start || value > finish) trxFail("timestamp is outside the native/report window.");
}
export function trxDuration(value: string): number {
  const match = /^(?:(\d{1,4})\.)?(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,7}))?$/.exec(value);
  if (!match || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59)
    return trxFail("invalid test duration.");
  return (
    ((Number(match[1] ?? 0) * 24 + Number(match[2])) * 3600 +
      Number(match[3]) * 60 +
      Number(match[4])) *
      1000 +
    Number(`0.${match[5] ?? "0"}`) * 1000
  );
}
function relative(value: string): string {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 1024 ||
    /[\\:]/.test(value) ||
    hasControl(value) ||
    value.split("/").some((part) => !part || part === "." || part === ".." || /[. ]$/.test(part))
  )
    return trxFail("scope requires safe relative project/assembly paths.");
  return value;
}
function absolute(value: string, windows: boolean): string {
  if (typeof value !== "string" || value.length > 8192 || hasControl(value))
    return trxFail("invalid expected/report assembly path.");
  const normalized = windows ? value.replaceAll("\\", "/") : value;
  const prefix = windows
    ? /^(?:[A-Za-z]:\/|\/\/[^/:]+\/[^/:]+\/)/.exec(normalized)?.[0]
    : normalized.startsWith("/")
      ? "/"
      : undefined;
  if (
    !prefix ||
    normalized.slice(prefix.length).includes(":") ||
    (!windows && normalized.includes("\\")) ||
    normalized
      .slice(prefix.length)
      .split("/")
      .some((part) => !part || part === "." || part === ".." || /[. ]$/.test(part))
  )
    return trxFail("unsafe or non-absolute assembly identity.");
  return normalized;
}
export function trxAssemblyComparator(input: GraphTrxParseInput): (value: string) => void {
  if (!["sensitive", "insensitive"].includes(input.pathCase))
    trxFail("invalid assembly case policy.");
  relative(input.target.project);
  relative(input.target.assembly);
  for (const value of [
    input.target.configuration,
    input.target.framework,
    input.target.runtime ?? "default",
  ])
    if (typeof value !== "string" || !value.trim() || value.length > 128 || hasControl(value))
      trxFail("invalid declared test scope.");
  const windows = /^(?:[A-Za-z]:[\\/]|[\\/]{2})/.test(input.expectedAssemblyPath);
  // 只折叠 ASCII 路径大小写；不把不同 Unicode 路径或规范化形式误当同一个程序集。
  const fold = (value: string) =>
    input.pathCase === "insensitive"
      ? value.replace(/[A-Z]/g, (char) => char.toLowerCase())
      : value;
  const expected = fold(absolute(input.expectedAssemblyPath, windows));
  if (!expected.endsWith("/" + fold(input.target.assembly)))
    trxFail("declared assembly scope mismatch.");
  return (value) => {
    if (fold(absolute(value, windows)) !== expected) trxFail("report assembly identity mismatch.");
  };
}
