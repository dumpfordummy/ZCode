import type { ComponentProps } from "react";
import { GraphQuickContinuation } from "./GraphQuickContinuation.js";
import { GraphProjectInspection } from "./GraphProjectInspection.js";

/** Keep unresolved guidance and its explicit inspection action together. */
export function GraphQuickUnresolved(
  props: ComponentProps<typeof GraphQuickContinuation> &
    Pick<
      ComponentProps<typeof GraphProjectInspection>,
      "setup" | "disabled" | "onOpenConversation"
    >,
) {
  return (
    <>
      <GraphQuickContinuation {...props} />
      {props.build.toLowerCase().endsWith(".csproj") ? (
        <GraphProjectInspection
          setup={props.setup}
          project={props.build}
          configuration={props.configuration}
          disabled={props.disabled}
          onOpenConversation={props.onOpenConversation}
        />
      ) : null}
    </>
  );
}
