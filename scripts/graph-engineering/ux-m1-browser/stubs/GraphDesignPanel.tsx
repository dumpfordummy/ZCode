// LABELLED STUB (UX-M1 harness). Replaces ./GraphDesignPanel.js.
//
// The Workflows destination's design panel (workspace defaults, condition and repair editors) is not
// changed by UX-M1 and pulls in the composer configuration controls. The destination, the workflow
// library dialog and the graph canvas around it stay real; only this panel's body is replaced.
export function GraphDesignPanel() {
  return (
    <section data-testid="graph-design-panel-stub" className="text-ui-sm text-foreground-subtle">
      Workflows editor (harness stub)
    </section>
  );
}
