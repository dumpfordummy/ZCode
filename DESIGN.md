# ZCode Design System

Portable design system for AI-assisted UI work in this repository.

This file is meant for coding agents. When generating or editing UI in this repo, follow this file before inventing new visual rules.

## Highest-priority UI constraint

The dedicated `text-ui-*` scale is a mandatory repository-wide constraint for application interface typography:

- UI components must use `text-ui-xl`, `text-ui-lg`, `text-ui-base`, `text-ui-caption`, `text-ui-sm`, or `text-ui-xs`.
- Do not introduce Tailwind's built-in `text-base`, `text-sm`, or `text-xs` for application UI.
- Do not introduce arbitrary UI font sizes such as `text-[13px]` or inline `font-size` values.
- The only content-level exceptions are code, Diff, and terminal rendering that consume their independent numeric font-size settings. Their surrounding controls, labels, headers, and metadata must still use `text-ui-*`.
- Mobile Web editable inputs that must prevent iOS focus zoom use the fixed `text-mobile-input-safe` compatibility token (16px). Do not use it as a general UI hierarchy token.
- Never implement interface font scaling by changing `html` or `document.documentElement.style.fontSize`; update only `--ui-font-size`.

Treat violations of this section as design-system defects, not stylistic preferences.

## Product Character

ZCode is a desktop-first and web-compatible AI workspace. The interface should feel calm, dense, and operational rather than decorative.

Design for:

- long sessions
- high information density
- readable chat and tool output
- keyboard-driven workflows
- desktop and web parity
- macOS, Windows, and Linux compatibility
- internationalization and variable text length
- light and dark themes, plus Zai variants already supported by the codebase

Avoid:

- oversized marketing-style spacing
- playful gradients as the default UI language
- bright full-surface brand fills
- ambiguous hierarchy between background, card, and popover surfaces

## Theme Modes

User-facing theme choices are:

- System
- Light Theme, backed by Zai Light
- Dark Theme, backed by Zai Dark

Default light and dark CSS variables still exist as fallback foundations, but new UI should be validated against Zai Light and Zai Dark as the active light/dark experiences.

## Color Palette

### Core semantic colors

- **Brand**: `--color-brand`
  Use for key emphasis, important links, active indicators, and brand-accented actions. Never use as a full-page background.
- **Icon Blue**: `--color-icon-blue`
  Use for browser-style links and blue icon emphasis that follows the Figma `icon/blue` role. Keep file-type icons on their own descriptor colors.
- **Accent Surface**: `--color-accent`
  Use for weak emphasis blocks, selected highlights, and low-intensity branded surfaces.
- **Background**: `--color-background`
  Default page and app workspace background.
- **Background Alt**: `--color-background-alt`
  Alternate page region background when the layout needs a soft separation.
- **Header / Panel / Sidebar**: `--color-header`, `--color-panel`, `--color-sidebar`
  Structural layout surfaces only. Do not reuse as generic card colors.
- **Surface**: `--color-surface`
  Low-elevation container surface.
- **Surface Hover**: `--color-surface-hover`
  Hover state for low-elevation surfaces.
- **Card**: `--color-card`
  Standard content card background.
- **Card Selected**: `--color-card-selected`
  Selected or active card background.
- **Popover**: `--color-popover`
  Dialog, popover, and floating panel background.
- **Menu**: `--color-menu`
  Dropdown and menu surface.
- **Menu Hover**: `--color-menu-hover`
  Hover state for menu items.
- **Input**: `--color-input`
  Default editable field background.
- **Input Focused**: `--color-input-focused`
  Focused editable field background.

### Text colors

- **Text Primary**: `--color-foreground`
  Main reading text.
- **Text Secondary**: `--color-foreground-subtle`
  Metadata, descriptions, supporting labels.
- **Text Tertiary**: `--color-foreground-subtlest`
  Placeholders, weak hints, disabled-adjacent copy.
- **Text Inverse**: `--color-foreground-inverse`
  Text on dark, branded, or state-colored fills.

### Border colors

- **Border**: `--color-border`
  Default border and separator.
- **Border Hover**: `--color-border-hover`
  Hovered border state.
- **Card Border**: `--color-card-border`
- **Popover Border**: `--color-popover-border`
- **Input Border**: `--color-input-border`
- **Input Border Hover**: `--color-input-border-hover`
- **Input Border Focused**: `--color-input-border-focused`

