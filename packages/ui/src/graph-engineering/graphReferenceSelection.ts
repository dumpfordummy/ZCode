/** 原生选择器不能取消已返回的 Promise；在选择和验证两端检查同一所有者，禁止迟到结果覆盖新工作区。 */
export async function selectGraphReference<T>({
  pick,
  validate,
  isCurrent,
}: {
  pick(): Promise<string | null>;
  validate(path: string): Promise<T | undefined>;
  isCurrent(): boolean;
}): Promise<T | undefined> {
  try {
    const path = await pick();
    if (!path || !isCurrent()) return;
    const result = await validate(path);
    return isCurrent() ? result : undefined;
  } catch (cause) {
    if (isCurrent()) throw cause;
  }
}
export function beginGraphReferenceIntent(scope: { generation: number }): () => boolean {
  const generation = ++scope.generation;
  return () => scope.generation === generation;
}

export function beginGraphReferenceSearch(scope: { searchSequence: number }): () => boolean {
  const sequence = ++scope.searchSequence;
  return () => scope.searchSequence === sequence;
}

export function invalidateGraphReferenceReads(scope: {
  generation: number;
  searchSequence: number;
}): void {
  scope.generation++;
  scope.searchSequence++;
}
