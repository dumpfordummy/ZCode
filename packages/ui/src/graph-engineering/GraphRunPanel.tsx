import type { GraphRun } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { useGraphEngineering } from "@/hooks/useGraphEngineering.js";
import type { GraphPanelProps } from "./graphEngineeringView.js";
import { GraphRunInspector } from "./GraphRunInspector.js";
import { GraphRunDetails } from "./GraphRunDetails.js";
import { GraphRoutingInspector } from "./GraphRoutingInspector.js";
import { GraphRecovery } from "./GraphRecovery.js";
import { graphRunIsUnresolved } from "./graphEditing.js";
import { GraphWorkflowProvenance } from "./GraphWorkflowProvenance.js";
export function GraphRunPanel({
  selectedRun,
  nodeId,
  selectedAttemptId,
  regionSelected,
  onSelectAttempt,
  onOpenConversation,
  graph,
  disabled,
}: {
  selectedRun: GraphRun;
  nodeId?: string;
  selectedAttemptId?: string;
  regionSelected: boolean;
  onSelectAttempt: (id: string) => void;
  onOpenConversation: GraphPanelProps["onOpenConversation"];
  graph: ReturnType<typeof useGraphEngineering>;
  disabled: boolean;
}) {
  const { intl } = useZCodeIntl();
  const t = (id: string) => intl.formatMessage({ id: `graph.${id}` });
  return (
    <>
      <p className="break-all font-mono text-ui-xs text-foreground-subtlest">{selectedRun.id}</p>
      <p role="status" className="text-ui-sm">
        {t(
          selectedRun.version !== undefined &&
            selectedRun.version >= 3 &&
            selectedRun.status === "Completed"
            ? "approval.runCompleted"
            : `status.${selectedRun.status}`,
        )}
      </p>
      {selectedRun.version !== undefined &&
      selectedRun.message &&
      selectedRun.status !== "Completed" ? (
        <p className="break-words text-ui-sm text-foreground-subtle">{selectedRun.message}</p>
      ) : null}
      {selectedRun.version !== undefined && selectedRun.status === "Completed" ? (
        <p className="text-ui-sm text-foreground-subtle">
          {t(selectedRun.version >= 3 ? "approval.completionMeaning" : "completionMeaning")}
        </p>
      ) : null}
      {graphRunIsUnresolved(selectedRun) &&
      ([
        "Starting",
        "Running",
        "WaitingForPermission",
        "WaitingForUser",
        "WaitingForApproval",
        "AwaitingContinuation",
        "StaleEvidence",
      ].includes(selectedRun.status) ||
        selectedRun.recovery?.state === "active") ? (
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          data-testid="graph-cancel"
          onClick={() => void graph.cancel(selectedRun.id)}
        >
          {t("cancel")}
        </Button>
      ) : null}
      {selectedRun.version === 5 ? (
        <GraphRoutingInspector
          run={selectedRun}
          disabled={disabled}
          onContinue={(runId, checkpointId, digest) =>
            void graph.continueRouting(runId, checkpointId, digest)
          }
        />
      ) : null}
      {selectedRun.version !== undefined && selectedRun.provenance ? (
        <details className="text-ui-sm" data-testid="graph-frozen-provenance">
          <summary>{intl.formatMessage({ id: "graph.z6.provenance" })}</summary>
          <GraphWorkflowProvenance provenance={selectedRun.provenance} />
        </details>
      ) : null}
      {selectedRun.version !== undefined && !regionSelected ? (
        <GraphRunInspector
          run={selectedRun}
          nodeId={nodeId}
          selectedAttemptId={selectedAttemptId}
          onSelectAttempt={onSelectAttempt}
          approvalActions={{ ...graph, disabled }}
          evidenceActions={graph}
          onOpenConversation={onOpenConversation}
        />
      ) : selectedRun.version === undefined ? (
        <GraphRunDetails
          run={selectedRun}
          disabled={disabled}
          onCancel={(id) => void graph.cancel(id)}
          onOpenConversation={onOpenConversation}
        />
      ) : null}
      <GraphRecovery
        key={selectedRun.id}
        run={selectedRun}
        disabled={disabled}
        onInspect={(id) => void graph.inspectRecovery(id)}
        onRelease={(id, reason) => void graph.releaseInterrupted(id, reason)}
      />
    </>
  );
}