### Semantic feedback colors

- **Success**: `--color-success` with `--color-success-foreground`
- **Warning**: `--color-warning` with `--color-warning-foreground`
- **Destructive**: `--color-destructive` with `--color-destructive-foreground`
- **Idle-time task**: `--color-idle-task` with `--color-idle-task-surface`
  Use only for idle-time queue and paused tags so they remain visually distinct
  from the green scheduled-task treatment.
- **Diff Added**: `--color-diff-added` with `--color-diff-added-foreground`
- **Diff Removed**: `--color-diff-removed` with `--color-diff-removed-foreground`

Use semantic colors only for actual semantic states. Do not borrow success, warning, or destructive colors just to make a block feel louder.

### Blocking interaction colors

- **Ask Interaction**: `--color-interaction-ask-surface`, `--color-interaction-ask-foreground`, `--color-interaction-ask-fill`
  Legacy compatibility tokens for `AskUserQuestion`; waiting badges no longer use a separate blue treatment.
- **Confirmation Interaction**: `--color-interaction-confirmation-surface`, `--color-interaction-confirmation-foreground`
  Use for all waiting badges, including `AskUserQuestion`, permission, and `ExitPlanMode`.

Waiting badges use one green confirmation treatment so identical waiting copy does not appear as different states. Do not substitute `--color-success` for a waiting confirmation.

### Workflow timeline colors

The dynamic-workflow timeline draws with a feature-scoped token family:

- **Rule**: `--color-workflow-rule`
  Sub-hairline for repeated furniture. Weaker than `--color-border`; do not use it as a
  general separator.
- **Trace / Trace Strong**: `--color-workflow-trace`, `--color-workflow-trace-strong`
  Rail and arc stroke ramp: not yet taken vs control has passed. The marching segment
  overlays `--color-warning` dashes; there is no third stroke colour.
- Station lamps and agent pills use the semantic status colours (`--color-success`,
  `--color-warning` for running, `--color-destructive`); agent avatars use the fixed nine-color HEX palette,
  assigned by instance index (name hash fallback), and never encode status.
- A compile-feedback row (a script that did not compile, so nothing ran) uses a hollow lamp:
  `--color-warning` while it is the latest draft, `--color-foreground-subtlest` once a newer
  draft exists. Never `--color-destructive`, which on this feature belongs to a run that errored.

### Overlay and utility colors

- **Toast**: `--color-toast`
- **Tooltip**: `--color-tooltip`
- **Tooltip Text**: `--color-tooltip-foreground`
- **Tooltip Tag**: `--color-tooltip-tag`
- **Tooltip Tag Text**: `--color-tooltip-tag-foreground`
- **Tag**: `--color-tag`
- **Find Highlight**: `--color-find-highlight`, `--color-find-highlight-active`
  Use only for in-page/text search result highlights. The base token marks all matches; the active token marks the currently selected match.
- **Hover**: `--color-hover`
- **Selected**: `--color-selected`
- **Primary**: `--color-primary`
- **Primary Foreground**: `--color-primary-foreground`
- **Secondary**: `--color-secondary`

## Color Usage Rules

- Use semantic tokens, not raw one-off color values.
- Prefer `bg-background + text-foreground` for page roots.
- Prefer `bg-card` or `bg-surface` for normal content containers.
- Prefer `bg-popover` or `bg-menu` for overlays; pair with `border-popover-border` or `border-border`.
- Prefer `bg-hover` for generic hover and `bg-selected` for selection.
- Prefer `bg-primary text-primary-foreground` for the default primary button.
- Prefer text hierarchy to create information density before adding more borders or colors.
- Keep brand color usage sparse and intentional.
- Never mix `bg-background`, `bg-card`, and `bg-surface` without a clear layering reason.
- Never replace semantic tokens with ad hoc values like `text-white/60`, `border-white/10`, or arbitrary neutral alpha fills.

- `DesktopWindowFrame` uses `bg-background-alt` on macOS desktop. Windows, Linux, and Web keep `bg-background-win-alt`; child surface colors remain independent.
- Linux desktop uses a `16px` outer window-shell radius around the `12px` workspace panels and their `4px` outer inset. Keep the shell radius and compositor clip path equal; maximized windows use `0px`.

## Typography

### Font families

- **UI Sans**: use the app's default `font-sans` stack for almost all interface text.
- **UI Mono**: use `font-mono` for paths, commands, code, identifiers, shortcuts, commit hashes, model IDs, and terminal-like data.

