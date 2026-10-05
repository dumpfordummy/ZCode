import type { GraphRun } from "@zcode/services";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { useGraphEngineering } from "@/hooks/useGraphEngineering.js";
import type { GraphPanelProps } from "./graphEngineeringView.js";
import { GraphRunInspector } from "./GraphRunInspector.js";
import { GraphRunDetails } from "./GraphRunDetails.js";
import { GraphRoutingInspector } from "./GraphRoutingInspector.js";
import { GraphRecovery } from "./GraphRecovery.js";
import { GraphWorkflowProvenance } from "./GraphWorkflowProvenance.js";
import { GraphDisclosure, GraphDisclosureStack } from "./GraphDisclosure.js";
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
  return (
    <>
      {selectedRun.version !== undefined &&
      selectedRun.message &&
      selectedRun.status !== "Completed" ? (
        <p className="break-words text-ui-sm text-foreground-subtle">{selectedRun.message}</p>
      ) : null}
      {selectedRun.version === 5 ? (
        <GraphRoutingInspector
          run={selectedRun}
          diagnostics={regionSelected}
          disabled={disabled}
          onContinue={(runId, checkpointId, digest) =>
            void graph.continueRouting(runId, checkpointId, digest)
          }
        />
      ) : null}
      {selectedRun.version !== undefined && selectedRun.provenance ? (
        <GraphDisclosureStack>
          <GraphDisclosure
            testId="graph-frozen-provenance"
            title={intl.formatMessage({ id: "graph.z6.provenance" })}
          >
            <GraphWorkflowProvenance provenance={selectedRun.provenance} embedded />
          </GraphDisclosure>
        </GraphDisclosureStack>
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
        <GraphRunDetails run={selectedRun} onOpenConversation={onOpenConversation} />
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
