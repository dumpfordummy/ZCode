// LABELLED STUB (UX-M1 harness). Replaces ./GraphConfiguration.js.
//
// The composer's model / mode configuration chain (useDraftConfigControl, model-selection service,
// session preparation) is not part of UX-M1 and needs a native runtime. The stub returns a fixed,
// ready effective configuration so the real GraphEditor can run; nothing here executes anything.
const config = {
  draftConfig: {
    modelSelection: { providerId: "fixture", modelId: "fixture-model" },
    mode: "build",
    planEnabled: false,
  },
  modelSelectionRead: { state: { status: "ready", view: null }, reload: () => undefined },
};

export function useGraphConfiguration() {
  return config as never;
}

export function GraphConfiguration() {
  return null;
}
