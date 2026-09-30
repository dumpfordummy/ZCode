import { useZCodeIntl } from "@/i18n/IntlProvider.js";

/** UI-owned Context picker labels (`graph.context.*`). Stored ids, paths and Host text are never passed through here. */
export function useGraphContextText() {
  const { intl } = useZCodeIntl();
  return (key: string, values?: Record<string, string | number>) =>
    intl.formatMessage({ id: `graph.context.${key}` }, values);
}
