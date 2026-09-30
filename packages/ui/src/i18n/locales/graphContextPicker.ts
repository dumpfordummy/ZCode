/**
 * Context picker copy (spec: docs/graph-engineering/ux-audit/CONTEXT_PICKER_SPEC.md).
 *
 * 只包含 UI 自有标签。引用路径、技能 id、Host 返回的 issues / unknowns / 错误一律原样显示，
 * 不在这里翻译或改写。Host 已有的交付状态文案复用 graph.editor.*（nativeInstructions、explicitRead、
 * nativeSkill、unavailable、loading、nativePicker、advanced），避免同一事实出现两套说法。
 */
const messages: Record<string, [string, string]> = {
  help: [
    "Documents, instructions and skills the agents read in addition to the request.",
    "智能体在请求之外读取的文档、指令和技能。",
  ],
  listLabel: ["Selected context", "已选上下文"],
  summarySet: ["{selected} of {slots} context slots set", "已设置 {selected}/{slots} 个上下文位"],
  summaryNone: ["No context selected", "尚未选择上下文"],
  summaryMissing: ["{count} required missing", "缺少 {count} 项必填"],
  add: ["Add context", "添加上下文"],
  choose: ["Choose…", "选择…"],
  replace: ["Replace", "替换"],
  replaceLabel: ["Replace {role}: {value}", "替换 {role}：{value}"],
  remove: ["Remove", "移除"],
  removeLabel: ["Remove {role}: {value}", "移除 {role}：{value}"],
  required: ["Required", "必填"],
  requiredMissing: ["{role} is required. Nothing is selected.", "“{role}”为必填项，尚未选择。"],
  usedBy: ["Used by {nodes}", "供 {nodes} 使用"],
  statusNotChecked: [
    "Not checked yet. It is checked when you review the run.",
    "尚未检查，评审运行时才会检查。",
  ],
  skillUnknown: ["Unknown: not in the loaded skill list", "未知：不在已加载的技能列表中"],
  skillCatalogMissing: ["Skill list not loaded", "技能列表未加载"],
  orphan: [
    "Not accepted by this workflow version. Remove it before reviewing.",
    "此工作流版本不接受该引用，评审前请移除。",
  ],
  pickerTitle: ["Add context", "添加上下文"],
  slot: ["Add to", "添加到"],
  slotCurrent: ["currently {value}", "当前为 {value}"],
  replaceNotice: [
    "Selecting a result replaces {value} in this slot.",
    "选择结果会替换此位置的 {value}。",
  ],
  searchFiles: ["Find a workspace file", "查找工作区文件"],
  searchSkills: ["Find a skill", "查找技能"],
  searchHint: [
    "Type to search. Use ↑ ↓ to move, Enter to select, Esc to close.",
    "输入以搜索。用 ↑ ↓ 移动，Enter 选择，Esc 关闭。",
  ],
  results: ["Results", "结果"],
  resultCount: ["{count} results", "{count} 个结果"],
  noMatches: ["No matches.", "没有匹配项。"],
  typeToSearch: ["Type to search workspace files.", "输入以搜索工作区文件。"],
  groupInstruction: ["Native instructions", "原生指令"],
  groupFile: ["Workspace files", "工作区文件"],
  groupSkill: ["Skills", "技能"],
  catalogLoading: ["Reading the skill and instruction list…", "正在读取技能与指令列表…"],
  catalogUnknown: ["The skill and instruction list is unknown.", "技能与指令列表未知。"],
  catalogError: ["The skill and instruction list could not be read.", "无法读取技能与指令列表。"],
  retry: ["Try again", "重试"],
  unsupported: ["Context search is unavailable for this workspace.", "此工作区不支持上下文搜索。"],
  checking: ["Checking {value}…", "正在检查 {value}…"],
  announceAdded: ["{value} selected for {role}.", "已为“{role}”选择 {value}。"],
  announceReplaced: [
    "{value} replaced {previous} for {role}.",
    "“{role}”的 {previous} 已替换为 {value}。",
  ],
  announceRemoved: ["Removed {value} from {role}.", "已从“{role}”移除 {value}。"],
  announceRemovedRequired: [
    "Removed {value}. {role} is required and is now empty.",
    "已移除 {value}。“{role}”为必填项，现在为空。",
  ],
  advancedHelp: [
    "Raw values are stored exactly as typed and are checked when you review the run. The chips above show every value, including ones the picker cannot validate.",
    "原始值按输入原样保存，评审运行时才会检查。上方的标签显示所有取值，包括选择器无法验证的值。",
  ],
};
export const graphContextPickerEn = Object.fromEntries(
  Object.entries(messages).map(([key, value]) => [`graph.context.${key}`, value[0]]),
);
export const graphContextPickerZh = Object.fromEntries(
  Object.entries(messages).map(([key, value]) => [`graph.context.${key}`, value[1]]),
);
/** Message keys the components read, so tests can prove every one exists in both locales. */
export const GRAPH_CONTEXT_MESSAGE_KEYS = Object.keys(messages);
