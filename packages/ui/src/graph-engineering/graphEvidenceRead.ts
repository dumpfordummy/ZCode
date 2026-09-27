/** 证据读取错误必须交给当前检查器显示；旧工作区的成功或失败均不能回填新视图。 */
export async function readGraphEvidence<T>({
  read,
  isCurrent,
}: {
  read(): Promise<T>;
  isCurrent(): boolean;
}): Promise<T | undefined> {
  if (!isCurrent()) return;
  try {
    const result = await read();
    return isCurrent() ? result : undefined;
  } catch (cause) {
    if (isCurrent()) throw cause;
  }
}
