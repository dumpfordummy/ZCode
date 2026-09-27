import { Profiler, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { GraphRun } from "@zcode/services";
import { ZCodeIntlProvider } from "../../packages/ui/src/i18n/IntlProvider.js";
import { GraphRunHistory } from "../../packages/ui/src/graph-engineering/GraphRunHistory.js";
import { applyTheme } from "../../packages/ui/src/useTheme.js";

// UI-only synthetic props. This page has no Graph service, runtime or persisted run store.
const runs: GraphRun[] = Array.from({ length: 500 }, (_, index) => ({
  id: `ui-only-${index}`,
  requestId: `synthetic-request-${index}`,
  attemptId: `synthetic-attempt-${index}`,
  commandId: `synthetic-command-${index}`,
  inputId: `synthetic-input-${index}`,
  target: { workspacePath: "synthetic-ui-fixture" },
  definition: {
    name: `Synthetic history ${String(index + 1).padStart(3, "0")}`,
    revision: index,
    taskName: "UI fixture only",
    instructions: "No execution or evidence is represented by this fixture.",
    nodes: [],
    edges: [],
  },
  modelSelection: { providerId: "none", modelId: "none" },
  mode: "build",
  status: "Completed",
  createdAt: 1700000000000 + index * 1000,
  updatedAt: 1700000000000 + index * 1000,
}));
function freeze(value: unknown): void {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
}
freeze(runs);
const initial = JSON.stringify(runs);
const renders: Array<{ phase: string; durationMs: number }> = [];
Object.defineProperty(window, "preZ8HistoryFixture", {
  value: () => ({
    layer: "isolated actual-component UI fixture; synthetic data, no execution evidence",
    count: runs.length,
    initial,
    current: JSON.stringify(runs),
    renders: [...renders],
  }),
});

function Fixture() {
  const [selected, setSelected] = useState("ui-only-0");
  const [dark, setDark] = useState(false);
  useEffect(() => {
    // 真实主题还设置 theme-zai-*；仅切换 dark 会生成与产品不同的按钮颜色。
    applyTheme(dark ? "zai-dark" : "zai-light");
  }, [dark]);
  return (
    <ZCodeIntlProvider initialLocale="en-US">
      <main className="min-h-screen space-y-4 bg-background p-4 text-foreground">
        <h1 className="text-xl font-medium">UI fixture: 500 synthetic history rows</h1>
        <p>No sessions, commands, provider calls or stored Graph runs exist in this fixture.</p>
        <button
          type="button"
          data-testid="fixture-theme"
          className="rounded border p-2"
          onClick={() => setDark(!dark)}
        >
          Switch to {dark ? "light" : "dark"}
        </button>
        <p data-testid="fixture-selection">Selected: {selected}</p>
        <Profiler
          id="actual-GraphRunHistory"
          onRender={(_id, phase, durationMs) => renders.push({ phase, durationMs })}
        >
          <GraphRunHistory runs={runs} selectedRunId={selected} onSelect={setSelected} />
        </Profiler>
        <p className="text-foreground-subtle">
          Pagination renders a bounded view. All 500 original immutable props remain available.
        </p>
      </main>
    </ZCodeIntlProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
