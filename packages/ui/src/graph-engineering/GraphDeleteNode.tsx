import { useState } from "react";
import type { GraphNode, GraphSequentialDefinition } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { graphDeleteImpact } from "./graphEditorGuidance.js";
import { removeGraphTask } from "./graphEditing.js";
import { useGraphEditorText } from "./GraphEditorMode.js";

export function GraphDeleteNode({
  definition,
  node,
  disabled,
  onChange,
}: {
  definition: GraphSequentialDefinition;
  node: GraphNode;
  disabled: boolean;
  onChange(value: GraphSequentialDefinition): void;
}) {
  const [reviewed, setReviewed] = useState<GraphSequentialDefinition | null>(null),
    t = useGraphEditorText();
  const impact = graphDeleteImpact(reviewed ?? definition, node.id);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        data-testid="graph-delete-node"
        onClick={() => setReviewed(definition)}
      >
        {t("delete")}
      </Button>
      <Dialog
        open={reviewed !== null}
        onOpenChange={(open) => {
          if (!open) setReviewed(null);
        }}
      >
        <DialogContent className="graph-ui max-h-[85vh] overflow-auto" data-testid="graph-delete-impact">
          <DialogHeader>
            <DialogTitle>
              {t("deleteTitle")}: {"name" in node ? node.name : node.id}
            </DialogTitle>
            <DialogDescription>{t("deleteHelp")}</DialogDescription>
          </DialogHeader>
          {impact.length ? (
            <ul className="space-y-2 text-ui-sm">
              {impact.map((item, index) => (
                <li key={index} data-kind={item.kind}>
                  <span className="font-medium">{t(`impact.${item.kind}`)}</span>: {item.owner} ·{" "}
                  {item.detail}
                </li>
              ))}
            </ul>
          ) : (
            <p>{t("noDependencies")}</p>
          )}
          {reviewed && reviewed !== definition ? <p role="alert">{t("bufferConflict")}</p> : null}
          <DialogFooter>
            <Button
              variant="outline"
              data-testid="graph-delete-cancel"
              onClick={() => setReviewed(null)}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              data-testid="graph-delete-confirm"
              disabled={disabled || reviewed !== definition}
              onClick={() => {
                if (reviewed === definition) {
                  onChange(removeGraphTask(definition, node.id));
                  setReviewed(null);
                }
              }}
            >
              {t("confirmDelete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