### UI font tokens

All interface typography must use the dedicated `text-ui-*` scale. The Appearance setting controls `--ui-font-size`, whose default is `14px`:

| Token             | Formula                | Default |
| ----------------- | ---------------------- | ------: |
| `text-ui-xl`      | `--ui-font-size + 4px` |    18px |
| `text-ui-lg`      | `--ui-font-size + 2px` |    16px |
| `text-ui-base`    | `--ui-font-size`       |    14px |
| `text-ui-caption` | `--ui-font-size - 1px` |    13px |
| `text-ui-sm`      | `--ui-font-size - 2px` |    12px |
| `text-ui-xs`      | `--ui-font-size - 4px` |    10px |
| `text-ui-2xs`     | `--ui-font-size - 5px` |     9px |

`text-ui-2xs` is a restricted exception below the `text-ui-xs` floor: it is permitted
only for graph **axis furniture** — timebase tick labels, channel codes, and unit
suffixes in the workflow timeline — never for content, labels, or metadata.
Treat any other use as a design-system defect.

`text-mobile-input-safe` is a fixed 16px platform-compatibility token. It is
reserved for editable controls on mobile Web surfaces where iOS focus zoom must
be prevented, and therefore does not scale with `--ui-font-size`.

- Changing the interface font size updates only `--ui-font-size`; never mutate the root `html` font size.
- Icons, spacing, radii, and other `rem`-based geometry must not scale with the interface font setting.
- Code, Diff, and terminal content retain their independent font-size settings; only their surrounding interface controls use `text-ui-*`.
- Mobile Web inputs that require the iOS 16px focus-zoom floor use `text-mobile-input-safe`.

### Type roles

The `text-ui-*` scale expresses stable semantic roles. Choose a token by content role rather than by isolated visual preference:

| Token             | Primary roles                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `text-ui-xl`      | Markdown `h1` and equivalent first-level reading headings                                                    |
| `text-ui-lg`      | Markdown `h2` and equivalent second-level reading headings                                                   |
| `text-ui-base`    | Markdown `h3`-`h6`, body copy, common buttons, workspace and section titles, and other primary UI text       |
| `text-ui-caption` | Compact supporting copy that must remain one step below body text, such as the New Task feature announcement |
| `text-ui-sm`      | Secondary copy, supporting information, helper text, Tooltip copy, and Markdown inline code                  |
| `text-ui-xs`      | Tooltip keyboard shortcuts, badges, compact labels, counters, and very weak metadata                         |

- Markdown `h3`-`h6` share `text-ui-base`; distinguish their hierarchy through weight: `h3`-`h4` use `font-semibold`, `h5` uses `font-medium`, and `h6` uses `font-normal`.
- Body copy and common controls normally use `text-ui-base font-normal`; titles and labels may strengthen weight without changing their semantic size role.
- Pair secondary copy with an appropriate semantic color, usually `text-foreground-subtle`. Pair weak metadata with `text-foreground-subtlest`. Font size and color hierarchy are independent decisions.
- **Tooltip**: titles, plain descriptions, and log content use `text-ui-sm`; keyboard shortcut labels use `text-ui-xs`. Rich content such as Markdown release notes keeps its content typography hierarchy instead of flattening headings and links to the Tooltip copy size.
- **Code / Command / Path**: use `font-mono`, usually with `text-ui-base`; Markdown inline code uses `text-ui-sm`.
- When migrating a legacy explicit `13px` UI size without a deliberate compact-caption role, use `text-ui-base`. Use `text-ui-caption` only where the product explicitly requires a stable one-step-below-body caption treatment. Do not collapse either into `text-ui-xs`; `text-ui-xs` is reserved for badge-scale and very weak metadata roles.

### Markdown type scale

Markdown rendered through the shared assistant response uses a reading-oriented hierarchy while the surrounding operational UI remains compact:

- **User and assistant message containers**: `text-ui-base`
- **Body**: `text-ui-base`
- **Links**: `text-ui-base`
- **Inline code**: `font-mono text-ui-sm`
- **Code block body**: default `14px`, configurable through code preview settings
- **Code block header**: `text-ui-base`
- **Tables**: `text-ui-base`
- **h1**: `text-ui-xl`
- **h2**: `text-ui-lg`
- **h3**: `text-ui-base`
- **h4**: `text-ui-base`
- **h5**: `text-ui-base`
- **h6**: `text-ui-base`

