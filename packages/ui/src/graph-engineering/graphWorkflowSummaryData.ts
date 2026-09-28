import type { GraphDefinition } from "@zcode/services";
import { graphRequestText } from "./graphRequestText.js";

export function graphWorkflowSummaryData(definition: GraphDefinition) {
  const start = definition.nodes.find((node) => node.type === "start");
  const request =
    definition.version === undefined
      ? definition.instructions
      : start && "request" in start
        ? start.request
        : "";
  const template = definition.version === undefined ? undefined : definition.template;
  // 请求不是上下文附件；只投影已显式绑定的文档、指令和技能，避免把任务文本误标成 Context。
  const references = (template?.references ?? []).flatMap((reference) => {
    const path = template?.bindings.references[reference.id]?.trim();
    return path ? [{ id: reference.id, kind: reference.kind, path }] : [];
  });
  return { request: graphRequestText(definition, request), references };
}
