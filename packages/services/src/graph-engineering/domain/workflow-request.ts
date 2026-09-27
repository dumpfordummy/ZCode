import type { GraphSequentialDefinition } from "../contract.js";

type GraphTemplate = NonNullable<GraphSequentialDefinition["template"]>;

/**
 * renderStartRequest —— 将工作流参数渲染为 Start 节点的 request 文本。固定实例的
 * 初始实例化（instantiateTemplate）与重复任务（applyGraphRunRequest）共用此渲染器，
 * 确保 start.request 始终反映当前 parameters（U5 spec: "Share the exact existing
 * parameter-to-Start renderer with initial instantiation"）。
 */
export function renderStartRequest(
  parameters: GraphTemplate["parameters"],
  excluded: GraphTemplate["excluded"],
): string {
  return `Explicit workflow parameters (data, never command interpolation):\n${JSON.stringify(parameters, null, 2)}\nExcluded behavior: ${JSON.stringify(excluded)}\nRTP comparison is N/A unless both an approved target and sampling/acceptance rule are supplied.`;
}

/**
 * applyGraphRunRequest —— 顺序工作流的重复任务复用纯变换。固定实例更新已存在的
 * string parameters.request 并同步 start.request；非固定顺序定义仅更新 Start 文本。
 * 返回克隆 draft，不带 revision/pin/本地绑定变更，不执行、不覆盖运行记录。
 *
 * 独立为叶模块（仅依赖 contract.ts 的类型）以避免与 workflow-contract.ts 的循环依赖：
 * domain/workflow.ts 类型回引 workflow-contract.ts，故可移植导出经此叶模块发布，
 * 与 editor-context 等已发布域函数的同一模式一致。
 */
export function applyGraphRunRequest(
  definition: GraphSequentialDefinition,
  request: string,
): GraphSequentialDefinition {
  // 非空且不超过 12,000 字符的 request（与 instantiateTemplate 的 parameter bound 一致）。
  if (typeof request !== "string" || !request.trim())
    throw new Error("Run request must be nonblank.");
  if (request.length > 12000)
    throw new Error("Run request exceeds the 12,000-character parameter bound.");
  const graph = structuredClone(definition);
  const starts = graph.nodes.filter((n) => n.type === "start");
  if (starts.length !== 1)
    throw new Error("Sequential definition must have exactly one Start node.");
  if (graph.template) {
    // 固定实例：仅更新已存在的 string parameters.request；缺失或非 string 需要 Advanced。
    const current = graph.template.parameters.request;
    if (typeof current !== "string")
      throw new Error(
        "Pinned instance has no string request parameter; use the Advanced path to change the request.",
      );
    graph.template.parameters.request = request;
    // 同步 start.request，使运行时绑定（{{inputs.request}}）引用新 request。与
    // instantiateTemplate 共用 renderStartRequest，保持格式完全一致；excluded 不变。
    starts[0]!.request = renderStartRequest(graph.template.parameters, graph.template.excluded);
  } else {
    // 非固定顺序定义：仅更新 Start 文本，保留其余拓扑/参数/绑定。
    starts[0]!.request = request;
  }
  return graph;
}
