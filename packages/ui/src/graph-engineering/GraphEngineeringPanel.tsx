import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useGraphEngineering } from "@/hooks/useGraphEngineering.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { GraphEditor } from "./GraphEditor.js";
import type { GraphPanelProps } from "./graphEngineeringView.js";

export default function GraphEngineeringPanel(props: GraphPanelProps) {
  const graph = useGraphEngineering(props);
  const { intl } = useZCodeIntl();
  const t = (id: string) => intl.formatMessage({ id: `graph.${id}` });
  return (
    <main
      className="flex h-full min-h-0 flex-col bg-background text-foreground"
      data-testid="graph-engineering-panel"
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-border p-3 [app-region:no-drag]">
        <Button variant="ghost" size="sm" onClick={props.onBack}>
          <ArrowLeft className="size-4" />
          {t("backToChat")}
        </Button>
        <h2 className="text-ui-base font-medium">{t("title")}</h2>
        <p
          className="min-w-0 flex-1 break-all font-mono text-ui-sm text-foreground-subtle"
          data-testid="graph-workspace"
        >
          {props.workspacePath}
        </p>
      </header>
      {!graph.local ? (
        <p className="p-4 text-ui-base" role="status">
          {t("localOnly")}
        </p>
      ) : !graph.supported ? (
        <p className="p-4 text-ui-base" role="status">
          {t("unavailableHost")}
        </p>
      ) : graph.loading ? (
        <p className="p-4 text-ui-base" role="status">
          {t("loading")}
        </p>
      ) : graph.view ? (
        <GraphEditor
          key={props.workspaceIdentity?.trim() || props.workspacePath}
          {...props}
          graph={graph}
          view={graph.view}
        />
      ) : (
        <div className="space-y-3 p-4">
          <p role="alert" className="text-ui-base text-destructive">
            {graph.error}
          </p>
          <Button variant="outline" onClick={() => void graph.reload()}>
            {t("refresh")}
          </Button>
        </div>
      )}
    </main>
  );
}
