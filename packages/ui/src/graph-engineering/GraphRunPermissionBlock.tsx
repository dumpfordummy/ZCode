import { Shield } from "lucide-react";
import type { GraphPermissionInfo } from "./graphPermissionInfo.js";
import { useGraphRunText } from "./GraphRunText.js";

/**
 * Read-only. Graph cannot allow or deny anything: the permission is answered in the step's own
 * native conversation. The command shown is Graph's configuration for the step, labelled as such,
 * never presented as the exact pending permission request.
 */
export function GraphRunPermissionBlock({ items }: { items: GraphPermissionInfo[] }) {
  const u = useGraphRunText();
  if (!items.length) return null;
  return (
    <div
      className="space-y-2 rounded-lg border border-warning/50 bg-warning/10 p-3 text-ui-sm"
      data-testid="graph-run-permission"
    >
      {items.map((item) => (
        <div key={item.attemptId} className="space-y-1" data-attempt-id={item.attemptId}>
          <p className="flex gap-2 font-medium">
            <Shield className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            <span>{u("permissionWaiting", { step: item.name })}</span>
          </p>
          <p className="text-foreground-subtle">{u("permissionHelp")}</p>
          {item.configuredCommand ? (
            <div data-testid="graph-run-permission-command">
              <p className="text-ui-xs text-foreground-subtle">{u("configuredCommand")}</p>
              <code className="block break-all rounded-md bg-surface px-2 py-1 font-mono text-ui-xs">
                {item.configuredCommand}
              </code>
            </div>
          ) : (
            <p className="text-ui-xs text-foreground-subtle">
              {u("permissionDetailsInConversation")}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
