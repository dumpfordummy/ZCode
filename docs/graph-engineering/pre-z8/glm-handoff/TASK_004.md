# TASK_004 — Fix manifest-ready wait semantics and rerun the complete/no-Tests scenario

## Scope

Fix the harness defect that blocked the U4 `--scenario=complete` run at
`pre-z8-u4-artifact-ui.mjs:50` (TASK_003), then rerun the complete scenario to a full PASS.
This is a harness-only fix. No production UI/runtime/contract change, no assertion weakening,
no fixed sleeps, no swallowed exceptions, no repeated export clicks to mask a wait problem.

## Defect

`pre-z8-u4-artifact-ui.mjs:50` used `waitFor()` (default `state: "visible"`) on
`[data-testid="graph-manifest-read-state"][data-state="ready"]`. The `ReadState` component
(`packages/ui/src/graph-engineering/GraphArtifactInspector.tsx:118-136`) renders the outer
`<div data-state={status}>` always, but for `status === "ready"` renders **no children** — an
intentionally empty status div. Under the product's `text-ui-sm` styling that yields a zero-size
element, so a visibility wait can never succeed → 30s timeout. `data-state="ready"` was correctly
set; the manifest read had completed.

## Fix (minimal, per authorization)

Keep the original `[data-state="ready"]` attribute selector (it itself excludes loading/error),
change only the wait target from visibility to attachment:

```js
await window
  .locator('[data-testid="graph-manifest-read-state"][data-state="ready"]')
  .waitFor({ state: "attached" });
```

This is race-free: the `[data-state="ready"]` attribute selector only matches once the state
becomes ready (not while loading). `state: "attached"` requires the element to be in the DOM with
that attribute, not visible. It mirrors the hidden-tolerant `getAttribute("data-state")` check
the same file already uses for `graph-artifact-read-state` at lines 43-47. A Chinese comment
explains why the ready element is empty and why attached (not visible) is correct.

## Forbidden approaches (not taken)

- Did not delete the ready condition.
- Did not modify the product UI to enlarge the empty div.
- Did not add fixed sleeps, blindly extend timeouts, swallow exceptions, or skip checks.
- Did not re-click export or re-submit to mask the wait.
- Did not reuse a stale ready state: the `graph-export-manifest` click precedes the wait each
  run, and manifest content is validated against the current `run.id` and `run.artifacts`
  (not the state marker alone).

## Regression coverage

New `scripts/graph-engineering/pre-z8-u4-manifest-wait.test.mjs` drives the actual Playwright
locator semantics against a loopback page with controlled `data-state` transitions (page timers,
not test-side sleeps). Four cases:

1. **ready, zero-size/empty passes the attached wait** — the condition that broke `visible`.
2. **loading → controlled ready transition is awaited** — must block until the transition
   (≥200ms), not pre-empt on the loading element.
3. **stuck loading is never treated as ready** — `[data-state="ready"]` does not match; attached
   wait times out.
4. **error state is never treated as ready** — same; error is not confused with ready.

The tests verify actual wait behavior, not source strings. Existing missing/corrupt artifact,
byte-restoration, manifest-content, and identity assertions are preserved unchanged.

## Full native scenario rerun

`node scripts/graph-engineering/pre-z8-u4-native.mjs --scenario=complete` must reach PASS across
all acceptance points: primary completion assertions, missing/corrupt artifact checks + restoration,
manifest export + content validation, `verifyU3LaterChat`, the second `assertU4Summary`, and
`assertU3FixturePreserved`. "Completed" is not written as "test PASS".

## Constraints

- Isolated workspace + controlled loopback provider only. No installed credentials, no live paid
  models, no company projects. No reset/stage/commit/push/publication. No U5/U6/Z8. U4 not
  declared complete. Evidence to a new attempt directory; earlier failure preserved.
