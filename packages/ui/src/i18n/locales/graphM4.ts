/**
 * UX-M4 copy (spec: docs/graph-engineering/ux-audit/UX_M4_SPEC.md).
 *
 * 只包含 UI 自有的标签与解释。工作流名称与描述（Host 提供）、用户输入、存储的 id、摘要与 Host 诊断保持原文。
 */
const messages: Record<string, [string, string]> = {
  quickTitle: ["Project checks", "项目检查"],
  quickDetected: [".NET project detected", "已检测到 .NET 项目"],
  quickScan: ["Detect .NET project", "检测 .NET 项目"],
  quickHelp: [
    "Choose what to build and which tests to run. Detection only reads project files.",
    "选择构建目标与测试。检测只读取项目文件。",
  ],
  quickBuild: ["Build", "构建"],
  quickTests: ["Tests · selection order is run order", "测试 · 按选择顺序运行"],
  quickChoose: ["Choose a target", "选择目标"],
  quickChooseTargets: [
    "Select a Build target and at least one Test scope to continue.",
    "请选择构建目标和至少一个测试范围。",
  ],
  quickAmbiguous: [
    "Several targets were found. Choose the Build target and Test scopes you want.",
    "发现多个目标。请选择构建目标和测试范围。",
  ],
  quickUnavailable: [
    "Quick setup unavailable for this selection. Use Advanced to review the details.",
    "此选择无法使用快速设置。请在高级设置中审阅详情。",
  ],
  quickNoRunner: [
    "No supported VSTest scope with a known assembly path was established.",
    "未确定具有已知程序集路径的受支持 VSTest 范围。",
  ],
  quickSave: ["Save checks", "保存检查"],
  quickSaveRun: ["Save and run checks", "保存并运行检查"],
  quickRun: ["Run saved checks", "运行已保存检查"],
  quickAdvanced: ["Advanced / custom checks", "高级 / 自定义检查"],
  quickCustom: [
    "Saved configuration is retained. Edit it in Advanced, or explicitly add new checks.",
    "保留已保存的配置。可在高级设置中编辑，或明确添加新检查。",
  ],
  quickAdd: ["Add .NET checks", "添加 .NET 检查"],
  quickCancel: ["Cancel", "取消"],
  quickDefaults: [
    "Debug · Saving does not run checks. Running first opens command and environment review, then asks for native Tool permission.",
    "Debug · 保存不会运行检查。运行前会打开命令与环境审阅，随后请求原生工具权限。",
  ],
  quickSaved: ["Saved · not run by this save", "已保存 · 此次保存未运行检查"],
  quickSetup: ["Set up project checks", "设置项目检查"],
  quickMapped: ["Build relationship: {name}", "关联构建：{name}"],
  // 运行详情的单层标签：次要信息一键可达，决定所需的内容始终在横幅或操作栏里。
  runTabs: ["Run details", "运行详情"],
  tabSteps: ["Steps", "步骤"],
  tabRequest: ["Request and result", "请求与结果"],
  tabEvidence: ["Evidence", "证据"],
  tabTechnical: ["Technical details", "技术详情"],
  showHistory: ["Show run history", "显示运行历史"],
  hideHistory: ["Hide run history", "收起运行历史"],
  stepDetails: ["Step details", "步骤详情"],
  closeStepDetails: ["Close step details", "收起步骤详情"],
  fitGraph: ["Fit graph", "适应全图"],
  focusStep: ["Focus selected step", "定位所选步骤"],
  capturedRun: ["Captured · Read only", "已捕获 · 只读"],
  workflowDetails: ["Workflow details", "工作流详情"],
  resultDetails: ["Result details", "结果详情"],
  // 资料库对话框的页脚：载入设计这一操作自己的阻止原因，不使用新建运行的“审阅”措辞。
  libraryFieldsNeedUse: [
    "{count} required fields need configuration in Use",
    "“使用”标签中有 {count} 项必填内容需要配置",
  ],
  libraryOneFieldNeedsUse: [
    "1 required field needs configuration in Use",
    "“使用”标签中有 1 项必填内容需要配置",
  ],
  libraryLoadBlockedByRun: [
    "Load into design is unavailable while a run owns this workspace.",
    "有运行占用此工作区时，无法载入设计。",
  ],
  openUse: ["Open Use", "打开“使用”"],
  // 正在查看的运行就是等待你的那个：条带只是指路，操作在该运行的横幅里。
  needsYouHere: [
    "This run is waiting for you. Its banner below has the action.",
    "此运行正在等你处理，操作在下方它的横幅里。",
  ],
  // 一次 Test 失败后运行在到达人工批准之前停止：执行事实按字面写。
  executionTestFailed: ["Stopped after Test failure", "测试失败后停止"],
  // 检查器里的披露区：已知结构按“标签/值”呈现，原始记录放在其下的“原始记录”里，内容逐字节不变。
  rawRecord: ["Raw record (JSON)", "原始记录（JSON）"],
  iterationLabel: ["Iteration {n}", "第 {n} 轮迭代"],
  iterationsMeta: ["{count} iterations recorded", "已记录 {count} 轮迭代"],
  iterationsMetaOne: ["1 iteration recorded", "已记录 1 轮迭代"],
  checkpointsMetaOne: ["1 checkpoint recorded", "已记录 1 个检查点"],
  checkpointsMeta: ["{count} checkpoints recorded", "已记录 {count} 个检查点"],
  noneRecorded: ["None recorded", "没有记录"],
  stepsVisited: ["Steps visited", "已访问的步骤"],
  attemptsCount: ["Attempts", "尝试"],
  feedbackText: ["Feedback to the next attempt", "给下一次尝试的反馈"],
  fingerprint: ["Failure fingerprint", "失败指纹"],
  createdAt: ["Created", "创建时间"],
  checkpointId: ["Checkpoint", "检查点"],
  nextStep: ["Next step", "下一步"],
  checkpointState: ["State", "状态"],
  checkpointWaiting: ["Waiting for explicit Continue", "等待明确继续"],
  checkpointConsumed: ["Consumed {time}", "已于 {time} 使用"],
  checkpointRecorded: ["Recorded", "已记录"],
  decisionId: ["Decision", "决定"],
  digestLabel: ["Digest", "摘要"],
  requestForDesign: ["Request for this design", "此设计的请求"],
  // 新建运行：就绪只表示可以进入审阅，不表示检查通过。
  readyToReview: [
    "Ready to review. Nothing starts until you confirm.",
    "可以审阅。你确认之前不会开始任何执行。",
  ],
};
export const graphM4En = Object.fromEntries(
  Object.entries(messages).map(([key, value]) => [`graph.m4.${key}`, value[0]]),
);
export const graphM4Zh = Object.fromEntries(
  Object.entries(messages).map(([key, value]) => [`graph.m4.${key}`, value[1]]),
);
/** Message keys, so tests can prove every one exists in both locales and every key the code reads is defined. */
export const GRAPH_M4_MESSAGE_KEYS = Object.keys(messages);
