import { applyGraphRunRequest, type GraphDefinition } from "@zcode/services";

export function graphRequestText(definition: GraphDefinition, input: string): string {
  if (definition.version === undefined || !definition.template) return input;
  const request = definition.template.parameters.request;
  if (typeof request !== "string") return input;
  try {
    const canonical = applyGraphRunRequest(definition, request).nodes.find(
      (node) => node.type === "start",
    );
    // 仅展开与已捕获输入完全一致的参数封装；Advanced 自定义 Start 文本仍显示原文，不能取旧参数冒充请求。
    return canonical?.type === "start" && canonical.request === input ? request : input;
  } catch {
    return input;
  }
}
