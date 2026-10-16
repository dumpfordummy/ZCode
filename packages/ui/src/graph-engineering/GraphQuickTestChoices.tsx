import { useState } from "react";
import { Button } from "@/components/ui/button.js";
import { Checkbox } from "@/components/ui/checkbox.js";
import { useGraphM4Text } from "./GraphM4Text.js";
export function GraphQuickTestChoices({
  choices,
  scopes,
  setScopes,
  disabled,
  busy,
}: {
  choices: Array<{ id: string; project: string; framework: string }>;
  scopes: string[];
  setScopes: React.Dispatch<React.SetStateAction<string[]>>;
  disabled: boolean;
  busy: boolean;
}) {
  const t = useGraphM4Text();
  const [testPage, setTestPage] = useState(0);
  return (
    <>
      {scopes
        .filter((id) => !choices.some((choice) => choice.id === id))
        .map((id) => (
          <label className="flex min-h-7 items-center gap-2 text-ui-sm text-warning" key={id}>
            <Checkbox
              checked
              disabled={disabled || busy}
              onCheckedChange={() => setScopes((old) => old.filter((value) => value !== id))}
            />
            <span>
              {id} ({t("quickUnresolved")})
            </span>
          </label>
        ))}
      {choices.slice(testPage * 20, (testPage + 1) * 20).map((scope, index) => (
        <label className="flex min-h-7 items-center gap-2 text-ui-sm" key={scope.id}>
          <Checkbox
            checked={scopes.includes(scope.id)}
            disabled={disabled || busy || (scopes.length >= 7 && !scopes.includes(scope.id))}
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
      {choices.length > 20 ? (
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
            {testPage + 1} / {Math.ceil(choices.length / 20)}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={(testPage + 1) * 20 >= choices.length}
            onClick={() => setTestPage((page) => page + 1)}
          >
            {t("quickNext")}
          </Button>
        </div>
      ) : null}
    </>
  );
}

export function GraphQuickTestAlternatives({
  projects,
  disabled,
  onChoose,
}: {
  projects: string[];
  disabled: boolean;
  onChoose(project: string): void;
}) {
  const t = useGraphM4Text();
  return (
    <div className="space-y-1" data-testid="graph-quick-test-alternatives">
      <p className="text-ui-sm">{t("quickNoLinkedTests")}</p>
      {[...new Set(projects)].slice(0, 5).map((project) => (
        <Button
          key={project}
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => onChoose(project)}
        >
          {t("quickPrepareTestBuild")} {project}
        </Button>
      ))}
    </div>
  );
}
