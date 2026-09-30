const sortKeys = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(sortKeys)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value as Record<string, unknown>)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([key, item]) => [key, sortKeys(item)]),
        )
      : value;

/** Canonical fingerprint of what the new-run form asked the workflow service to instantiate. */
export const graphInstantiationFingerprint = (input: unknown): string =>
  JSON.stringify(sortKeys(input));

const remembered = new Map<string, { fingerprint: string; content: string }>();

/**
 * "Review and run" must not create another definition when nothing changed since the last
 * instantiation: same form inputs, and the saved design still has the content that instantiation
 * produced. Renderer memory only; the Host stays the owner of the definition and its revision.
 */
export function rememberGraphInstantiation(
  workspaceKey: string,
  fingerprint: string,
  savedContent: string,
): void {
  remembered.set(workspaceKey, { fingerprint, content: savedContent });
}

export function isRememberedGraphInstantiation(
  workspaceKey: string,
  fingerprint: string,
  currentContent: string,
): boolean {
  const entry = remembered.get(workspaceKey);
  return entry?.fingerprint === fingerprint && entry.content === currentContent;
}

export function forgetGraphInstantiations(): void {
  remembered.clear();
}
