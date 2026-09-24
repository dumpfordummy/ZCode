import { ASK_USER_QUESTION_E2E_CLOCK_SCALE_ENV } from "@zcode/shared";

export const ASK_USER_QUESTION_HIDDEN_GRACE_MS = 60_000;
export const ASK_USER_QUESTION_AUTO_RESOLUTION_MS = 300_000;
export interface V4InteractionRegistryOptions {
  hiddenGraceMs?: number;
  autoResolutionMs?: number;
  now?: () => number;
}

export function resolveV4InteractionRegistryOptionsFromEnv(
  env: NodeJS.ProcessEnv,
): V4InteractionRegistryOptions | undefined {
  if (env.ZCODE_ENV !== "test") return undefined;
  const rawScale = env[ASK_USER_QUESTION_E2E_CLOCK_SCALE_ENV]?.trim();
  if (!rawScale) return undefined;
  const scale = Number(rawScale);
  if (!Number.isFinite(scale) || scale < 1 || scale > 1_000) {
    throw new Error(`${ASK_USER_QUESTION_E2E_CLOCK_SCALE_ENV} must be between 1 and 1000`);
  }
  return {
    hiddenGraceMs: Math.max(1, Math.round(ASK_USER_QUESTION_HIDDEN_GRACE_MS / scale)),
    autoResolutionMs: Math.max(1, Math.round(ASK_USER_QUESTION_AUTO_RESOLUTION_MS / scale)),
  };
}

export function collectInteractionAncestors(
  sessionId: string,
  parentOf: (id: string) => string | undefined,
): string[] {
  const ancestors = new Set<string>();
  let parent = parentOf(sessionId);
  while (parent && parent !== sessionId && !ancestors.has(parent)) {
    ancestors.add(parent);
    parent = parentOf(parent);
  }
  return [...ancestors];
}

export function interactionSessionIsProtected(
  options: { sessionId: string; ancestorSessionIds?: readonly string[] } | undefined,
  protectedSessionIds: ReadonlySet<string>,
): boolean {
  return Boolean(
    options &&
    (protectedSessionIds.has(options.sessionId) ||
      options.ancestorSessionIds?.some((id) => protectedSessionIds.has(id))),
  );
}
