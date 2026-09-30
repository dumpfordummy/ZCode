import { useGraphM2Text } from "./GraphM2Text.js";

/** The file name of a path the native chooser returned (Windows or POSIX separators). Display only. */
export function graphFileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

/**
 * UX-M2.3: a failed Context selection. The UI-owned sentence names the attempted file and says whether
 * a previous selection was kept (only when there was one); the Host or platform message follows
 * verbatim. A cancelled chooser never reaches here.
 */
export function GraphContextFailure({
  attempt,
  diagnostic,
  chooserFailure,
  previous,
}: {
  /** The attempt whose Host check failed; `value` is never empty, `path` is the chooser's full path. */
  attempt: { value: string; path?: string } | null;
  diagnostic?: string;
  chooserFailure?: string;
  /** The slot's current value, unchanged by the failure; empty when the slot holds nothing. */
  previous: string;
}) {
  const m2 = useGraphM2Text();
  return (
    <>
      {attempt && diagnostic !== undefined ? (
        <div
          role="alert"
          className="space-y-0.5 rounded-md bg-destructive/10 px-2 py-1"
          data-testid="graph-context-validation-error"
        >
          <p
            className="break-all font-medium"
            title={attempt.path}
            data-testid="graph-context-attempt"
          >
            {m2(previous ? "couldNotUseKept" : "couldNotUseNothing", {
              file: attempt.value,
              previous,
            })}
          </p>
          <p className="break-all text-destructive">{diagnostic}</p>
        </div>
      ) : null}
      {chooserFailure ? (
        <div
          role="alert"
          className="space-y-0.5 rounded-md bg-destructive/10 px-2 py-1"
          data-testid="graph-context-chooser-error"
        >
          <p className="break-all font-medium">
            {m2(previous ? "chooserFailedKept" : "chooserFailedNothing", { previous })}
          </p>
          <p className="break-all text-destructive">{chooserFailure}</p>
        </div>
      ) : null}
    </>
  );
}
