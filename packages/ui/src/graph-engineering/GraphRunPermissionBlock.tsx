import type { GraphPermissionInfo } from "./graphPermissionInfo.js";
import { useGraphRunText } from "./GraphRunText.js";

/**
 * Read-only. Graph cannot allow or deny anything: the permission is answered in the step's own
 * native conversation. The command shown is Graph's configuration for the step, labelled as such,
 * never presented as the exact pending permission request.
 * UX-M4: the content of the run banner (the banner supplies the icon and the surface); the
 * sentence is stated here once and not repeated beside the action.
 */
export function GraphRunPermissionBlock({ items }: { items: GraphPermissionInfo[] }) {
  const u = useGraphRunText();
  if (!items.length) return null;
  return (
    <div className="space-y-3" data-testid="graph-run-permission">
      {items.map((item) => (
        <div key={item.attemptId} className="space-y-1" data-attempt-id={item.attemptId}>
          <p className="text-ui-lg font-semibold">{u("permissionWaiting", { step: item.name })}</p>
          <p className="text-foreground-subtle">{u("permissionHelp")}</p>
          {item.configuredCommand ? (
            <div data-testid="graph-run-permission-command" className="pt-1">
              <p className="text-ui-sm text-foreground-subtle">{u("configuredCommand")}</p>
              <code className="mt-1 block break-all rounded-md bg-surface px-2 py-1 font-mono text-ui-sm">
                {item.configuredCommand}
              </code>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
