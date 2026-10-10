import { Input } from "@/components/ui/input.js";
import { Textarea } from "@/components/ui/textarea.js";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

export function useGraphSetupText() {
  const { intl } = useZCodeIntl();
  return (key: string) => intl.formatMessage({ id: `graph.setup.${key}` });
}
export function GraphSetupField({
  name,
  value,
  onChange,
  disabled,
  testId,
  numeric = false,
  optional = false,
}: {
  name: string;
  value: unknown;
  onChange(value: string | number | undefined): void;
  disabled?: boolean;
  testId?: string;
  numeric?: boolean;
  optional?: boolean;
}) {
  const t = useGraphSetupText();
  return (
    <label className="block space-y-1 text-ui-sm">
      <span>{t(name)}</span>
      <Input
        data-testid={testId}
        disabled={disabled}
        type={numeric ? "number" : "text"}
        value={
          value === undefined || (typeof value === "number" && Number.isNaN(value))
            ? ""
            : String(value)
        }
        onChange={(event) => {
          const value = event.target.value;
          onChange(
            !value && optional ? undefined : numeric && value !== "" ? Number(value) : value,
          );
        }}
      />
    </label>
  );
}
export function GraphSetupList({
  name,
  values,
  onChange,
  disabled,
  testId,
  max = 32,
}: {
  name: string;
  values: string[];
  onChange(values: string[]): void;
  disabled?: boolean;
  testId: string;
  max?: number;
}) {
  const t = useGraphSetupText();
  if (name === "sourcePaths" && values.length > 100)
    return (
      <label className="block space-y-1 text-ui-sm">
        <span>
          {t(name)} ({values.length})
        </span>
        <Textarea
          rows={8}
          disabled={disabled}
          data-testid={testId}
          value={values.join("\n")}
          onChange={(event) => onChange(event.target.value.split("\n"))}
        />
      </label>
    );
  return (
    <fieldset className="space-y-2 text-ui-sm" disabled={disabled}>
      <legend>{t(name)}</legend>
      {values.map((value, index) => (
        <div key={index} className="flex items-center gap-2">
          {name === "args" ? (
            <Textarea
              rows={value.includes("\n") ? 2 : 1}
              aria-label={`${t(name)} ${index + 1}`}
              data-testid={`${testId}-${index}`}
              value={value}
              onChange={(event) =>
                onChange(
                  values.map((entry, position) =>
                    position === index ? event.target.value : entry,
                  ),
                )
              }
            />
          ) : (
            <Input
              aria-label={`${t(name)} ${index + 1}`}
              data-testid={`${testId}-${index}`}
              value={value}
              onChange={(event) =>
                onChange(
                  values.map((entry, position) =>
                    position === index ? event.target.value : entry,
                  ),
                )
              }
            />
          )}
          <Button
            size="sm"
            variant="ghost"
            aria-label={`${t("remove")} ${index + 1}`}
            onClick={() => onChange(values.filter((_, position) => position !== index))}
          >
            {t("remove")}
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        disabled={values.length >= max}
        data-testid={`${testId}-add`}
        onClick={() => onChange([...values, ""])}
      >
        {t("add")}
      </Button>
    </fieldset>
  );
}
