import { useEffect, useRef, useState } from "react";
import type { GraphProjectDiscovery, GraphRecipe } from "@zcode/services";
import type { useGraphProjectSetup } from "@/hooks/useGraphProjectSetup.js";
import { Button } from "@/components/ui/button.js";
import { GraphQuickTestChoices } from "./GraphQuickTestChoices.js";
import { GraphQuickSave } from "./GraphQuickSave.js";
import { useGraphQuickDraft } from "@/hooks/useGraphQuickDraft.js";
import { Input } from "@/components/ui/input.js";
import { GraphQuickSummary } from "./GraphQuickSummary.js";
import { GraphQuickContinuation } from "./GraphQuickContinuation.js";
import { GraphSelect } from "./GraphSelect.js";
import { useGraphM4Text } from "./GraphM4Text.js";
import {
  quickDotnetChoices,
  quickDotnetPreset,
  quickDotnetSelection,
} from "./graphQuickDotnetModel.js";

/** Composition of the existing scan/compiler/save path; no executable or persisted authority here. */
export function GraphQuickDotnet({
  workspaceKey,
  setup,
  text,
  disabled,
  disabledReason,
  onSave,
  onOpenAdvanced,
}: {
  workspaceKey: string;
  setup: ReturnType<typeof useGraphProjectSetup>;
  text: string;
  disabled: boolean;
  disabledReason: string;
  onSave(recipes: GraphRecipe[], run: boolean): Promise<boolean>;
  onOpenAdvanced?(): void;
}) {
  const t = useGraphM4Text();
  const {
    scanRoot,
    setScanRoot,
    build,
    setBuild,
    configuration,
    setConfiguration,
    scopes,
    setScopes,
  } = useGraphQuickDraft(workspaceKey);
  const [adding, setAdding] = useState(false);
  const [discovery, setDiscovery] = useState<GraphProjectDiscovery>();
  const [prepared, setPrepared] = useState<GraphProjectDiscovery>();
  const [progress, setProgress] = useState("");
  const [preparation, setPreparation] = useState("not-started");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [request, setRequest] = useState("");
  const [groupCopies, setGroupCopies] = useState(false);
  const alive = useRef(true);
  const generation = useRef(0);
  const flight = useRef(false);
  const key = JSON.stringify({
    text,
    build,
    configuration,
    scopes,
    adding,
    discovery: discovery?.digest,
    prepared: prepared?.digest,
  });
  const current = useRef(key);
  current.current = key;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current++;
    };
  }, []);
  useEffect(() => {
    generation.current++;
    setDiscovery(undefined);
    setPrepared(undefined);
    setBusy(false);
  }, [setup.invoke]);
  useEffect(
    () => () => {
      if (request && !flight.current)
        void setup.invoke({ action: "cancel-scan", requestId: request }, request);
    },
    [request, setup.invoke],
  );
  useEffect(() => {
    if (!busy || !request || flight.current) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const result = await setup.invoke(
        { action: "scan-progress", requestId: request },
        request,
        () => !stopped,
      );
      if (stopped) return;
      if (result?.kind === "scan-progress")
        setProgress(`${result.stage}: ${result.entries} / ${result.metadata}`);
      timer = setTimeout(() => void poll(), 250);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [busy, request, setup.invoke]);
  const existing = text.trim() !== "[]";
  const choices = discovery
    ? quickDotnetSelection(discovery, prepared, build, groupCopies)
    : undefined;
  const scanState = setup.state("scan", request);
  let issue = "";
  try {
    if (discovery) quickDotnetPreset(prepared ?? discovery, build, scopes, text);
  } catch (cause) {
    issue = cause instanceof Error ? cause.message : String(cause);
  }
  if (preparation === "failed" && scanState.status === "error") issue = scanState.error;
  const scan = async (selectedProject?: string, selectedConfiguration = configuration) => {
    const version = ++generation.current;
    const id = crypto.randomUUID();
    setRequest(id);
    setBusy(true);
    setError("");
    setProgress("");
    setPrepared(undefined);
    setPreparation(selectedProject ? "preparing" : "not-started");
    if (!selectedProject) setDiscovery(undefined);
    const result = await setup.invoke(
      {
        action: "scan",
        requestId: id,
        configuration: selectedConfiguration,
        ...(selectedProject ? { selectedProject } : { scanRoot }),
      },
      id,
      () => alive.current && generation.current === version,
    );
    if (!alive.current || generation.current !== version) return;
    setBusy(false);
    if (result?.kind === "discovery") {
      const found = quickDotnetChoices(result);
      if (selectedProject) {
        setPrepared(result);
        setPreparation(
          result.prepared
            ? "ready"
            : result.status === "cancelled"
              ? "cancelled"
              : result.candidates.some(
                    (item) => item.coverage === "unsupported" || item.quickIssues?.length,
                  )
                ? "unsupported"
                : "failed",
        );
        const linked = quickDotnetSelection(result, result, selectedProject).scopes;
        setScopes((old) => (old.length ? old : linked.length === 1 ? [linked[0]!.id] : []));
      } else {
        setDiscovery(result);
        const retained = result.candidates.some((item) => item.path === build) ? build : "";
        const selected = retained || (found.builds.length === 1 ? found.builds[0]!.path : "");
        if (selected !== build) setScopes([]);
        setBuild(selected);
        if (selected) await scan(selected, selectedConfiguration);
      }
    } else if (selectedProject) setPreparation("failed");
  };
  const save = async (run: boolean) => {
    if (disabled || busy || flight.current || !prepared || issue) return;
    flight.current = true;
    setBusy(true);
    setError("");
    const version = generation.current;
    const isCurrent = () =>
      alive.current && generation.current === version && current.current === key;
    try {
      const preset = quickDotnetPreset(prepared, build, scopes, text);
      const result = await setup.invoke({ action: "dotnet-preset", preset }, key, isCurrent);
      if (!isCurrent()) return;
      if (result?.kind !== "validation") return;
      if (!result.recipes || result.diagnostics.length) {
        setError(result.diagnostics.map((item) => item.message).join("\n"));
        return;
      }
      if (await onSave(result.recipes, run)) {
        setAdding(false);
        setDiscovery(undefined);
      }
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      flight.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const compileState = setup.state("dotnet-preset", key);
  const selectBuild = (value: string) => {
    generation.current++;
    setBuild(value);
    // 构建改变后旧测试选择不能继承为新闭包的事实。
    setScopes([]);
    setPrepared(undefined);
    setPreparation("not-started");
    if (value) void scan(value);
  };
  return (
    <section className="space-y-3" data-testid="graph-quick-dotnet" data-preparation={preparation}>
      <h3 className="text-ui-base font-semibold">{t("quickTitle")}</h3>
      {existing && !adding ? (
        <>
          <p className="text-ui-sm text-foreground-subtle">{t("quickCustom")}</p>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => setAdding(true)}
            data-testid="graph-quick-add"
          >
            {t("quickAdd")}
          </Button>
        </>
      ) : (
        <>
          <p className="text-ui-sm text-foreground-subtle">{t("quickHelp")}</p>
          <label className="block space-y-1 text-ui-sm">
            <span>{t("quickScanRoot")}</span>
            <Input
              value={scanRoot}
              disabled={busy || disabled}
              placeholder="."
              data-testid="graph-quick-scan-root"
              onChange={(event) => {
                generation.current++;
                setScanRoot(event.target.value);
                setDiscovery(undefined);
                setPrepared(undefined);
                setBuild("");
                setScopes([]);
                setPreparation("not-started");
              }}
            />
          </label>
          {busy ? (
            <p role="status" className="text-ui-sm">
              {t("quickProgress")} {progress}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={disabled || busy || !setup.supported}
              onClick={() => void scan()}
              data-testid="graph-quick-scan"
            >
              {t("quickScan")}
            </Button>
            {busy || adding || discovery ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={flight.current}
                data-testid="graph-quick-cancel"
                onClick={() => {
                  generation.current++;
                  setBusy(false);
                  setAdding(false);
                  setDiscovery(undefined);
                  setPrepared(undefined);
                  setPreparation("cancelled");
                  setError("");
                  if (busy)
                    void setup.invoke({ action: "cancel-scan", requestId: request }, request);
                }}
              >
                {t("quickCancel")}
              </Button>
            ) : null}
          </div>
          {discovery && choices ? (
            <div className="space-y-3" data-testid="graph-quick-proposal">
              <GraphQuickSummary
                discovery={discovery}
                prepared={prepared}
                issue={issue}
                build={build}
                visible={choices.builds.length}
                hasCopies={choices.copies.length > 0}
                groupCopies={groupCopies}
                toggleCopies={() => setGroupCopies(!groupCopies)}
              />
              {choices.builds.length > 1 || choices.scopes.length > 1 ? (
                <p className="text-ui-sm text-warning">{t("quickAmbiguous")}</p>
              ) : null}
              <GraphSelect
                label={t("quickBuild")}
                value={build || "none"}
                disabled={disabled || busy}
                testId="graph-quick-build"
                options={[
                  { value: "none", label: t("quickChoose") },
                  ...(build && !choices.builds.some((item) => item.path === build)
                    ? [{ value: build, label: `${build} (${t("quickUnresolved")})` }]
                    : []),
                  ...choices.builds.map((item) => ({ value: item.path, label: item.path })),
                ]}
                onChange={(value) => selectBuild(value === "none" ? "" : value)}
              />
              <GraphSelect
                label={t("quickConfiguration")}
                value={configuration}
                disabled={disabled || busy}
                testId="graph-quick-configuration"
                options={["Debug", "Release"].map((value) => ({ value, label: value }))}
                onChange={(value) => {
                  setConfiguration(value);
                  if (build) void scan(build, value);
                }}
              />
              <p className="text-ui-sm font-medium">{t("quickTests")}</p>
              <p className="text-ui-sm text-foreground-subtle">{t("quickTestLink")}</p>
              {!prepared?.prepared && !issue ? (
                <p className="text-ui-sm text-warning">{t("quickTestsIncomplete")}</p>
              ) : null}
              <GraphQuickTestChoices
                key={`${build}|${configuration}|${prepared?.digest ?? ""}`}
                choices={choices.scopes}
                scopes={scopes}
                setScopes={setScopes}
                disabled={disabled}
                busy={busy}
              />
              {build && !busy && !choices.scopes.length ? (
                <div className="space-y-1" data-testid="graph-quick-test-alternatives">
                  <p className="text-ui-sm">{t("quickNoLinkedTests")}</p>
                  {[...new Set(choices.alternatives.map((scope) => scope.project))]
                    .slice(0, 5)
                    .map((project) => (
                      <Button
                        key={project}
                        size="sm"
                        variant="ghost"
                        disabled={disabled}
                        onClick={() => selectBuild(project)}
                      >
                        {t("quickPrepareTestBuild")} {project}
                      </Button>
                    ))}
                </div>
              ) : null}
              {issue && build && !busy ? (
                <GraphQuickContinuation
                  workspaceKey={workspaceKey}
                  build={build}
                  configuration={configuration}
                  scopes={scopes}
                  blocker={issue}
                  onOpenAdvanced={onOpenAdvanced}
                />
              ) : null}
              <p className="text-ui-sm text-foreground-subtle">{t("quickDefaults")}</p>
              <GraphQuickSave
                reason={
                  disabled
                    ? disabledReason
                    : busy
                      ? t("quickWorking")
                      : issue
                        ? t("quickResolveBlocker")
                        : !prepared?.prepared
                          ? t("quickTestsIncomplete")
                          : ""
                }
                onSave={(run) => void save(run)}
              />
            </div>
          ) : null}
        </>
      )}
      {error || scanState.status === "error" || compileState.status === "error" ? (
        <p className="text-ui-sm text-destructive" role="alert">
          {error ||
            (scanState.status === "error"
              ? scanState.error
              : compileState.status === "error"
                ? compileState.error
                : "")}
        </p>
      ) : null}
    </section>
  );
}