### Typography rules

- Keep UI text compact and readable.
- Prefer `font-medium` for headings and labels; avoid heavy weights unless there is a strong reason.
- Use monospace only where the content is inherently technical.
- Use `text-ui-base` as the default compact app text size. Keep `text-ui-base` for workspace titles and stronger title treatments.
- Respect i18n expansion. Do not hard-code layouts that only work for short English labels.
- Do not depend on tight truncation as the only way a component survives translation.

## Spacing

Base spacing unit is `4px`.

Recommended rhythm:

- `4px`: tight icon/text spacing
- `8px`: compact control padding and inline gaps
- `12px`: dense list items and menu rows
- `16px`: standard card and panel padding
- `20px` to `24px`: larger sections or dialog interiors

Spacing rules:

- Keep dense operational UI compact by default.
- Prefer a small set of repeated gaps and paddings instead of arbitrary values.
- In flex layouts with text, add `min-w-0` where truncation or shrink is required.
- In nested scroll or split-panel layouts, add `min-h-0` where scrolling must be allowed.
- Prefer `w-full + max-w-*` over hard-coded widths when possible.

## Radius

Radius follows the nesting of visible rounded containers, not component importance or layout depth. These rules are the target specification; existing component defaults may still need migration.

### Container hierarchy

- Layout regions, ordinary wrappers, groups, and separators do not count as radius levels.
- The first rounded container starts at `rounded-xl`, whether inside or outside a layout region.
- Nested rounded containers step down through `rounded-lg` → `rounded-md` → `rounded-sm`; `rounded-sm` is the minimum.
- Count the nearest actual rounded container, not intermediate DOM wrappers. Peer containers at the same level use the same radius.
- Cards, chat bubbles, tool blocks, and ordinary composite input shells follow this hierarchy; size or importance alone does not justify `rounded-2xl`.

### Approved 2xl exceptions

The following explicit exceptions may retain `rounded-2xl`; do not extend them to other components based only on size or importance:

- **Main chat input shell**: the actual `ChatPromptEditor` input shell may use `rounded-2xl`. Its drag overlay matches the shell because it covers the same surface, rather than introducing a nested container.
- **Conversation status floating panel**: the shared shell may retain `rounded-2xl` across collapsed and expanded presentations.
- **Toast**: the independent notification shell may retain `rounded-2xl`.
- **Brand icon backplates**: welcome-screen brand art and plugin-detail icons may retain `rounded-2xl` as part of their icon shape. This is not a general exception for icon buttons or content cards.

The main composer region, including its context-header layout wrapper, is layout and does not count as a radius level. Its existing decorative radius does not force the actual input shell down a level. This classification alone does not prescribe changing the layout wrapper's decorative radius.

These exceptions do not automatically grant `2xl` to nested controls or content containers. Basic controls still use the table below. Dialog shells follow their separate rules.

### Basic controls

Buttons, menu trigger buttons, ordinary Input, Textarea, and Select triggers default to `rounded-lg`. Adjust them according to the nearest rounded parent container:

| Nearest rounded parent          | Control radius |
| ------------------------------- | -------------- |
| None, or `rounded-xl` and above | `rounded-lg`   |
| `rounded-lg`                    | `rounded-md`   |
| `rounded-md` / `rounded-sm`     | `rounded-sm`   |

Control size and primary/secondary action emphasis do not independently change radius.

### Dialogs

- Dialog shells, including alert and confirmation dialogs, use `rounded-2xl`.
- Only chat attachment preview, feedback screenshot preview, and CUA screenshot preview dialogs keep `rounded-xl` shells.
- The dialog shell does not count toward its content hierarchy. The first rounded content container starts again at `rounded-xl`, followed by `rounded-lg` → `rounded-md` → `rounded-sm`.
- Basic controls inside dialogs follow the control table; a layout wrapper does not introduce an extra level.

### Menus and selection overlays

- Dropdown menus, context menus, Select expanded panels, and similar option/action overlays use `rounded-lg` shells. This includes the main input's `@` / `/` suggestion panel; it does not inherit the main-input exception.
- Menu items and option hover/selected backgrounds use `rounded-md`.
- Rounded containers or controls nested inside an option use `rounded-sm`.
- Each submenu is an independent overlay: its shell restarts at `rounded-lg`, and its options use `rounded-md`.
- Overlay radius does not inherit the trigger's parent hierarchy. Triggers themselves follow the basic-control table.
- Other standalone popover containers follow the ordinary container hierarchy, starting at `rounded-xl`.

