import { useEffect, useState } from "react";
import type { GraphSequentialDefinition } from "@zcode/services";
import { applyGraphRunRequest } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { Textarea } from "@/components/ui/textarea.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

// 提取当前设计的请求文本：固定实例取 template.parameters.request（仅 string）；
// 非固定顺序定义取唯一 Start 节点的 request。缺失/非 string/Start 数量不为 1 返回 undefined，
// 表示当前设计不支持 New request 表单，需走 Advanced JSON 路径。
function currentRequest(definition: GraphSequentialDefinition): string | undefined {
  if (definition.template) {
    const value = definition.template.parameters.request;
    return typeof value === "string" ? value : undefined;
  }
  const starts = definition.nodes.filter((node) => node.type === "start");
  if (starts.length !== 1) return undefined;
  const start = starts[0];
  return start && start.type === "start" ? start.request : undefined;
}

/**
 * GraphRepeatRequest —— 在当前 Design 上显式应用新请求。复用与初始实例化相同的 request
 * Textarea 渲染；applyGraphRunRequest 是纯变换，仅更新固定实例的 string parameters.request
 * 或非固定定义的 Start 文本，克隆 draft 不带 revision/pin/本地绑定变更，不执行、不覆盖运行记录。
 * 固定实例缺少 string request 参数时提示 Advanced JSON 路径，不发明未声明参数。
 */
export function GraphRepeatRequest({
  definition,
  disabled,
  onChange,
}: {
  definition: GraphSequentialDefinition;
  disabled: boolean;
  onChange(definition: GraphSequentialDefinition): void;
}) {
  const { intl } = useZCodeIntl();
  const t = (key: string) => intl.formatMessage({ id: `graph.z6.${key}` });
  const initial = currentRequest(definition);
  const supported = initial !== undefined;
  const [request, setRequest] = useState(initial ?? "");
  const [error, setError] = useState("");
  // 切换到不同定义（实例化/替换/应用后）时，把草稿与错误重置回当前规范请求。
  useEffect(() => {
    setRequest(initial ?? "");
    setError("");
  }, [initial]);
  const apply = () => {
    setError("");
    try {
      onChange(applyGraphRunRequest(definition, request));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  return (
    <details className="space-y-2 text-ui-sm" data-testid="graph-repeat-request">
      <summary className="cursor-pointer">{t("repeatRequest")}</summary>
      <p className="text-foreground-subtle">{t("repeatRequestHelp")}</p>
      {supported ? (
        <>
          <Textarea
            rows={4}
            data-testid="graph-repeat-request-input"
            disabled={disabled}
            value={request}
            onChange={(event) => setRequest(event.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            data-testid="graph-repeat-request-apply"
            onClick={apply}
          >
            {t("applyRequest")}
          </Button>
        </>
      ) : (
        <p className="text-foreground-subtle">{t("requestAdvancedOnly")}</p>
      )}
      {error ? (
        <p role="alert" className="text-destructive" data-testid="graph-repeat-request-error">
          {error}
        </p>
      ) : null}
    </details>
  );
}
