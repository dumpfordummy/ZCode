import { useZCodeIntl } from "@/i18n/IntlProvider.js";

/**
 * Display names of built-in workflows, keyed by template / parameter / reference / node id.
 * The Host supplies English text; this map only changes what is displayed in Simplified Chinese.
 * Identities, digests and saved definitions are never translated, and anything not listed falls
 * back to the Host text (so custom and future templates are shown as authored).
 */
const zh = {
  entry: {
    generic: "顺序工程",
    "agent-assisted": "智能体辅助任务",
    bugfix: "有界验证缺陷修复",
    slot: "顺序老虎机改进",
  },
  description: {
    generic:
      "分析明确的请求、实现它、执行由你选定的构建/测试检查、审阅当前证据，并要求最终人工批准。",
    "agent-assisted":
      "通过原生会话分析、实现并审阅，然后要求最终人工批准。验证：智能体主导的审阅；不包含已配置的测试证据。不需要项目检查。",
    bugfix:
      "一个有限的修复区域、当前原生机器证据、全新的修复会话和必需的最终批准。运行前请绑定真实的源路径与构建/测试检查。",
    slot: "只改进明确选定、由源定义的行为。需要解释批准、共享状态审阅、有针对性的真实测试和最终审阅；不做认证，也不推断游戏数学。",
  },
  parameter: {
    request: "明确的运行请求",
    targetEngine: "目标引擎",
    criteria: "与源关联的测试标准",
    normal: "包含 normal",
    free: "包含 free",
    bonus: "包含 bonus",
    respin: "包含 respin",
    mathTarget: "已批准的数学/RTP 目标（可选）",
    samplingRule: "抽样与验收规则（可选）",
  },
  reference: {
    instructions: "补充项目指引",
    skill: "现有原生技能",
    gameDoc: "权威 GameDoc",
    math: "权威数学参考",
    source: "源参考文档",
  },
  node: {
    analyze: "分析",
    implement: "实现",
    build: "构建",
    test: "按配置的标准测试",
    reviewer: "审阅当前验证",
    "final-gate": "最终人工审阅",
    repair: "根据当前证据修复",
  },
} as const;

type Kind = keyof typeof zh;

/** Returns a localiser bound to the active UI language. */
export function useGraphTemplateText() {
  const { locale } = useZCodeIntl();
  const pick = (kind: Kind, id: string, fallback: string): string => {
    if (locale !== "zh-CN") return fallback;
    const table = zh[kind] as Record<string, string>;
    return table[id] ?? fallback;
  };
  return {
    entry: (id: string, fallback: string) => pick("entry", id, fallback),
    description: (id: string, fallback: string) => pick("description", id, fallback),
    parameter: (id: string, fallback: string) => pick("parameter", id, fallback),
    reference: (id: string, fallback: string) => pick("reference", id, fallback),
    node: (id: string, fallback: string) => pick("node", id, fallback),
    kind: (kind: "document" | "instruction" | "skill") =>
      locale === "zh-CN" ? { document: "文档", instruction: "指引", skill: "技能" }[kind] : kind,
  };
}