### Shape exceptions and consistency

- `rounded-full` is reserved exclusively for deliberate pill shapes or circles.
- Buttons, tags, counters, and icon buttons do not qualify for `rounded-full` merely because of their component type.
- Do not introduce arbitrary radius values or use the ambiguous bare `rounded` utility.
- Use `rounded-none` or side-specific radius removal only where joined surfaces must form a continuous shape.
- Apply the same rules on desktop and mobile Web, across platforms and themes.

## Sizing

### Common size baselines

- **Icon sizes**: `size-3`, `size-3.5`, `size-4`, `size-5`, `size-6`
- **Control heights**: `h-6`, `h-7`, `h-8`, `h-9`
- **Square icon buttons**: `size-6`, `size-7`, `size-8`, `size-9`

### Sizing rules

- `size-4` is the default UI icon baseline.
- Reuse existing button sizes instead of creating new height systems.
- Prefer fluid widths for content containers.
- Fixed widths are acceptable for menus, popovers, dialogs, and stable side panels.
- Avoid arbitrary `w-[...]` and `h-[...]` for ordinary business UI.

## Components

### Buttons

Preferred button system matches `packages/ui/src/components/ui/button.tsx`.

- **Primary**: `bg-primary text-primary-foreground`
- **Outline**: border-based, neutral surface, subtle hover
- **Secondary**: `bg-secondary text-foreground`
- **Ghost**: transparent until hover
- **Destructive**: semantic destructive fill
- **Link**: text-only with underline on hover

Preferred sizes:

- `xs`: very compact controls
- `default`: most action buttons
- `sm`: compact buttons in dense lists
- `lg`: higher-emphasis buttons
- `icon-*`: icon-only actions

Button rules:

- Use existing button variants first.
- Keep icon-only buttons square.
- Do not promote every action to primary.
- Preserve a clear action hierarchy within each panel.

### Inputs

- Default to `bg-input border-input-border text-foreground`
- Hover with `border-input-border-hover`
- Focus with `border-input-border-focused` and `bg-input-focused`
- Normal form fields default to `rounded-lg`, stepping down according to the nearest rounded parent in the Radius rules.
- Ordinary composite input shells follow the container hierarchy, starting at `rounded-xl`; the main chat input shell is an approved `rounded-2xl` exception.

Input rules:

- Inputs should feel calm and integrated, not glowing by default.
- Use semantic error state styling only for real validation problems.
- Do not style ordinary inputs like cards.

### Cards and Panels

- Standard cards use `bg-card border-card-border`; radius follows the container hierarchy, starting at `rounded-xl`.
- Low-emphasis containers use `bg-surface`
- Selected cards may use `bg-card-selected`
- Main content cards usually use `16px` horizontal padding and compact text

Card rules:

- Cards should clearly sit above the page background but below overlays.
- Keep card surfaces quieter than overlays.
- Avoid mixing multiple card background styles in the same view unless they encode real hierarchy.

### Menus, Popovers, Dialogs

- Menus use `bg-menu`, compact rows, `rounded-lg`, and `shadow-md`
- Menus use `border border-popover-border` and typically `p-1`
- Dropdown menus, context menus, and select popovers should share the same menu surface language
- Adjacent option rows in dropdown menus, context menus, and select popovers use a fixed `2px` vertical gap (`gap-0.5`) at the shared option-stack layer
- Popovers and dialogs use `bg-popover` and `border-popover-border`. Ordinary standalone popovers start at `rounded-xl`; dialogs use `rounded-2xl` except the three preview exceptions in the Radius rules.
- Toasts use `bg-toast`, compact padding, and stronger shadow

Overlay rules:

