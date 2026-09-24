/** Bind a stale-sensitive operation to an existing process without any spawn path. */
export async function expectedRuntimeClient<T extends { readonly isDisposed: boolean }>(
  expectedIdentity: string,
  existing: () => T | undefined,
  identity: () => Promise<string>,
): Promise<T> {
  const client = existing();
  if (!client || client.isDisposed) throw new Error("The original native runtime is unavailable.");
  const currentIdentity = await identity();
  // identity 的异步读取可能与进程重启交错；保留原 client 引用，绝不转发到替代进程。
  if (currentIdentity !== expectedIdentity || existing() !== client || client.isDisposed) {
    throw new Error("The original native runtime changed; the operation was not resubmitted.");
  }
  return client;
}
