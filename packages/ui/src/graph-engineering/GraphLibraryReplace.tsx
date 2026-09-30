import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

/** The explicit choice before an unsaved design is replaced by a workflow instance. Unchanged by UX-M3. */
export function GraphLibraryReplace({
  open,
  error,
  actionsLocked,
  operationPending,
  onSave,
  onDiscard,
  onCancel,
}: {
  open: boolean;
  error?: string | null;
  actionsLocked: boolean;
  operationPending: boolean;
  onSave(): void;
  onDiscard(): void;
  onCancel(): void;
}) {
  const { intl } = useZCodeIntl();
  const u = (key: string) => intl.formatMessage({ id: `graph.preZ8.${key}` });
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value && !operationPending) onCancel();
      }}
    >
      <DialogContent data-testid="graph-replace-dialog" showCloseButton={!operationPending}>
        <DialogHeader>
          <DialogTitle>{u("replaceTitle")}</DialogTitle>
          <DialogDescription>{u("replaceHelp")}</DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-ui-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button disabled={actionsLocked} data-testid="graph-replace-save" onClick={onSave}>
            {u("saveReplace")}
          </Button>
          <Button
            variant="outline"
            disabled={actionsLocked}
            data-testid="graph-replace-discard"
            onClick={onDiscard}
          >
            {u("discardReplace")}
          </Button>
          <Button
            variant="ghost"
            disabled={operationPending}
            data-testid="graph-replace-cancel"
            onClick={onCancel}
          >
            {u("cancel")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
