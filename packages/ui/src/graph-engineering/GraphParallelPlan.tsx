import type { GraphParallelPlan as Plan } from "@zcode/services";
import { Input } from "@/components/ui/input.js";
import { Textarea } from "@/components/ui/textarea.js";
import { Checkbox } from "@/components/ui/checkbox.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
export function GraphParallelPlan({
  plan,
  onChange,
  disabled,
}: {
  plan: Plan;
  onChange: (plan: Plan) => void;
  disabled: boolean;
}) {
  const { intl } = useZCodeIntl(),
    t = (key: string) => intl.formatMessage({ id: `graph.z7.${key}` });
  const update = (patch: Partial<Plan>) => onChange({ ...plan, ...patch });
  return (
    <fieldset disabled={disabled} className="space-y-3" data-testid="parallel-plan">
      <label className="flex items-center gap-2 text-ui-sm">
        <Checkbox
          checked={plan.enabled}
          onCheckedChange={(value) => update({ enabled: value === true })}
          data-testid="parallel-enabled"
        />
        {t("enabled")}
      </label>
      <label className="block text-ui-sm">
        {t("name")}
        <Input
          value={plan.name}
          onChange={(e) => update({ name: e.target.value })}
          data-testid="parallel-name"
        />
      </label>
      {(["request", "sharedContract", "resultRequirements"] as const).map((field) => (
        <label key={field} className="block text-ui-sm">
          {t(field)}
          <Textarea
            value={plan[field]}
            onChange={(e) => update({ [field]: e.target.value })}
            data-testid={`parallel-${field}`}
          />
        </label>
      ))}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-ui-sm">
          {t("concurrency")}
          <select
            value={plan.concurrency}
            onChange={(e) => update({ concurrency: Number(e.target.value) as 1 | 2 })}
            className="w-full rounded-lg border border-input-border bg-input p-2 text-ui-sm"
            data-testid="parallel-concurrency"
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
          </select>
        </label>
        {(["deadlineMs", "admissionBudget"] as const).map((field) => (
          <label key={field} className="text-ui-sm">
            {t(field)}
            <Input
              type="number"
              value={plan[field]}
              onChange={(e) => update({ [field]: Number(e.target.value) })}
              data-testid={`parallel-${field}`}
            />
          </label>
        ))}
      </div>
      <ol className="grid gap-3 lg:grid-cols-2" aria-label={t("fork")}>
        {plan.branches.map((branch, index) => {
          const edit = (patch: Partial<typeof branch>) =>
            update({
              branches: plan.branches.map((b, i) => (i === index ? { ...b, ...patch } : b)),
            });
          return (
            <li key={branch.id} className="space-y-2 rounded-xl border border-border bg-card p-3">
              <label className="flex items-center gap-2 text-ui-sm">
                <Checkbox
                  checked={branch.selected}
                  onCheckedChange={(v) => edit({ selected: v === true })}
                  data-testid={`parallel-${branch.id}-selected`}
                />
                {branch.id} · {t("selected")}
              </label>
              <Input
                aria-label={t("branchName")}
                value={branch.name}
                onChange={(e) => edit({ name: e.target.value })}
              />
              <label className="block text-ui-sm">
                {t("instructions")}
                <Textarea
                  value={branch.instructions}
                  onChange={(e) => edit({ instructions: e.target.value })}
                  data-testid={`parallel-${branch.id}-instructions`}
                />
              </label>
              {(["files", "additions"] as const).map((field) => (
                <label key={field} className="block text-ui-sm">
                  {t(field)}
                  <Textarea
                    value={branch[field].join("\n")}
                    onChange={(e) =>
                      edit({ [field]: e.target.value ? e.target.value.split("\n") : [] })
                    }
                    onBlur={(e) => edit({ [field]: e.target.value.split("\n").filter(Boolean) })}
                    data-testid={`parallel-${branch.id}-${field}`}
                  />
                </label>
              ))}
            </li>
          );
        })}
      </ol>
      <div className="grid gap-3 sm:grid-cols-2">
        {(["buildRecipeId", "testRecipeId"] as const).map((field) => (
          <label key={field} className="block text-ui-sm">
            {t(field)}
            <Input
              value={plan[field]}
              onChange={(e) => update({ [field]: e.target.value })}
              data-testid={`parallel-${field}`}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
