import type { GraphSequentialDefinition } from "@zcode/services";
import { GraphRoutingEditor } from "./GraphRoutingEditor.js";
import { GraphRepeatRequest } from "./GraphRepeatRequest.js";
import { GraphDisclosureStack } from "./GraphDisclosure.js";

/**
 * GraphDesignSections —— v5 顺序设计视图的结构化区块容器。GraphEditor 已接近行数上限，
 * 将路由编辑与 New request 表单收拢到这里，保持各自单一职责并让 GraphEditor 维持在
 * max-lines 之内。两个子区块都只在 version 5 设计视图渲染。
 */
export function GraphDesignSections({
  definition,
  disabled,
  onChange,
  workspaceKey,
}: {
  definition: GraphSequentialDefinition;
  disabled: boolean;
  onChange(definition: GraphSequentialDefinition): void;
  workspaceKey: string;
}) {
  return (
    <GraphDisclosureStack>
      <GraphRoutingEditor
        definition={definition}
        disabled={disabled}
        onChange={onChange}
        workspaceKey={workspaceKey}
      />
      <GraphRepeatRequest definition={definition} disabled={disabled} onChange={onChange} />
    </GraphDisclosureStack>
  );
}
