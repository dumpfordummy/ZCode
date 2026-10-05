# Z8.5-U1 implementation contract

Base: `1df2770c9d01e66df627d752a5b1fc6df92e3a96`, integration
`claude/zcde-graph-ux-audit-be80d8`. UI-only pilot; stop at PR review.

The operator reports that the installed pilot connects to the intended LLM. This
is operator-reported connectivity, not independent workflow or test evidence.
W1 and Z8.4-I1 remain accepted in their recorded scopes. Build/Test setup,
credentials, Sandbox/Task Manager and other accepted gaps remain deferred.

## Rules and owners

- Runs graph mode uses the full available detail column, without a prose maximum
  width or the trail column's 22rem cap. History stays available with a collapse
  control. The graph has a responsive, minimum 20rem height.
- Step details are explicitly opened in graph mode, below the graph. Closing them
  returns focus to their trigger. Trail mode keeps its existing inspector.
- Fit graph fits all captured nodes, including branches and repair groups.
  Selecting a node (or Focus selected step) returns to at least 85% zoom. Panning,
  zooming and polling do not change captured positions, edges or evidence.
- The view store remains the sole owner of workspace/run/node/attempt selection.
  History visibility and inspector visibility are UI-local, scoped to workspace
  and run respectively. React Flow owns its transient viewport; no Host writes.
- A run's captured definition remains the only source for its canvas, inspector,
  positions and connections. Today's workflow is never substituted.
- Keep request title, status, current step, distinct execution/test/reviewer/human
  facts, relevant result and next action visible. No completion implies tests or
  approval. Keep blocked reasons, stale/missing evidence, permission waits,
  recovery warnings and required acknowledgments visible at their action.
- Remove duplicate routine explanations and workspace paths. Existing Request
  and result, Evidence, Technical details and prompt disclosures keep exact text,
  diagnostics and provenance accessible. No generated summaries or font reduction.
- New run simplification removes routine explanatory copy only, preserving every
  field, readiness rule, check binding, preflight and explicit Start requirement.
- English and Chinese use the existing localization system. No runtime, protocol,
  permission, acceptance, installer, dependency or historical-evidence changes.

```mermaid
sequenceDiagram
  actor User
  participant View as Renderer view store
  participant Canvas as React Flow viewport
  participant Host as Existing Graph Host
  User->>View: Select run / node / attempt
  View->>Canvas: Captured run definition and selection
  User->>Canvas: Fit / pan / zoom / resize
  Note over Canvas: Viewport only; no save or admission
  Host-->>View: Existing read-only refresh
  View->>Canvas: Updated captured status, same selection
  Note over Canvas: Refresh does not reset viewport
```

## Acceptance

Use the existing Vite/Chromium real-component harness with synthetic Host records,
no paid calls, company files or credentials. Capture identical sequential and
branch/repair records before and after at 1366×768, 1600×900, 1920×1080 and an
explicitly labelled reduced CSS viewport with the existing 268px app sidebar.
Record viewport, content and canvas dimensions, DPR and canvas zoom.

Rendered tests must cover Fit, pan/zoom, readable node selection, resize, first
reveal, graph hide/show, run/attempt switching, history collapse, keyboard and
focus return. Compare captured records and Host mutation logs. Capture running,
permission, failed, completed without tests and final approval screens; assert
their independent evidence and approval states. Keep full request/output and
actionable check/file details reachable. Typecheck, lint, focused tests, changed
formatting and architecture checks are required; existing required PR CI and its
selector/aggregator remain unchanged. Browser harness success is not native
execution evidence or company-PC/operator acceptance.
