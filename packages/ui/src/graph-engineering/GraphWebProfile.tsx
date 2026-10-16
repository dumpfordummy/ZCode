import { useEffect, useState } from "react";
import { WEB_PROFILE_POLICY } from "@zcode/shared";
import type { GraphInspection, GraphProjectSetupResult, GraphRecipe } from "@zcode/services";
import type { useGraphProjectSetup } from "@/hooks/useGraphProjectSetup.js";
import { Button } from "@/components/ui/button.js";
import { GraphSelect } from "./GraphSelect.js";
import { GraphProjectInspection } from "./GraphProjectInspection.js";
import { useGraphM4Text } from "./GraphM4Text.js";
type Proposal = Extract<GraphProjectSetupResult, { kind: "web-profile-proposal" }>;
export function GraphWebProfile({
  setup,
  webProject,
  configuration,
  candidates,
  disabled,
  onSave,
  onOpenConversation,
  onMatched,
}: {
  setup: ReturnType<typeof useGraphProjectSetup>;
  webProject: string;
  configuration: string;
  candidates: string[];
  disabled: boolean;
  onSave(recipes: GraphRecipe[], run: boolean): Promise<boolean>;
  onMatched?(value: boolean): void;
  onOpenConversation?: (path: string, session: string, identity?: string) => void;
}) {
  const t = useGraphM4Text(),
    [tests, setTests] = useState<string[]>([]),
    [selected, setSelected] = useState(""),
    [role, setRole] = useState<"web" | "test">("web");
  const [rows, setRows] = useState<GraphInspection[]>([]),
    [proposal, setProposal] = useState<Proposal>(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const key = JSON.stringify({ webProject, configuration, selected });
  useEffect(() => {
    onMatched?.(!!selected);
  }, [selected, onMatched]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void setup
        .invoke({ action: "inspection-history" }, key, () => active)
        .then((result) => {
          if (active && result?.kind === "inspection-history") setRows(result.records);
        });
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [key, setup.invoke]);
  const matching = rows.filter(
    (row) =>
      row.selection.webProfile?.webProject === webProject &&
      row.selection.webProfile.testProject === selected &&
      row.selection.configuration === configuration,
  );
  const web = matching.filter((row) => row.selection.project === webProject).at(-1),
    test = matching.filter((row) => row.selection.project === selected).at(-1);
  const active = matching.some((row) => row.reserved),
    current = role === "web" ? web : test;
  const invoke = async (action: Parameters<typeof setup.invoke>[0]) => {
    setBusy(true);
    setMessage("");
    const result = await setup.invoke(action, key);
    setBusy(false);
    return result;
  };
  const save = async (run: boolean) => {
    if (!proposal) return;
    setBusy(true);
    try {
      if (await onSave(proposal.recipes, run)) {
        setProposal(undefined);
        setMessage(t("webSaved"));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="space-y-3 border-l-2 border-border pl-3"
      data-testid="graph-web-profile"
      data-state={proposal ? "review-ready" : selected ? "inspection-required" : "unsupported"}
    >
      <h4 className="font-semibold">{t("webTitle")}</h4>
      <p className="text-ui-sm">{t("webLimits")}</p>
      <Button
        data-testid="graph-web-find"
        disabled={disabled || busy || active}
        onClick={() =>
          void invoke({
            action: "web-profile-choices",
            webProject,
            configuration: configuration as "Debug" | "Release",
            candidates,
          }).then((result) => {
            if (result?.kind === "web-profile-choices") {
              setTests(result.tests);
              setSelected((old) =>
                result.tests.includes(old)
                  ? old
                  : result.tests.length === 1
                    ? result.tests[0]!
                    : "",
              );
              setProposal(undefined);
              setMessage(result.tests.length ? t("webMatching") : result.issues.join("\n"));
            }
          })
        }
      >
        {t("webFind")}
      </Button>
      {tests.length ? (
        <GraphSelect
          label={t("quickTests")}
          value={selected}
          options={tests.map((value) => ({ value, label: value }))}
          disabled={disabled || busy || active}
          onChange={(value) => {
            setSelected(value);
            setProposal(undefined);
            setRole("web");
          }}
        />
      ) : null}
      {selected ? (
        <>
          <p className="text-ui-sm">
            {t("webBuildTarget")}: <code>{selected}</code> → <code>{webProject}</code>
          </p>
          <div className="flex gap-2">
            {(["web", "test"] as const).map((value) => (
              <Button
                key={value}
                data-testid={`graph-web-role-${value}`}
                variant={role === value ? "default" : "outline"}
                disabled={busy || active}
                onClick={() => setRole(value)}
              >
                {value === "web" ? t("webService") : t("webTests")} ·{" "}
                {t(
                  (value === "web" ? web : test)?.status === "succeeded"
                    ? "webObserved"
                    : "webUnobserved",
                )}
              </Button>
            ))}
          </div>
          <GraphProjectInspection
            key={key + role}
            setup={setup}
            project={role === "web" ? webProject : selected}
            configuration={configuration}
            disabled={disabled || busy}
            fixedSelection={{
              project: role === "web" ? webProject : selected,
              configuration: configuration as "Debug" | "Release",
              framework: "net8.0",
              sdkVersion: "8.0.426",
              webProfile: { policy: WEB_PROFILE_POLICY, webProject, testProject: selected },
            }}
            initialRecord={current}
            onRecord={(row) => {
              setRows((old) => [...old.filter((item) => item.id !== row.id), row]);
              setProposal(undefined);
            }}
            onOpenConversation={onOpenConversation}
          />
          <Button
            data-testid="graph-web-prepare"
            disabled={
              disabled ||
              busy ||
              active ||
              web?.status !== "succeeded" ||
              test?.status !== "succeeded"
            }
            onClick={() =>
              void invoke({
                action: "prepare-web-profile",
                inspectionIds: [web!.id, test!.id],
              }).then((result) => {
                if (result?.kind === "web-profile-proposal") setProposal(result);
              })
            }
          >
            {t("webPrepare")}
          </Button>
        </>
      ) : null}
      {busy ? <p role="status">{t("webVerifying")}</p> : null}
      {proposal ? (
        <div data-testid="graph-web-proposal" className="space-y-2">
          <p>
            {t("webPrepared")} · {proposal.scope.sourceCount} {t("inspectionFiles")}
          </p>
          <p>
            <code>{proposal.scope.assemblies.web}</code>
            <br />
            <code>{proposal.scope.assemblies.test}</code>
          </p>
          <details>
            <summary>{t("webSources")}</summary>
            <pre>{proposal.sourcePaths.join("\n")}</pre>
          </details>
          <p>
            {t("webExcluded")}: {proposal.excludedOutputRoots.join(", ")}
          </p>
          <Button
            data-testid="graph-web-save"
            disabled={busy || disabled}
            onClick={() => void save(false)}
          >
            {t("quickSave")}
          </Button>
          <Button
            data-testid="graph-web-save-run"
            disabled={busy || disabled}
            onClick={() => void save(true)}
          >
            {t("quickSaveRun")}
          </Button>
        </div>
      ) : null}
      {message ? (
        <p role="status" className="text-ui-sm whitespace-pre-wrap">
          {message}
        </p>
      ) : null}
      {["web-profile-choices", "prepare-web-profile"].map((lane) => {
        const state = setup.state(lane, key);
        return state.status === "error" ? (
          <p key={lane} role="alert">
            {state.error}
          </p>
        ) : null;
      })}
    </section>
  );
}