- Floating UI should feel precise and compact.
- Interactive overlays such as dropdown menus, context menus, selects, and popovers must render above passive tooltips when both are open. Tooltips must never cover options or controls in an active interactive overlay.
- Dropdown menu surfaces must keep their overlay shadow from the first open frame through keyboard focus and pointer hover. Global focus-reset rules must not clear the menu shadow while the content root owns focus.
- Keep menu rows dense and highly scannable.
- Avoid giant popovers with loose spacing unless the task genuinely needs it.
- Do not style menus like cards or reuse `bg-card` / `bg-surface` for ordinary menu content.
- Menu items should read as compact action rows, not miniature buttons.
- Prefer stable item baselines such as compact height, `rounded-md`, `px-2`, `gap-2`, and `text-ui-base`.
- Use subtle hover states such as `bg-menu-hover`; avoid strong fills or per-row borders for normal menu items.
- Disabled items should keep their layout and hierarchy, and usually only drop to a weaker text color.
- Prefer weak separators and ordering to group actions; avoid building menus as stacked sub-cards.
- Reuse the same action-list content across dropdown and context-menu entry points when the action set is the same.
- For selected items, prefer checkmarks, radio indicators, or trailing state markers over strong full-row selection fills.
- Composite triggers with a primary action and a chevron should use a segmented shell: main action on the left, menu reveal on the right.
- Select triggers should continue to follow input-style semantics even when their expanded surface matches menu styling.
- Standard dropdown menus should usually align to the trigger's leading edge unless the trigger sits on the trailing side of a layout.
- Use end alignment when it helps menus open back toward the main content area or prevents edge crowding.
- Context menus should prioritize pointer context and appear near the interaction point rather than mimicking button anchoring.
- Select popovers should preserve a stable relationship with the trigger width and edges whenever practical.
- Keep menu offset small and consistent so the menu feels attached to its trigger while leaving enough room for border and shadow separation.
- Increase offset only when needed to avoid border collision, shadow merging, or layout crowding.

### Tabs and Selection States

- Default inactive tabs remain neutral
- Active tabs use a stronger surface contrast, not brand-fill blocks
- Use `bg-selected` for selected list rows or tabs when appropriate

### Chat, Tooling, and Developer UI

- Chat bubbles follow the container hierarchy, starting at `rounded-xl`. Main chat input shells may retain `rounded-2xl` under the approved exception.
- Tool output, terminal-like blocks, paths, hashes, and commands should bias toward monospace
- Diff UI must use diff-specific semantic colors, not generic success/destructive colors
- Dense operational panels are preferred over marketing-card styling

## Elevation and Depth

ZCode should use restrained depth. Layer primarily through background contrast, borders, and radius before relying on heavy shadows.

Recommended elevation levels:

- **Base**: no shadow, structure comes from background contrast
- **Surface**: very subtle border-led separation
- **Overlay**: `shadow-md` for menus, popovers, dialogs
- **Attention**: `shadow-lg` only for toast, important floating cards, or rare emphasized panels

Depth rules:

- Do not rely on large soft shadows for ordinary layout.
- Menus and dialogs can feel elevated, but still compact and controlled.
- Background layering is usually more important than shadow strength.

## Motion

- Keep transitions fast and low-drama.
- Favor subtle fade, zoom, and directional slide for overlays.
- Motion should clarify state change, not decorate the screen.
- Avoid long, springy, or playful animations in the main workspace.

## Workspace layout

Desktop and wide Web workspace content uses independent conversation, bottom terminal, and Side Pane frames. The conversation frame contains WorkspaceHeader and conversation; the optional terminal has its own frame below it, and Side Pane owns its tab bar. Frames use their own background and border, with 4px resizable gaps matching the macOS outer inset. Resize handles keep a transparent 4px hit area and show a 2px tertiary foreground (`foreground-subtlest/50`) line on hover, focus or drag. The indicator extends along the panel edge, inset by the panel radius at both ends, with rounded ends and no mask. Layout frames do not count toward content radius levels. Mobile remote control retains its single-column and drawer presentation.

## Responsive Behavior

The product is desktop-first, but UI must remain functional on smaller screens.

Rules:

- Start with a stable base layout, then enhance with breakpoints.
- Use breakpoints mainly for layout, width, visibility, and density changes.
- Do not change the semantic meaning of components across breakpoints.
- Prefer changing `max-width`, `grid`, `flex`, and visibility over changing component identity.
- Preserve primary actions at all breakpoints; do not hide core workflows behind desktop-only affordances.

## Accessibility and Internationalization

- Support keyboard navigation as a first-class interaction path.
- Preserve visible focus behavior through the repo's established focus styling patterns.
- Ensure contrast remains safe in light, dark, and Zai modes.
- Write layouts that tolerate longer translations.
- Avoid icon-only meaning when a text label is practical.
- Use semantic status colors together with readable text, never by color alone.

