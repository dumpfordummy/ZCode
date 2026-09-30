import type { GraphDefinition } from "@zcode/services";
import { useGraphM3Text } from "./GraphM3Text.js";
import { designPin } from "./graphLibraryView.js";
import { useGraphTemplateText } from "./graphTemplateText.js";

/**
 * UX-M3.1: where the current design came from, shown only when the saved design really carries a
 * workflow pin (`definition.template`). It states the pin as stored: it does not claim the version is
 * still offered by the library, and a design without a pin shows nothing.
 */
export function GraphDesignOrigin({ definition }: { definition: GraphDefinition }) {
  const m3 = useGraphM3Text();
  const display = useGraphTemplateText();
  const pin = designPin(definition);
  if (!pin) return null;
  return (
    <p className="text-ui-sm text-foreground-subtle" data-testid="graph-design-origin">
      {m3("designOrigin", { name: display.entry(pin.id, pin.name), version: pin.version })}
    </p>
  );
}
