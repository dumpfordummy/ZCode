// 历史原生驱动迁移用的导航辅助：UX 审计把原始检查 JSON 收进了 Checks 页的
// “Advanced project-check configuration”折叠区；驱动仍然操作同一批 test id，但必须先展开它。
// 不改变任何断言，只补上用户实际需要的展开步骤。
export async function openRawChecks(window) {
  const details = window.getByTestId("graph-load-recipes").locator("xpath=ancestor::details[1]");
  if ((await details.getAttribute("open")) === null)
    await details.locator(":scope > summary").click();
}
