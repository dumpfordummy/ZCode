// 浏览器组件测试页：挂载 **真实** 的 GraphTemplateBindings（含真实的 GraphContextSection、Picker、
// useGraphReferencePicker / useGraphProjectSetup / useWorkspaceServicesResolution、Radix Popover、
// 草稿 store 与 i18n）。被替换的只有服务与平台边界（FIXTURE）：fileService.searchWorkspaceFiles、
// graphWorkflowService.projectSetup 与 platform.selectFile 通过 Playwright 桥转到 Node 侧的 Host 夹具
// （scripts/graph-engineering/context-picker-host.mjs）。任何其他服务/平台成员被访问都会被记录为
// FORBIDDEN 并抛错，用来证明打开/搜索/选择不会启动 agent、执行命令或创建运行。
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "../../../packages/ui/src/styles.css";
import { ZCodeIntlProvider } from "@/i18n/IntlProvider.js";
import { PlatformProvider } from "@/hooks/usePlatform.js";
import { ServiceProvider } from "@/hooks/useServices.js";
import { TabStoreProvider } from "@/store/TabStoreProvider.js";
import { GraphTemplateBindings } from "@/graph-engineering/GraphTemplateBindings.js";
import { graphFocusClass } from "@/graph-engineering/graphFocus.js";
import { useGraphDraftStore } from "@/store/graphDraftStore.js";

interface Bridge {
  projectSetup(request: unknown): Promise<unknown>;
  searchFiles(params: unknown): Promise<unknown>;
  pickFile(): Promise<string | null>;
  record(op: string, detail?: unknown): Promise<void>;
}
declare global {
  interface Window {
    __bridge: Bridge;
    __TEMPLATES__: Record<string, unknown>;
    __WORKSPACES__: Record<string, string>;
    __harness: {
      ready: boolean;
      set(patch: Partial<HarnessState>): void;
      draft(workspace: string, template: string): unknown;
      seedDraft(workspace: string, template: string, draft: unknown): void;
    };
  }
}

interface HarnessState {
  workspace: string;
  template: string;
  locale: "en-US" | "zh-CN";
  theme: "zai-dark" | "zai-light";
  disabled: boolean;
  /** true 时不提供 graphWorkflowService，模拟此工作区不支持上下文搜索。 */
  unsupported: boolean;
}

/**
 * React 19 开发构建会为性能轨迹/DevTools 探测对象属性（$$typeof、then 等）；这些不是业务访问，
 * 返回 undefined。除白名单与显式声明为「可缺席」的成员外，任何服务/平台成员访问都记录为 FORBIDDEN 并抛错。
 */
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
      void window.__bridge.record("FORBIDDEN", { member: `${name}.${prop}` });
      throw new Error(`Forbidden access to ${name}.${prop}`);
    },
  });
}

const fileService = guard("fileService", {
  searchWorkspaceFiles: (params: unknown) => window.__bridge.searchFiles(params),
});
const services = (unsupported: boolean) =>
  guard(
    "services",
    {
      fileService,
      ...(unsupported
        ? {}
        : {
            graphWorkflowService: guard("graphWorkflowService", {
              projectSetup: (request: unknown) => window.__bridge.projectSetup(request),
            }),
          }),
    },
    // 「不支持」场景下宿主不提供图工程服务：读取它得到 undefined 是正常探测，不是越权。
    ["graphWorkflowService"],
  );
const platform = guard("platform", {
  canSelectFilePath: true,
  selectFile: () => window.__bridge.pickFile(),
});

const initial: HarnessState = {
  workspace: "A",
  template: "agent-assisted",
  locale: "en-US",
  theme: "zai-dark",
  disabled: false,
  unsupported: false,
};

function Harness() {
  const [state, setState] = useState(initial);
  useEffect(() => {
    window.__harness = {
      ready: true,
      set: (patch) => setState((old) => ({ ...old, ...patch })),
      draft: (workspace, template) =>
        useGraphDraftStore.getState().workspaces[window.__WORKSPACES__[workspace]!]?.templates[
          `${template}@1`
        ],
      seedDraft: (workspace, template, draft) =>
        useGraphDraftStore
          .getState()
          .setTemplateDraft(
            window.__WORKSPACES__[workspace]!,
            `${template}@1`,
            draft as Parameters<
              ReturnType<typeof useGraphDraftStore.getState>["setTemplateDraft"]
            >[2],
          ),
    };
  }, []);
  useEffect(() => {
    document.body.classList.add("bg-background", "text-foreground");
    const root = document.documentElement;
    root.classList.toggle("dark", state.theme === "zai-dark");
    root.classList.toggle("theme-zai-dark", state.theme === "zai-dark");
    root.classList.toggle("theme-zai-light", state.theme === "zai-light");
  }, [state.theme]);
  const workspacePath = window.__WORKSPACES__[state.workspace]!;
  return (
    <ZCodeIntlProvider key={state.locale} initialLocale={state.locale}>
      <TabStoreProvider>
        <ServiceProvider services={services(state.unsupported) as never}>
          <PlatformProvider platform={platform as never}>
            <div
              className={`${graphFocusClass} mx-auto min-h-screen w-full space-y-3 bg-background p-4 text-foreground`}
              // 右侧详情窗格的近似宽度；Tailwind 不会为 packages/ui 之外的任意值类生成样式，所以用内联样式。
              style={{ maxWidth: 860 }}
            >
              <GraphTemplateBindings
                version={window.__TEMPLATES__[state.template] as never}
                workspaceKey={workspacePath}
                workspacePath={workspacePath}
                templateKey={`${state.template}@1`}
                recipeReadState={{ status: "not-loaded", snapshot: null }}
                disabled={state.disabled}
                disabledReason={state.disabled ? "A run is unresolved." : undefined}
                onLoadRecipes={() => undefined}
                onOpenSetup={() => undefined}
                allowReview
                onInstantiate={(parameters, bindings, continuation) =>
                  void window.__bridge.record("instantiate", { parameters, bindings, continuation })
                }
              />
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
