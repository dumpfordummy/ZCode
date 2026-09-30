import { useZCodeIntl } from "@/i18n/IntlProvider.js";

/** UX-M3 UI-owned labels (`graph.m3.*`). Workflow names and descriptions, user text, ids, digests and Host diagnostics never pass through here. */
export function useGraphM3Text() {
  const { intl } = useZCodeIntl();
  return (key: string, values?: Record<string, string | number>) =>
    intl.formatMessage({ id: `graph.m3.${key}` }, values);
}
