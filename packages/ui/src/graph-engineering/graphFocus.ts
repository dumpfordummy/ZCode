// 全局样式清除了默认焦点环；Graph 使用已有主题边框和底色标记键盘焦点，不改全局控件策略。
//
// 填充型按钮（default / destructive / warning）自带前景/背景配对：把底色换成 accent 会让
// text-primary-foreground 落在不兼容的底色上（暗色 1.5:1、亮色 1.2:1），所以它们保持自己的填充色
// （并固定为满强度，避免 hover 的 /80 透明度在焦点上再削弱对比），键盘焦点改用 foreground 色边框标记。
// 其余按钮（outline / ghost / secondary / link / 无 data-variant 的原生 button）保持原有 accent 底色 + brand 边框。
// 每个类名都以完整字面量出现，保证 Tailwind 扫描得到。
export const graphFocusClass = [
  "[&_button:not([data-variant=default],[data-variant=destructive],[data-variant=warning]):focus-visible]:border-brand",
  "[&_button:not([data-variant=default],[data-variant=destructive],[data-variant=warning]):focus-visible]:bg-accent",
  "[&_button[data-variant=default]:focus-visible]:border-foreground",
  "[&_button[data-variant=default]:focus-visible]:bg-primary",
  "[&_button[data-variant=destructive]:focus-visible]:border-foreground",
  "[&_button[data-variant=destructive]:focus-visible]:bg-destructive",
  "[&_button[data-variant=warning]:focus-visible]:border-foreground",
  "[&_button[data-variant=warning]:focus-visible]:bg-warning",
  "[&_summary:focus-visible]:bg-accent",
  "[&_summary:focus-visible]:text-foreground",
  "[&_input:focus-visible]:border-brand",
  "[&_textarea:focus-visible]:border-brand",
  "[&_[role=combobox]:focus-visible]:border-brand",
  "[&_[tabindex='0']:focus-visible]:bg-accent",
  "[&_a:focus-visible]:underline",
].join(" ");
