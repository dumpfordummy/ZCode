import { useEffect, useRef } from "react";
import { useGraphEngineeringViewStore } from "@/store/graphEngineeringViewStore.js";

/**
 * UX-M1.3：把键盘焦点交给「查看运行」这次导航的目标（运行摘要）。
 * 焦点请求由发起导航的那次 select 写入 view store；运行摘要与请求在同一次提交里出现，
 * 所以这里在提交后一次性消费并清除，不依赖定时器。表单一侧（异步挂载）由 GraphTemplateBindings 自己消费。
 */
export function useGraphRunFocus(workspaceKey: string, runSelected: boolean) {
  const root = useRef<HTMLDivElement>(null);
  const request = useGraphEngineeringViewStore((state) => state.selections[workspaceKey]?.focus);
  const select = useGraphEngineeringViewStore((state) => state.select);
  useEffect(() => {
    if (request !== "run" || !runSelected) return;
    root.current?.querySelector<HTMLElement>('[data-testid="graph-run-summary"]')?.focus();
    select(workspaceKey, { focus: undefined });
  }, [request, runSelected, select, workspaceKey]);
  return root;
}
