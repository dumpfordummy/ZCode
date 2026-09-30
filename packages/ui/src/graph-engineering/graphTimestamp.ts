/**
 * UX-M2.1：Graph 自有时间戳的显示文本。
 * 修复原因：原先直接 `new Date(value).toLocaleString()`，跟随操作系统/浏览器语言而不是应用语言，
 * 中文界面里可能出现英文日期（反之亦然）；无效值还会显示 "Invalid Date" 或 1970 年这类编造的日期。
 * 依据：应用语言由 IntlProvider 决定；存储值是毫秒时间戳，这里只格式化、不改写，时区仍为查看者本地时区。
 * 返回 undefined 表示没有可信的时间，调用方显示“未记录时间”，绝不编造日期。
 */
export function graphTimestamp(value: unknown, locale: string): string | undefined {
  const time = graphTimeValue(value);
  return time === undefined ? undefined : new Date(time).toLocaleString(locale);
}

/** Exact ISO-8601 UTC text for captured operational facts; undefined when the value is not a valid time. */
export function graphIsoTimestamp(value: unknown): string | undefined {
  const time = graphTimeValue(value);
  return time === undefined ? undefined : new Date(time).toISOString();
}

// 0 与负数不是 Graph 会记录的时间（毫秒纪元）；超出 Date 范围的值 toISOString 会抛错。
function graphTimeValue(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return Number.isNaN(new Date(value).getTime()) ? undefined : value;
}
