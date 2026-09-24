import type { GraphRunProvenance } from "@zcode/services";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

/** Captured metadata only: showing references never opens, installs or enables them. */
export function GraphWorkflowProvenance({ provenance }: { provenance: GraphRunProvenance }) {
  const { intl } = useZCodeIntl(),
    t = (key: string) => intl.formatMessage({ id: `graph.z6.${key}` });
  const environment = provenance.environment;
  return (
    <section className="space-y-3 break-words text-ui-sm" data-testid="graph-workflow-provenance">
      <h3 className="font-medium text-ui-base">{t("provenance")}</h3>
      <p>
        {provenance.template.name} · {t("version")} {provenance.template.version}
      </p>
      <p className="break-all font-mono text-ui-xs">
        {provenance.template.id} · {provenance.template.digest}
      </p>
      {provenance.operationalDecision ? (
        <p data-testid="graph-operational-decision">
          {t("acceptedDecision")}:{" "}
          {provenance.operationalDecision.acknowledgedUnknowns
            ? t("acknowledged")
            : t("notAcknowledged")}{" "}
          · {new Date(provenance.operationalDecision.acceptedAt).toISOString()}
        </p>
      ) : null}
      <details>
        <summary>{t("parameters")}</summary>
        <Json value={provenance.template.parameters} />
      </details>
      {provenance.template.excluded.length ? (
        <details>
          <summary>{t("excludedNodes")}</summary>
          <Json value={provenance.template.excluded} />
        </details>
      ) : null}
      <details open>
        <summary>{t("models")}</summary>
        <ul className="space-y-1">
          {provenance.models.map((model) => (
            <li key={model.nodeId} className="break-all">
              {model.nodeId}: {model.providerId} / {model.modelId} · {model.type} ·{" "}
              {model.destination}
              <p className="font-mono text-ui-xs text-foreground-subtle">
                {model.configurationDigest}
              </p>
            </li>
          ))}
        </ul>
      </details>
      <details open>
        <summary>{t("auxiliary")}</summary>
        <ul className="space-y-1">
          {provenance.auxiliary.map((value, index) => (
            <li key={index}>{value}</li>
          ))}
        </ul>
      </details>
      <details>
        <summary>{t("references")}</summary>
        <Json value={provenance.references} />
      </details>
      <details>
        <summary>{t("inheritedInstructions")}</summary>
        <Json value={environment.instructions} />
      </details>
      <details>
        <summary>
          {t("nativeEnvironment")} · {environment.status}
        </summary>
        <p className="text-foreground-subtle">{t("environmentHelp")}</p>
        <Json
          value={{
            configurationDigest: environment.configDigest,
            executables: environment.executables,
            skills: environment.skills,
            plugins: environment.plugins,
            hooks: environment.hooks,
            mcp: environment.mcp,
          }}
        />
      </details>
      <details>
        <summary>{t("recipesPermissions")}</summary>
        <Json value={{ recipes: provenance.recipes, permissions: provenance.permissions }} />
      </details>
      {provenance.unknowns.length ? (
        <div className="space-y-1 text-warning" data-testid="graph-preflight-unknowns">
          <p className="font-medium">{t("unknowns")}</p>
          <ul>
            {provenance.unknowns.map((value, index) => (
              <li key={index}>{value}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-foreground-subtle">{t("nativeAccess")}</p>
      <p className="break-all font-mono text-ui-xs">
        {t("preflightDigest")}: {provenance.digest}
      </p>
    </section>
  );
}
function Json({ value }: { value: unknown }) {
  return (
    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-ui-xs">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
