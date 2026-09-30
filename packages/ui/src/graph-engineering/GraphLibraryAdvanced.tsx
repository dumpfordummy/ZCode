import type { ReactNode } from "react";
import type { GraphLibraryEntry } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import type { useGraphWorkflow } from "@/hooks/useGraphWorkflow.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useGraphM3Text } from "./GraphM3Text.js";

/** The Advanced section: the technical identities the everyday sections no longer show. */
export function GraphLibraryAdvanced({
  workflow,
  digest,
  entry,
  children,
}: {
  workflow: ReturnType<typeof useGraphWorkflow>;
  digest?: string;
  entry?: GraphLibraryEntry;
  /** The manual JSON route (UX-M3.2). */
  children?: ReactNode;
}) {
  const { intl } = useZCodeIntl();
  const t = (key: string) => intl.formatMessage({ id: `graph.z6.${key}` });
  const m3 = useGraphM3Text();
  return (
    <details className="space-y-3 text-ui-sm" data-testid="graph-library-advanced">
      <summary className="cursor-pointer">{m3("sectionAdvanced")}</summary>
      <p className="text-foreground-subtle">{m3("advancedHelp")}</p>
      <dl className="space-y-1">
        <div>
          <dt className="text-foreground-subtle">{t("libraryRevision")}</dt>
          <dd className="font-mono text-ui-xs" data-testid="graph-library-revision">
            {workflow.view?.revision ?? "—"}
          </dd>
        </div>
        {entry && digest ? (
          <div>
            <dt className="text-foreground-subtle">{m3("versionDigest")}</dt>
            <dd className="break-all font-mono text-ui-xs" data-testid="graph-library-digest">
              {digest}
            </dd>
          </div>
        ) : null}
      </dl>
      <Button
        size="sm"
        variant="outline"
        disabled={workflow.pending}
        onClick={() => void workflow.read()}
        data-testid="graph-library-refresh"
      >
        {t("refresh")}
      </Button>
      {children}
    </details>
  );
}
