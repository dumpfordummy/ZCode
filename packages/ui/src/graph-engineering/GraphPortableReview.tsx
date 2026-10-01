import { Checkbox } from "@/components/ui/checkbox.js";
import { Textarea } from "@/components/ui/textarea.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useGraphM3Text } from "./GraphM3Text.js";
import type { PortableFlow } from "./usePortableFlow.js";

/**
 * The review step every Share task uses: what the preview found (errors, diagnostics, unresolved
 * bindings), the complete portable JSON, and the existing "I reviewed the entire portable JSON" gate.
 * `editable` is only the manual-JSON route under Advanced; everywhere else the JSON is read-only.
 */
export function GraphPortableReview({
  prefix,
  flow,
  disabled,
  editable = false,
}: {
  prefix: string;
  flow: PortableFlow;
  disabled: boolean;
  editable?: boolean;
}) {
  const { intl } = useZCodeIntl();
  const t = (key: string) => intl.formatMessage({ id: `graph.z6.${key}` });
  const m3 = useGraphM3Text();
  const { preview } = flow;
  return (
    <div className="space-y-2">
      {editable || flow.json ? (
        <label className="block space-y-1">
          <span>{editable ? t("portableJson") : m3("jsonReadOnly")}</span>
          <Textarea
            rows={10}
            value={flow.json}
            readOnly={!editable}
            disabled={disabled && editable}
            className="field-sizing-fixed w-full min-w-0 border border-border"
            data-testid={`${prefix}-json`}
            onChange={(event) => {
              flow.setJson(event.target.value);
              flow.invalidate();
            }}
          />
        </label>
      ) : null}
      {preview ? (
        <div className="space-y-2" data-testid={`${prefix}-preview-result`}>
          {preview.errors.map((error, index) => (
            <p role="alert" className="text-destructive" key={`error-${index}`}>
              {error}
            </p>
          ))}
          {preview.diagnostics.map((diagnostic, index) => (
            <p className="text-foreground-subtle" key={`diagnostic-${index}`}>
              {diagnostic}
            </p>
          ))}
          {preview.unresolved.length ? (
            <p className="text-warning">
              {t("unresolved")}: {preview.unresolved.join(", ")}
            </p>
          ) : null}
          {preview.template && !preview.errors.length ? (
            <label className="flex items-start gap-2">
              <Checkbox
                data-testid={`${prefix}-reviewed`}
                checked={flow.reviewed}
                disabled={disabled}
                onCheckedChange={(value) => flow.setReviewed(value === true)}
              />
              {t("reviewPortable")}
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
