import { useCallback, useState } from "react";
import type { GraphPortableTemplate, GraphTemplatePreview } from "@zcode/services";
import type { GraphLibraryEntry } from "@zcode/services";
import { type GraphSaveTarget, effectiveTarget } from "./graphLibrarySave.js";
import { reviewedTemplate } from "./graphWorkflowView.js";

/**
 * UX-M3.2: the preview -> review state shared by every Share task. A preview never mutates the
 * library. Any change to the source invalidates the preview and the reviewed tick, so the template
 * that can be saved is always exactly the one that was previewed and then reviewed.
 */
export function usePortableFlow() {
  const [json, setJson] = useState("");
  const [preview, setPreview] = useState<GraphTemplatePreview>();
  const [reviewed, setReviewed] = useState(false);
  const accept = useCallback((value: GraphTemplatePreview | undefined) => {
    if (!value) return;
    setPreview(value);
    setReviewed(false);
    if (value.json) setJson(value.json);
  }, []);
  const invalidate = useCallback(() => {
    setPreview(undefined);
    setReviewed(false);
  }, []);
  const reset = useCallback(() => {
    setPreview(undefined);
    setReviewed(false);
    setJson("");
  }, []);
  const template: GraphPortableTemplate | undefined = reviewedTemplate(preview, reviewed);
  return { json, setJson, preview, reviewed, setReviewed, accept, invalidate, reset, template };
}
export type PortableFlow = ReturnType<typeof usePortableFlow>;

/** The explicit save target of one Share task; never shared with the Workflow dropdown. */
export function useSaveTarget(entries: readonly GraphLibraryEntry[], initial: GraphSaveTarget) {
  const [chosen, setChosen] = useState<GraphSaveTarget>(initial);
  return [effectiveTarget(chosen, entries), setChosen] as const;
}