## Implementation Guidance

- Reuse existing semantic Tailwind utilities before adding new tokens.
- Reuse component primitives in `packages/ui/src/components/ui/` before inventing one-off variants.
- Match current density and component proportions already established in the repo.
- If a new UI need appears, first decide whether it belongs to structure, surface, interaction, or state. Then choose tokens accordingly.
- When in doubt, prefer quieter UI and stronger information hierarchy.

## Do

- use semantic color tokens consistently
- preserve the distinction between page background, card, and overlay surfaces
- keep controls compact and operational
- use text hierarchy to express density
- use monospace for technical values and command-like content
- support all shipped themes
- design for desktop, web, and cross-platform rendering constraints
- account for localization and long labels

## Don't

- use raw one-off colors in ordinary UI work
- fill large surfaces with brand color
- add arbitrary radii, shadows, widths, or heights without a stable system reason
- make menus and dialogs airy when they should be dense
- use semantic error or success colors for non-semantic decoration
- create components that only look correct in one theme
- trade clarity for visual novelty in tool-heavy screens

## Graph Engineering workbench (Focus page, UX-M4)

Status: **direction A (Focus page) selected 2026-10-01; implemented in UX-M4.2–M4.4.** Rationale, spec and evidence are in `docs/graph-engineering/ux-audit/` (`UX_M4_DIRECTION.md`, `UX_M4_SPEC.md`, `UX_M4_REPORT.md`). Everything above still applies; this section adds rules for the Graph Engineering surface (mode: Operate, an engineering workbench, not a marketing surface). The visual acceptance of UX-M4 belongs to the user and is recorded separately from the functional checks.

### Surface roles and accent (scoped tokens)

Graph has one additional token layer, `.graph-ui` (`packages/ui/src/graph-engineering/graphUi.css`). It redefines existing `--color-*` tokens **only inside** the Graph panel root and Graph dialog contents (Radix dialogs, selects and popovers portal out of the panel, so each carries the class itself). Nothing outside Graph changes; a Graph-only role is added here before any shared token is touched, and a shared token is only changed after the non-Graph consumers (Chat, Settings, plugin store) have been inspected.

| Role      | Used for                                          | Zai Dark  | Zai Light |
| --------- | ------------------------------------------------- | --------- | --------- |
| `shell`   | list rail, tab strip, footers (`header`, `sidebar`) | `#15161a` | `#e7e8ec` |
| `canvas`  | the main working area (`background`, `panel`)     | `#1b1c20` | `#f5f5f8` |
| `raised`  | rows, panels, chips, selected check (`card`)      | `#25262b` | `#ffffff` |
| `overlay` | dialogs, menus, popovers (`popover`)              | `#2b2d33` | `#ffffff` |

- **One accent.** A restrained blue (`--color-brand`, `#6ea8fe` / `#1e5fd8`) for the one primary action of a state, the current tab, the selected row and links. It is never used for status.
- **Warning and failure are different treatments.** Warning (needs you, uncertain outcome) is amber (`--color-warning`); a real failure is red (`--color-destructive`); success is green (`--color-success`). Each always carries an icon and words, and only the icon and a low-alpha surface are tinted; the label keeps `--color-foreground`.
- **Contrast is measured on the implemented surfaces** (`scripts/graph-engineering/ux-m4-scenarios-contrast.mjs`, computed styles in the running page, both themes): foreground 7:1, secondary and tertiary text 4.5:1 on canvas, shell, raised and overlay, semantic text 4.5:1 on canvas, raised and their own 10% tints, button labels 4.5:1, control boundaries (input border) and the focus border 3:1. `foreground-subtlest` is still the placeholder/disabled tier in shared screens, but inside Graph it is raised to 4.5:1 because real sentences use it.
- **Inputs.** The shared `Textarea` draws its border with the same colour as its fill, which is invisible on Graph surfaces; `.graph-ui textarea` therefore uses the Input tokens. The shared component is untouched.

### Type, grouping and width

