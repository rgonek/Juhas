# Design brief: Juhas

**Juhas** is a native Herdr helper for reviewing work by coding agents. Preserve the existing layout and native appearance while keeping the daily workflow small and responsive. Expanded review is the primary workspace; the sidebar shares the same model. The product name is Juhas.

Source reference: https://github.com/rgonek/juhas. The brief is self-contained; access to the developer's computer is not required. If repository access is available, the UI composition is in `mods/juhas/main.js` and the shared control styles are in `mods/juhas/ui.js`.

## Workflow and views

An agent creates commits; the user reviews them, attaches comments to files/lines and submits one message back to an agent session.

- Support a narrow sidebar and an expanded work-area view, with an obvious way to switch between them.
- Primary modes: **Commit** (default, selected commit versus parent) and **All changes** (final effect against HEAD).
- All changes has one **Compare from** popover: Base branch / Last review checkpoint / Choose commit. Branch uses merge-base; Choose commit excludes that commit. Show the resolved base and automatic/manual origin. Reuse local configuration and the existing branch picker; no built-in naming conventions.
- History defaults to feature commits after merge-base, with HEAD fallback. Full history, all branches, remotes, details and search live in History's **⋯**. Uncommitted and inclusive Range remain in the review **⋯**.
- Mode changes preserve draft provenance and the All changes baseline. Comments from multiple commits form one batch. Disable empty Submit review. Secondary Mark seen explicitly names the target SHA and saves a branch/worktree checkpoint without sending or approving anything.
- Expanded review has history and changed files above a full-width diff. Both horizontal and vertical dividers are draggable.
- History includes a graph, subject, author and refs; details are optional. Files support a list/tree, status colors, line statistics and comment counts. Diff supports unified/side-by-side views and on-demand unchanged context.
- Submission auto-selects an unambiguous project agent. The final message is editable and copyable; **Include code** and **Include Git context** are off by default. Send/Copy/Cancel stay at the bottom while the editor scrolls.

## Design priorities

Improve action hierarchy, toolbar grouping, spacing, alignment, typography, selection/focus/disabled states, popup selectors and empty/loading states. Keep secondary actions discoverable without making every option equally prominent. Make both widths comfortable, and support light/dark themes through semantic colors.

## Implementation constraints

Production UI is native GPUI through JavaScript, without a DOM or CSS. Available components include **Button, Checkbox, Toggle, Tabs/Tab, Popover, Input, Textarea, Scrollbar, virtual lists and resizable panels**. These gpui-base primitives provide behavior but require application styling; use a small consistent visual system around them.

There is no ready-made Tree/Diff JavaScript binding in the target runtime. Select requires consumer-owned option navigation; existing selectors use virtual lists inside native popovers. Virtual rows do not expose Shift-click modifiers: Range uses explicit first/last commit clicks. Do not depend on unsupported gestures or replace virtualization with fully rendered lists.

Public references: [components](https://gpui-kit.com/component/), [unstyled primitives](https://gpui-kit.com/base/), [JavaScript layer](https://gpui-kit.com/shell/). The full styled Rust catalog is broader than the JavaScript components available here.

Keep the existing expanded History + Files / full-width Diff composition. Use existing native components rather than introducing a new visual system. Preserve Git, comments, checkpoints and delivery safety; move uncommon Git browsing controls into advanced menus.

Toolbar mode/filter choices use grouped native Buttons, as in the Diff gallery, rather than tab controls. Change navigation is provided by previous/next buttons that continue across changed files. Saved review notes use annotation cards beneath source lines, on the corresponding side in split mode. Independent source scrolling with linked vertical alignment is not part of the current JavaScript API; avoid custom wheel-event synchronization.
