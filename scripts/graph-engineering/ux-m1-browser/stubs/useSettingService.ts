// LABELLED STUB (UX-M1 harness). Replaces "@/hooks/useSettingService.js".
//
// GraphEditor only reads one general setting (whether to show a settings shortcut). The real hook
// needs the bots, broadcast, settings and agent services. Everything else the module exports is kept.
export * from "../../../../packages/ui/src/hooks/useSettingService.ts";

export function useSettings() {
  return { settings: null, loading: false, error: null, refresh: async () => undefined } as never;
}
