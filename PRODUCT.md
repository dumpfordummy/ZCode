# Product

<!-- impeccable:product-schema 1 -->

Scope: the Graph Engineering surface of ZCode and the parts of the app it depends on (workspace and model selection, ordinary Chat handoff, native permissions, results, recovery). ZCode's other features are out of scope for this record. Durable product direction and ownership rules already live in [docs/graph-engineering/PRODUCT_DIRECTION.md](docs/graph-engineering/PRODUCT_DIRECTION.md); this file adds the user and operating context and does not restate them.

Provenance: sections marked **confirmed** were answered by the user in the design-audit session of 2026-09-30. Sections marked **inferred** come from the repository (`docs/graph-engineering/*`, source, native runs on this machine) and need confirmation at the design-direction review.

## Platform

web

Electron desktop is the primary shell; the same React UI also ships as a web client, and mobile web is a supported remote-control surface. Graph Engineering itself is local-workspace only today (`localOnly` state in `GraphEngineeringPanel`). Design for desktop first and keep the layout usable on a phone-width web client. Windows is the verified platform; macOS and Linux must not be broken by UI choices.

## Users

**Confirmed:** the primary user is a solo engineer running supervised tasks on their own project, on their own machine. They repeat similar requests many times a day, answer permission prompts themselves, read the outcome, and decide whether to accept it.

**Inferred:** they are comfortable with a terminal, Git and build/test tooling, and they distrust an agent that reports success without evidence. Reviewing other people's runs (a tech lead role) is a secondary audience that was not chosen as primary; do not optimise for it at the cost of the solo loop.

## Product Purpose

Let an engineer hand a concrete task to ZCode's native agent through a repeatable, inspectable workflow, and stay in control of it: describe the task, choose the context and the project checks, review what will happen, supervise the run, answer interruptions, and accept or reject the result on evidence.

Success is a short, low-anxiety loop for the repeat case, and a run whose outcome, cause and next action can be read without searching through unrelated panels.

## Positioning

ZCode is an **agent engineering workspace**. It is not primarily a visual workflow builder and not primarily another generic AI coding client. **Chat is interactive work; Graph is structured, repeatable, supervised work.** Both run on the same capable coding-agent runtime, so a Graph task is never a reduced agent. (**Confirmed** by the user, 2026-09-30.)

Graph runs on the same native agent and session runtime as ordinary Chat, with the same workspace, tools, instructions and permission configuration. It adds ordered steps, machine-verified project checks, immutable evidence and an explicit human gate. It does not add a second agent, a second provider store or a second permission system.

## Operating Context

- One local workspace per Graph view; all tasks share it, and other chats and editors can still change its files.
- Model responses, tool calls and permission prompts belong to native sessions. Graph observes and correlates them; it does not answer them.
- Saved project checks (Build, Test, Command) are configuration. A run produces separate, immutable results. Configuration must never read as a result.
- Runs take minutes and are interrupted by permission prompts (three per typical Sequential Engineering run), questions and a final human approval.
- Real synthetic-fixture runs for acceptance use a controlled loopback provider; live-model behaviour is not established by that evidence.

## Capabilities and Constraints

Vocabulary (Graph-specific; `CONTEXT.md` covers the plugin store only):

| Term       | Meaning                                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| Task       | What the user wants done, written as a request.                                                           |
| Context    | Documents, instructions and skills the agents read in addition to the request. Distinct from the request. |
| Check      | A saved project Build/Test/Command configuration. Never a result.                                         |
| Workflow   | A reusable, versioned definition of steps (built-in template or user graph).                              |
| Run        | One immutable execution of a workflow for one task, with attempts, evidence and an optional approval.     |
| Permission | A native tool authorisation answered in that step's own conversation.                                     |
| Approval   | The Graph gate's human decision over captured evidence. Separate from permission.                         |

Constraints to preserve (from the acceptance spec and closeout):

- Graph Host owns admission, attempts, immutable artifacts, evidence validation and the approval request. Native sessions own tool execution, permissions and terminal facts. Main only forwards.
- Reviewer output is strict: one JSON object, validated schema, evidence references limited to explicitly bound artifacts. Invalid output fails the attempt; a valid `needs_changes` or `needs_human` is a reviewer result that reaches the human gate. These are different facts and must read differently.
- Failed machine Test stops the generic workflow before the reviewer; no gate is requested.
- Source freshness, historical definitions, pinned template versions and conservative recovery (unknown work is never replayed) stay unchanged.
- Preflight acknowledgment of unknowns is per run and explicit.
- Approving records consent. It does not commit, merge or publish.
- Permission-policy changes (for example remembering an allow for a saved check) are a separate workstream and are not part of UX work.

Open, undecided:

- Whether Graph may read a pending native permission payload to preview it outside the conversation (ownership review needed).
- Whether generic engineering is the only first-class flow or game-engineering templates (slot, bugfix) need their own entry points. **Confirmed:** generic first; game templates are presets.

## Brand Commitments

ZCode's established interface is calm, dense and operational (see [DESIGN.md](DESIGN.md)). Graph inherits it. No separate Graph brand exists or is intended.

## Evidence on Hand

- `docs/graph-engineering/next-iteration/CODEX_ACCEPTANCE_SPEC.md` and `CODEX_CLOSEOUT.md`: prior native acceptance with controlled provider. Historical evidence, not tests run on this machine.
- `docs/graph-engineering/ux-audit/`: this machine's native captures (first-use, returning user, permission waits, reviewer and Test failures, zh-CN, keyboard focus) at 1280×720 and 1920×1080.
- Absent and not to be fabricated: live-model runs, user-operated acceptance, usage analytics, interview data on real users, non-Windows or mobile qualification of Graph.

## Product Principles

1. **Evidence over assurance.** Show what ran and what it proved; never let configuration, agent prose or a completed state stand in for a result.
2. **The user owns every decision that grants power.** Permissions and approval stay explicit, per run, in their native place. Convenience may move the user closer to them, never around them.
3. **Say what happened, what is still true, and what to do next.** Every stop, failure and wait names its cause and offers a next action.
4. **Repeat work is the common case.** The second run of a similar task should cost a fraction of the first, without hiding anything the first showed.
5. **Advanced capability stays reachable.** Simplify by ordering and grouping, not by removing graph editing, Advanced declarations or recovery.

## Accessibility & Inclusion

WCAG 2.2 AA is design guidance where practical. Formal certification or compliance is not a release requirement (**confirmed**).

- Keyboard-first: every action reachable and perceivably focused. The product resets outline and box-shadow globally, so Graph conveys focus by border and fill (`graphFocusClass`).
- Status is never colour alone; pair icon and text.
- English and Simplified Chinese are both supported and must not mix in one screen; layouts must tolerate longer strings.
- Light, dark and Zai variants; verify new UI in Zai Light and Zai Dark.
- Respect reduced motion.
