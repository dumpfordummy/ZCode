import type { ReactNode } from "react";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog.js";
import { GraphTab, GraphTabList, GraphTabPanel, GraphTabs } from "./GraphTabs.js";
import { useGraphM3Text } from "./GraphM3Text.js";

/**
 * UX-M4: the library dialog as master-detail. The workflow list on the leading side; on the
 * trailing side the selected workflow, a notice area directly above its tabs (a failure and its
 * recovery sit beside the operations that can cause them), single-level tabs Versions / Use /
 * Share / Advanced, and a fixed footer with the two ways forward. Panels stay mounted (hidden when
 * inactive) so a half-written name, an unsaved reviewed preview or a chosen file survive a tab
 * change exactly as they survived scrolling in the old single page.
 */
export function GraphLibraryDialogBody({
  title,
  help,
  workspacePath,
  list,
  detail,
  notices,
  panels,
  footer,
}: {
  title: string;
  help: string;
  workspacePath: string;
  list: ReactNode;
  /** Name, kind and description of the selected workflow. */
  detail: ReactNode;
  /** Blocked reason, failure (with refresh) and the latest success, ordered by precedence. */
  notices: ReactNode;
  panels: { versions: ReactNode; use: ReactNode; share: ReactNode; advanced: ReactNode };
  footer: ReactNode;
}) {
  const m3 = useGraphM3Text();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <DialogHeader className="shrink-0 border-b border-border px-6 pb-3 pr-14 pt-5">
        <DialogTitle className="text-ui-lg font-semibold">{title}</DialogTitle>
        <DialogDescription className="text-ui-base text-foreground-subtle">
          {help}
        </DialogDescription>
        <p
          className="break-all font-mono text-ui-sm text-foreground-subtle"
          data-testid="graph-library-workspace"
        >
          {workspacePath}
        </p>
      </DialogHeader>
      <div className="grid min-h-0 flex-1 md:grid-cols-[15rem_minmax(0,1fr)]">
        <div className="min-h-0 overflow-auto border-b border-border bg-header p-3 md:border-b-0 md:border-r">
          {list}
        </div>
        <GraphTabs defaultValue="versions" className="flex min-h-0 min-w-0 flex-col">
          <div className="shrink-0 space-y-3 px-6 pt-4">
            {detail}
            {notices}
            <GraphTabList aria-label={title}>
              <GraphTab value="versions" data-testid="graph-library-tab-versions">
                {m3("sectionVersions")}
              </GraphTab>
              <GraphTab value="use" data-testid="graph-library-tab-use">
                {m3("sectionUse")}
              </GraphTab>
              <GraphTab value="share" data-testid="graph-library-tab-share">
                {m3("sectionShare")}
              </GraphTab>
              <GraphTab value="advanced" data-testid="graph-library-tab-advanced">
                {m3("sectionAdvanced")}
              </GraphTab>
            </GraphTabList>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-6 pb-4">
            <GraphTabPanel forceMount value="versions" data-testid="graph-library-panel-versions">
              {panels.versions}
            </GraphTabPanel>
            <GraphTabPanel forceMount value="use" data-testid="graph-library-panel-use">
              {panels.use}
            </GraphTabPanel>
            <GraphTabPanel forceMount value="share" data-testid="graph-library-share">
              {panels.share}
            </GraphTabPanel>
            <GraphTabPanel forceMount value="advanced" data-testid="graph-library-advanced">
              {panels.advanced}
            </GraphTabPanel>
          </div>
        </GraphTabs>
      </div>
      <footer
        className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-border px-6 py-3"
        data-testid="graph-library-footer"
      >
        {footer}
      </footer>
    </div>
  );
}
