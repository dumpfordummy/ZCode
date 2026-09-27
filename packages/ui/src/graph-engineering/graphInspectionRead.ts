export type GraphInspectionState<T> =
  | { status: "idle" }
  | { status: "loading"; key: string }
  | { status: "ready"; key: string; value: T }
  | { status: "error"; key: string; error: string };

/** 每次读取先清除旧展示；旧请求的完成或失败不能覆盖当前运行/证据选择。 */
export async function readGraphInspection<T>({
  scope,
  key,
  isCurrent,
  read,
  publish,
  missingMessage,
}: {
  scope: { sequence: number };
  key: string;
  isCurrent(): boolean;
  read(): Promise<T | undefined>;
  publish(state: GraphInspectionState<T>): void;
  missingMessage: string;
}): Promise<void> {
  const sequence = ++scope.sequence,
    owns = () => isCurrent() && scope.sequence === sequence;
  if (!owns()) return;
  publish({ status: "loading", key });
  try {
    const value = await read();
    if (!owns()) return;
    publish(
      value === undefined
        ? { status: "error", key, error: missingMessage }
        : { status: "ready", key, value },
    );
  } catch (cause) {
    if (owns())
      publish({
        status: "error",
        key,
        error: cause instanceof Error ? cause.message : String(cause),
      });
  }
}
