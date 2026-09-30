import { useZCodeIntl } from "@/i18n/IntlProvider.js";

/** UX-M1 UI-owned labels (`graph.m1.*`). Stored ids, user text, Host diagnostics and evidence never pass through here. */
export function useGraphM1Text() {
  const { intl } = useZCodeIntl();
  return (key: string, values?: Record<string, string | number>) =>
    intl.formatMessage({ id: `graph.m1.${key}` }, values);
}
