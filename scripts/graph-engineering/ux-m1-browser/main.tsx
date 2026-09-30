// UX-M1 browser harness page. Mounts the REAL GraphEditor with the REAL useGraphEngineering (and
// the real run list, new-run pane, Context picker, checks editor, inline review, Needs-you, draft
// store and view store). Replaced (FIXTURE / labelled stubs): the Graph engineering and workflow
// services and the file/platform boundary (Node-side host via a Playwright bridge), the composer's
// model/mode configuration hook, the settings hook, and the Workflows design panel body.
// Any other service or platform member touched is recorded as FORBIDDEN and throws.
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "../../../packages/ui/src/styles.css";
import { ZCodeIntlProvider } from "@/i18n/IntlProvider.js";
import { PlatformProvider } from "@/hooks/usePlatform.js";
import { ServiceProvider } from "@/hooks/useServices.js";
import { useGraphEngineering } from "@/hooks/useGraphEngineering.js";
import { GraphEditor } from "@/graph-engineering/GraphEditor.js";
import { graphFocusClass } from "@/graph-engineering/graphFocus.js";
import { TabStoreProvider } from "@/store/TabStoreProvider.js";
import { useGraphDraftStore } from "@/store/graphDraftStore.js";
import { useGraphEngineeringViewStore } from "@/store/graphEngineeringViewStore.js";

type Call = (...args: unknown[]) => Promise<unknown>;
declare global {
  interface Window {
    __ux: Record<string, Call>;
    __WORKSPACES__: Record<string, string>;
    __emitGraphChange: (workspaceKey: string) => void;
    __probe: ReturnType<typeof useGraphEngineering>;
    __harness: {
      ready: boolean;
      set(patch: Partial<HarnessState>): void;
      drafts(): unknown;
      navigation(): unknown;
    };
  }
}
interface HarnessState {
  workspace: string;
  locale: "en-US" | "zh-CN";
  theme: "zai-dark" | "zai-light";
}

const INTROSPECTION = new Set([
  "$$typeof",
  "_owner",
  "_store",
  "then",
  "toJSON",
  "constructor",
  "prototype",
  "nodeType",
  "tagName",
  "valueOf",
  "toString",
  "displayName",
  "name",
  "length",
]);
function guard<T extends object>(name: string, allowed: T, optionalAbsent: string[] = []): T {
  return new Proxy(allowed, {
    get(target, prop, receiver) {
      if (typeof prop === "symbol" || prop in target) return Reflect.get(target, prop, receiver);
      if (INTROSPECTION.has(prop) || optionalAbsent.includes(prop)) return undefined;
      void window.__ux.record!("FORBIDDEN", { member: `${name}.${prop}` });
      throw new Error(`Forbidden access to ${name}.${prop}`);
    },
  });
}

const listeners = new Set<(event: { workspaceKey: string }) => void>();
window.__emitGraphChange = (workspaceKey) => {
  // 监听器可能在回调里退订，因此先取快照再遍历。
  Array.from(listeners).forEach((listener) => listener({ workspaceKey }));
};
const ux =
  (name: string) =>
  (...args: unknown[]) =>
    window.__ux[name]!(...args);

const graphEngineeringService = guard("graphEngineeringService", {
  getWorkspace: ux("getWorkspace"),
  saveDefinition: ux("saveDefinition"),
  validateDefinition: ux("validateDefinition"),
  recipes: ux("recipes"),
  run: ux("run"),
  onDidChange: (listener: (event: { workspaceKey: string }) => void) => {
    listeners.add(listener);
    return { dispose: () => listeners.delete(listener) };
  },
});
const graphWorkflowService = guard("graphWorkflowService", {
  list: ux("list"),
  mutate: ux("mutate"),
  preview: ux("preview"),
  instantiate: ux("instantiate"),
  prepare: ux("prepare"),
  projectSetup: ux("projectSetup"),
});
const services = guard("services", {
  graphEngineeringService,
  graphWorkflowService,
  fileService: guard("fileService", { searchWorkspaceFiles: ux("searchFiles") }),
});
const platform = guard("platform", { canSelectFilePath: true, selectFile: ux("pickFile") });

function Probe({ path }: { path: string }) {
  // 第二个真实的 useGraphEngineering 实例：让测试不经过任何按钮直接调用 run / prepareRunConfirmation。
  window.__probe = useGraphEngineering({ workspacePath: path });
  return null;
}

function Panel({ path }: { path: string }) {
  const props = {
    workspacePath: path,
    onOpenConversation: (...args: unknown[]) => void window.__ux.record!("openConversation", args),
    onBack: () => undefined,
  };
  const graph = useGraphEngineering(props);
  if (graph.loading) return <p role="status">Loading…</p>;
  if (!graph.view) return <p role="alert">{graph.error}</p>;
  return <GraphEditor key={path} {...(props as never)} graph={graph} view={graph.view} />;
}

const initial: HarnessState = { workspace: "A", locale: "en-US", theme: "zai-dark" };

function Harness() {
  const [state, setState] = useState(initial);
  useEffect(() => {
    window.__harness = {
      ready: true,
      set: (patch) => setState((old) => ({ ...old, ...patch })),
      drafts: () => JSON.parse(JSON.stringify(useGraphDraftStore.getState().workspaces)),
      navigation: () =>
        JSON.parse(JSON.stringify(useGraphEngineeringViewStore.getState().selections)),
    };
  }, []);
  useEffect(() => {
    // 共享样式表把 html/body/#root 设为透明（真实应用的窗口外壳提供背景）。harness 没有外壳，
    // 这里用 !important 内联补上，避免宽屏截图两侧露出白色空白；不影响被测组件本身。
    document.documentElement.style.setProperty(
      "background-color",
      "var(--color-background)",
      "important",
    );
    document.body.style.setProperty("color", "var(--color-foreground)");
    const root = document.documentElement;
    root.classList.toggle("dark", state.theme === "zai-dark");
    root.classList.toggle("theme-zai-dark", state.theme === "zai-dark");
    root.classList.toggle("theme-zai-light", state.theme === "zai-light");
  }, [state.theme]);
  const path = window.__WORKSPACES__[state.workspace]!;
  return (
    <ZCodeIntlProvider key={state.locale} initialLocale={state.locale}>
      <TabStoreProvider>
        <ServiceProvider services={services as never}>
          <PlatformProvider platform={platform as never}>
            <div
              className={`${graphFocusClass} mx-auto flex h-screen w-full flex-col bg-background text-foreground`}
              style={{ maxWidth: 1200 }}
            >
              <Probe path={path} />
              <div className="flex min-h-0 flex-1 flex-col" data-testid="graph-engineering-panel">
                <Panel path={path} />
              </div>
            </div>
          </PlatformProvider>
        </ServiceProvider>
      </TabStoreProvider>
    </ZCodeIntlProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
