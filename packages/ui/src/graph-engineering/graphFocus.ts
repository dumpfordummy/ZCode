// 全局样式清除了默认焦点环；Graph 使用已有主题边框和底色标记键盘焦点，不改全局控件策略。
export const graphFocusClass =
  "[&_button:focus-visible]:border-brand [&_button:focus-visible]:bg-accent [&_summary:focus-visible]:bg-accent [&_summary:focus-visible]:text-foreground [&_input:focus-visible]:border-brand [&_textarea:focus-visible]:border-brand [&_[role=combobox]:focus-visible]:border-brand";
