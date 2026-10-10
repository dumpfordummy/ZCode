import { useEffect, useRef, useState } from "react";
import type { GraphProjectDiscovery, GraphRecipe } from "@zcode/services";
import type { useGraphProjectSetup } from "@/hooks/useGraphProjectSetup.js";
import { Button } from "@/components/ui/button.js";
import { Checkbox } from "@/components/ui/checkbox.js";
import { Input } from "@/components/ui/input.js";
import { GraphSelect } from "./GraphSelect.js";
import { useGraphM4Text } from "./GraphM4Text.js";
import { quickDotnetChoices, quickDotnetPreset } from "./graphQuickDotnetModel.js";

/** Composition of the existing scan/compiler/save path; no executable or persisted authority here. */
export function GraphQuickDotnet({
  setup,
  text,
  disabled,
  onSave,
}: {
  setup: ReturnType<typeof useGraphProjectSetup>;
  text: string;
  disabled: boolean;
  onSave(recipes: GraphRecipe[], run: boolean): Promise<boolean>;
}) {
  const t = useGraphM4Text();
  const [adding, setAdding] = useState(false);
  const [discovery, setDiscovery] = useState<GraphProjectDiscovery>();
  const [prepared, setPrepared] = useState<GraphProjectDiscovery>();
  const [scanRoot, setScanRoot] = useState("");
  const [progress, setProgress] = useState("");
  const [detailPage, setDetailPage] = useState(0);
  const [testPage, setTestPage] = useState(0);
  const [build, setBuild] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [request, setRequest] = useState("");
  const alive = useRef(true);
  const generation = useRef(0);
  const flight = useRef(false);
  const key = JSON.stringify({
    text,
    build,
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
    ? {
        ...quickDotnetChoices(discovery),
        scopes: quickDotnetChoices(prepared?.prepared ? prepared : discovery).scopes,
      }
    : undefined;
  const diagnostics = [
    ...new Set([
      ...(discovery?.issues ?? []),
      ...(prepared?.issues ?? []),
      ...(discovery?.candidates ?? []).flatMap((item) =>
        [...(item.quickIssues ?? []), ...item.issues].map((issue) => `${item.path}: ${issue}`),
      ),
    ]),
  ].slice(0, 128);
  let issue = "";
  try {
    if (discovery) quickDotnetPreset(prepared ?? discovery, build, scopes, text);
  } catch (cause) {
    issue = cause instanceof Error ? cause.message : String(cause);
  }
  const scan = async (selectedProject?: string) => {
    const version = ++generation.current;
    const id = crypto.randomUUID();
    setRequest(id);
    setBusy(true);
    setError("");
    setProgress("");
    setPrepared(undefined);
    setDetailPage(0);
    setTestPage(0);
    if (!selectedProject) setDiscovery(undefined);
    const result = await setup.invoke(
      { action: "scan", requestId: id, ...(selectedProject ? { selectedProject } : { scanRoot }) },
      id,
      () => alive.current && generation.current === version,
    );
    if (!alive.current || generation.current !== version) return;
    setBusy(false);
    if (result?.kind === "discovery") {
      const found = quickDotnetChoices(result);
      if (selectedProject) {
        setPrepared(result);
        setScopes(found.scopes.length === 1 ? [found.scopes[0]!.id] : []);
      } else {
        setDiscovery(result);
        const selected = found.builds.length === 1 ? found.builds[0]!.path : "";
        setBuild(selected);
        setScopes([]);
        if (selected) await scan(selected);
      }
    }
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
  const scanState = setup.state("scan", request);
  const compileState = setup.state("dotnet-preset", key);
  return (
    <section className="space-y-3" data-testid="graph-quick-dotnet">
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
              onChange={(event) => setScanRoot(event.target.value)}
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
              <p className="text-ui-base font-medium">
                {t(
                  discovery.status !== "complete"
                    ? "quickPartial"
                    : discovery.candidates.length
                      ? "quickDetected"
                      : "quickNoRunner",
                )}
                {discovery.status !== "complete" && discovery.issues[0] ? (
                  <span className="mt-1 block break-words text-ui-sm font-normal">
                    {discovery.issues[0].slice(0, 240)}
                    {discovery.issues[0].length > 240 ? "…" : ""}
                  </span>
                ) : null}
              </p>
              {prepared?.prepared ? (
                <p className="text-ui-sm">
                  {t("quickPrepared", { count: prepared.prepared.scope.sourceCount })}
                </p>
              ) : null}
              {prepared?.issues[0] ? (
                <p role="status" className="text-ui-sm text-warning">
                  {prepared.issues[0]}
                </p>
              ) : null}
              {diagnostics.length ? (
                <details className="text-ui-sm" data-testid="graph-quick-details">
                  <summary>
                    {t("quickDetails", {
                      count: discovery.candidates.filter(
                        (item) => item.coverage === "unsupported" || item.quickIssues?.length,
                      ).length,
                    })}
                  </summary>
                  <ul className="max-h-64 overflow-auto break-words">
                    {diagnostics.slice(detailPage * 20, (detailPage + 1) * 20).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  {diagnostics.length > 20 ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!detailPage}
                        onClick={() => setDetailPage((page) => page - 1)}
                      >
                        {t("quickPrevious")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={(detailPage + 1) * 20 >= diagnostics.length}
                        onClick={() => setDetailPage((page) => page + 1)}
                      >
                        {t("quickNext")}
                      </Button>
                    </div>
                  ) : null}
                </details>
              ) : null}
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
                  ...choices.builds.map((item) => ({ value: item.path, label: item.path })),
                ]}
                onChange={(value) => {
                  setBuild(value === "none" ? "" : value);
                  setPrepared(undefined);
                  setScopes([]);
                  if (value !== "none") void scan(value);
                }}
              />
              <p className="text-ui-sm font-medium">{t("quickTests")}</p>
              {choices.scopes.slice(testPage * 20, (testPage + 1) * 20).map((scope, index) => (
                <label className="flex min-h-7 items-center gap-2 text-ui-sm" key={scope.id}>
                  <Checkbox
                    checked={scopes.includes(scope.id)}
                    disabled={
                      disabled || busy || (scopes.length >= 7 && !scopes.includes(scope.id))
                    }
                    data-testid={`graph-quick-test-${testPage * 20 + index}`}
                    onCheckedChange={(checked) =>
                      setScopes((old) =>
                        checked === true ? [...old, scope.id] : old.filter((id) => id !== scope.id),
                      )
                    }
                  />
                  <span className="break-all">
                    {scope.project} · {scope.framework}
                    {scopes.includes(scope.id) ? ` · ${scopes.indexOf(scope.id) + 1}` : ""}
                  </span>
                </label>
              ))}
              {choices.scopes.length > 20 ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!testPage}
                    onClick={() => setTestPage((page) => page - 1)}
                  >
                    {t("quickPrevious")}
                  </Button>
                  <span className="text-ui-sm">
                    {testPage + 1} / {Math.ceil(choices.scopes.length / 20)}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={(testPage + 1) * 20 >= choices.scopes.length}
                    onClick={() => setTestPage((page) => page + 1)}
                  >
                    {t("quickNext")}
                  </Button>
                </div>
              ) : null}
              {!choices.scopes.length ? (
                <p className="text-ui-sm text-warning">
                  {t(prepared?.prepared ? "quickNoRunner" : "quickTestsIncomplete")}
                </p>
              ) : null}
              {issue ? (
                <p role="status" className="text-ui-sm text-warning">
                  {!build || (!scopes.length && choices.scopes.length) ? (
                    t("quickChooseTargets")
                  ) : (
                    <>
                      {t("quickUnavailable")} {issue}
                    </>
                  )}
                </p>
              ) : null}
              <p className="text-ui-sm text-foreground-subtle">{t("quickDefaults")}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={disabled || busy || Boolean(issue)}
                  data-testid="graph-quick-save"
                  onClick={() => void save(false)}
                >
                  {t("quickSave")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={disabled || busy || Boolean(issue)}
                  data-testid="graph-quick-save-run"
                  onClick={() => void save(true)}
                >
                  {t("quickSaveRun")}
                </Button>
              </div>
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
