import { useZCodeIntl } from "@/i18n/IntlProvider.js";

/** UX-M4 UI-owned labels (`graph.m4.*`). Stored ids, user text, Host diagnostics and evidence never pass through here. */
export function useGraphM4Text() {
  const { intl } = useZCodeIntl();
  return (key: string, values?: Record<string, string | number>) =>
    intl.formatMessage({ id: `graph.m4.${key}` }, values);
}
