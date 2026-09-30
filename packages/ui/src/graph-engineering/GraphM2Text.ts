import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { graphTimestamp } from "./graphTimestamp.js";

/** UX-M2 UI-owned labels (`graph.m2.*`). Stored ids, user text, check names, Host diagnostics and evidence never pass through here. */
export function useGraphM2Text() {
  const { intl } = useZCodeIntl();
  return (key: string, values?: Record<string, string | number>) =>
    intl.formatMessage({ id: `graph.m2.${key}` }, values);
}

/** UX-M2.1: a Graph timestamp in the app locale, or "Time not recorded" when the stored value is not a valid time. */
export function useGraphTime() {
  const { intl, locale } = useZCodeIntl();
  return (value: unknown) =>
    graphTimestamp(value, locale) ?? intl.formatMessage({ id: "graph.m2.timeNotRecorded" });
}
