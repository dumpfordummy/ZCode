import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { GraphRecipeReadState } from "./graphRecipeRead.js";

export function GraphRecipeReadStatus({
  state,
  onRead,
  onSetup,
}: {
  state: GraphRecipeReadState;
  onRead(): void;
  onSetup?(): void;
}) {
  const { intl } = useZCodeIntl();
  const t = (key: string, values?: Record<string, string | number>) =>
    intl.formatMessage({ id: `graph.preZ8.${key}` }, values);
  return (
    <section
      className="space-y-2 text-ui-sm"
      data-testid="graph-recipe-read-state"
      data-state={state.status}
    >
      <p
        role={state.status === "error" ? "alert" : "status"}
        className={state.status === "error" ? "text-destructive" : "text-foreground-subtle"}
      >
        {state.status === "not-loaded"
          ? t("notLoaded")
          : state.status === "loading"
            ? t("loadingChecks")
            : state.status === "error"
              ? t("readFailed")
              : state.snapshot.recipes.length
                ? t("checksLoaded", { count: state.snapshot.recipes.length })
                : t("noChecks")}
      </p>
      {state.status === "error" ? (
        <p className="break-words text-destructive">{state.error}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={state.status === "loading"}
          onClick={onRead}
          data-testid="graph-template-load-recipes"
        >
          {t(state.status === "error" ? "retryRead" : "refreshChecks")}
        </Button>
        {onSetup ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSetup}
            data-testid="graph-template-setup-checks"
          >
            {intl.formatMessage({ id: "graph.m4.quickSetup" })}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
