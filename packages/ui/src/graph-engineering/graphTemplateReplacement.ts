/** Replacement changes only after the existing save/instantiate owners acknowledge success. */
export async function replaceGraphFromTemplate<T>({
  decision,
  expectedRevision,
  stillCurrent,
  save,
  instantiate,
}: {
  decision: "save" | "discard" | "cancel";
  expectedRevision: number;
  stillCurrent(): boolean;
  save(): Promise<{ revision: number } | undefined>;
  instantiate(revision: number): Promise<T | undefined>;
}): Promise<T | undefined> {
  if (decision === "cancel" || !stillCurrent()) return;
  let revision = expectedRevision;
  if (decision === "save") {
    const saved = await save();
    if (!saved || !stillCurrent()) return;
    revision = saved.revision;
  }
  return stillCurrent() ? instantiate(revision) : undefined;
}