- The `text-ui-*` scale and `--ui-font-size` stay the only mechanism; nothing is made smaller. Page title `text-ui-xl` semibold; section title `text-ui-base` semibold (one per section); body `text-ui-base`; secondary `text-ui-sm` in the secondary colour; `text-ui-xs` is not used for sentences in Graph (the canvas furniture keeps it).
- Group by whitespace and alignment first, a hairline second, a surface change third, a border last. No box around a paragraph; no panel inside a panel; at most one raised level inside a page.
- **Width.** Task entry, summaries, the run banner and the step strip use a readable column (`max-w-3xl` for New run, `max-w-5xl` for a run, `max-w-4xl` for the preflight). The graph canvas, node inspector, Checks, evidence and file differences use the full workspace width. The list of runs is `clamp(13rem, 17vw, 16rem)`; the task column never drops below 30rem at 1280px. There is no permanent right-hand inspector and no third permanent information column.

### Structure

- **One header.** Workflow name and saved/frozen state, then a single tab row: Runs, Workflows, Checks (`aria-current="page"`, accent underline). At the end of the row, inline and on every destination: *For the next run · Model · Mode · Checks N saved*. No second explanation row.
- **Runs.** A slim list on the leading side; on the trailing side the new-run form, the preflight or the selected run. Below 1000px it collapses to one pane with a back action. A row is a status icon plus words, the time, the workflow and the test evidence; selection is a surface plus an accent bar.
- **New run is task-first.** Title and one sentence; the workflow (and version) line; the task field; then Context, Checks and the step list separated by hairlines. Required parameters, required context and invalid configuration are never under Advanced. Ready means "ready for the next permitted action" (Review), never "tests passed"; saved checks say "Saved · not run". When the workspace is occupied, Review is blocked with its reason and **View current run**, the draft stays editable, and nothing starts when the run resolves.
- **A selected run has one focal element: the banner.** It owns the single explanation of the state and the next action (one accent-filled action; the rest are plain). Under it: the step strip (built from the steps actually visited, never a fixed sequence), compact outcome facts (Execution, Test evidence, reviewer output, Human decision: rows that do not apply are quiet lines), then single-level tabs (Steps, Request and result, Evidence, Technical details). Decision-critical content is never only inside a tab.
- **Commit bars.** A step that needs an explicit, per-run acknowledgment or decision keeps its controls in **one** sticky bar that is visible at 1280×720: New run (Review and run, Save as workflow only, the ready or blocked text), the preflight (acknowledgment and Start), the final approval (comment, reason, Approve, Reject), Checks (Back to new run, unsaved note). There is never a second copy of the primary button.
- **Library.** One dialog, master–detail: the workflow list (Yours / Built-in), the selected workflow, tabs Versions / Use / Share / Advanced, and a fixed footer with **Open in Runs** and **Load into design**. A failure sits directly above the tabs with its recovery; a stale success is cleared when a new operation starts or fails. Panels stay mounted (hidden) so drafts and reviewed previews survive a tab change.

### Kept rules

- **Vocabulary.** Task is the request. Context is documents, instructions and skills, shown apart from the request. Check is saved configuration. Run is one execution. Permission (native tool authorisation) and Approval (Graph gate decision) are different words and never share a label. "Task" in the app sidebar means a Chat session, so a Graph destination is never called Tasks.
- **Configuration is not a result.** Saved checks show a dashed-circle icon and "Saved · not run". A pass, fail or wait icon appears only for a captured result.
- **Status is icon plus text.** Not-applicable states ("Not requested", "Not reached") are neutral. Never use destructive for a state that is merely absent.
- **Stops and failures use one block** (the banner): what happened and why, what is still true, what you can do. Actions name their object. Do not show the same message twice on one screen.
- **Interruptions.** A "Needs you" strip is available on every destination while any run waits on a permission, a question or an approval; it links to the exact place to act, never grants anything itself, and is a quiet pointer when that run is already open.
- **Disclosure.** No nested disclosures on the primary path; one level for rare diagnostics. Raw identities and digests are secondary details; a blocking warning is never only there.
- **Controls.** Interactive controls are at least `h-7` (28px). Navigation uses `aria-current="page"`; tabbed detail uses the Radix roving-tabindex tab pattern (`GraphTabs`).
- **Focus.** The app resets `outline` and `box-shadow` on `:focus`/`:focus-visible` globally (`packages/ui/src/styles.css`), so focus in Graph is shown by a border-colour and fill change (at least 3:1 against the resting state) until that reset is revisited as a separate, app-wide decision.
- **Localisation.** Display names and descriptions of built-in workflows are localised by UI-owned message ids keyed by template id and version; identities and digests are not translated. New copy lives in `graph.m4.*` with English and Simplified Chinese.
