/** Approve one visible native permission in a synthetic acceptance scenario. */
export async function approveNativePermissionOnce(window) {
  const allow = window.getByRole("option", { name: "Allow", exact: true });
  await allow.waitFor({ timeout: 45000 });
  const original = await allow.elementHandle();
  if (!original) throw new Error("The expected native permission is no longer present.");
  try {
    await allow.press("Enter");
    // 原因：响应发出后旧 Allow 仍可见，不能把它当作下一条 Bash 权限再次点击。
    // V4InteractionDialogs 按 interactionId 重建；等待原元素移除，以实际 ACK 边界同步。
    await window.waitForFunction((button) => !button.isConnected, original, { timeout: 45000 });
  } finally {
    await original.dispose();
  }
}
