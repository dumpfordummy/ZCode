import { GraphWebProfile } from "./GraphWebProfile.js";
import { useState, useEffect, type ComponentProps } from "react";
import { GraphQuickContinuation } from "./GraphQuickContinuation.js";
import { GraphProjectInspection } from "./GraphProjectInspection.js";

/** Keep unresolved guidance and its explicit inspection action together. */
export function GraphQuickUnresolved(
  props: ComponentProps<typeof GraphQuickContinuation> & {
    candidates?: string[];
    onSave?: ComponentProps<typeof GraphWebProfile>["onSave"];
  } & Pick<
      ComponentProps<typeof GraphProjectInspection>,
      "setup" | "disabled" | "onOpenConversation"
    >,
) {
  const [matched, setMatched] = useState(false);
  useEffect(() => setMatched(false), [props.build, props.configuration]);
  return (
    <>
      <GraphQuickContinuation {...props} />
      {props.onSave && props.candidates ? (
        <GraphWebProfile
          key={props.workspaceKey + props.build + props.configuration}
          setup={props.setup}
          webProject={props.build}
          configuration={props.configuration}
          candidates={props.candidates}
          disabled={props.disabled}
          onSave={props.onSave}
          onMatched={setMatched}
          onOpenConversation={props.onOpenConversation}
        />
      ) : null}
      {!matched && props.build.toLowerCase().endsWith(".csproj") ? (
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
