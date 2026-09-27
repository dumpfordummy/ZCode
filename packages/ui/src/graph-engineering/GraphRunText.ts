import { useZCodeIntl } from "@/i18n/IntlProvider.js";

export function useGraphRunText() {
  const { intl } = useZCodeIntl();
  return (key: string, values?: Record<string, string | number>) =>
    intl.formatMessage({ id: `graph.run.${key}` }, values);
}
