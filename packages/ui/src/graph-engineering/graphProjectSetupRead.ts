export interface GraphProjectSetupReadScope {
  sequences: Record<string, number>;
}
export function invalidateGraphProjectSetupReads(scope: GraphProjectSetupReadScope): void {
  for (const lane of Object.keys(scope.sequences))
    scope.sequences[lane] = (scope.sequences[lane] ?? 0) + 1;
}
export type GraphProjectSetupReadState<T> =
  | { status: "idle" }
  | { status: "loading"; key: string }
  | { status: "ready"; key: string; result: T }
  | { status: "error"; key: string; error: string };

/** 每条只读通道独立排序；工作区或输入变化后的回执既不发布，也不返回给草稿。 */
export async function readGraphProjectSetup<T>({
  scope,
  lane,
  key,
  isCurrent,
  read,
  publish,
}: {
  scope: GraphProjectSetupReadScope;
  lane: string;
  key: string;
  isCurrent(): boolean;
  read(): Promise<T>;
  publish(state: GraphProjectSetupReadState<T>): void;
}): Promise<T | undefined> {
  const sequence = (scope.sequences[lane] ?? 0) + 1;
  scope.sequences[lane] = sequence;
  const current = () => isCurrent() && scope.sequences[lane] === sequence;
  if (!current()) return;
  publish({ status: "loading", key });
  try {
    const result = await read();
    if (!current()) return;
    publish({ status: "ready", key, result });
    return result;
  } catch (cause) {
    if (current())
      publish({
        status: "error",
        key,
        error: cause instanceof Error ? cause.message : String(cause),
      });
  }
}
