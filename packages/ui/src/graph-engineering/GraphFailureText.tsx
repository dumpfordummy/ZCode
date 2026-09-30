import { useGraphM2Text } from "./GraphM2Text.js";

/**
 * UX-M2.3: one failure on the journey. A UI-owned sentence says what did not happen and what is still
 * true; beneath it, the authoritative message (Host, validation or platform) is shown byte for byte,
 * never rewritten or translated.
 */
export function GraphFailureText({
  testId,
  framing,
  values,
  message,
  className = "basis-full",
}: {
  testId: string;
  /** A `graph.m2.*` key. */
  framing: string;
  values?: Record<string, string | number>;
  message?: string;
  className?: string;
}) {
  const m2 = useGraphM2Text();
  return (
    <div
      role="alert"
      className={`${className} space-y-0.5 break-words text-ui-sm`}
      data-testid={testId}
    >
      <p className="font-medium">{m2(framing, values)}</p>
      {message ? (
        <p className="text-destructive" data-testid={`${testId}-diagnostic`}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
