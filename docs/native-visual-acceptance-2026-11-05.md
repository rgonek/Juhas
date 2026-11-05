# Native visual and workflow acceptance — 2026-11-05

## Scope and evidence

Juhas branch: `design/juhas-visual-polish`, based on `4568cb8`.
Windows native GPUI, existing `Baca-private` layout, light Paper and dark Atom One Dark.
No layout clone or layout switch was required. Original settings.json was restored byte for byte (SHA256 verified).
Evidence is local under `.superpowers/visual-acceptance/`: numbered PNG frames, test logs and a native input helper.
Frames taken while a Git operation is loading are intermediate evidence, not completion assertions.

CivicLens test worktree: `D:/Dev/CivicLens/.worktrees/juhas-ui-acceptance-20261105`.
Temporary branch: `temp/juhas-ui-acceptance-20261105`, pushed to origin at `ef036880`.
Synthetic files are confined to `docs/juhas-acceptance-fixture/`. Four commits cover additions, edits, deletion, rename, Unicode paths, binary content, long lines, a later HEAD, and initially uncommitted/untracked changes. The original CivicLens checkout remains clean on master. No application/database operations were run.

This is broad functional and visual acceptance, not an exhaustive proof of all combinations of repository history, theme colors, input methods, platforms or host versions. Native evidence and harness evidence are explicitly distinguished below. Internal legacy layout integration is not certified in the current personal layout.

## Native coverage

| Surface / options | Observed outcome | Evidence frames |
|---|---|---|
| Dedicated tab, native pane, compact sidebar, placement below terminal, source return | Render and preserve repository context; compact sidebar omits history; opening the dedicated review tab and returning reaches the original source tab/pane | 01, 53, 54, 88–89 |
| Commit / All changes / Uncommitted | Correct source modes and file sets; branch aggregation includes multiple commits | 01, 03, 24, 58 |
| Include uncommitted | Mixed source remains distinct from a working-tree-only comparison | 70, 83 |
| Compare from base branch / checkpoint / selected commit | Pickers open; checkpoint and exclusive commit comparisons produce subsequent changes | 61–63, 68 |
| Branch browser | Search input, refs, current/all branch choices render in native picker | 55 |
| History options | Details, filters and advanced/full/all/remotes controls render; details load | 20, 28, 42, 51 |
| Files list / tree / viewed state | Tree groups paths; viewed count and marker update | 06, 17 |
| Unicode / binary files | Unicode names remain intact; binary diff offers file comments rather than fake source lines | 03, 60–61 |
| Unified / Split / Wrap | Both source presentations render; measured wrapping retains long source lines | 05, 24, 68 |
| Diff search and next match | Query highlights matches and advances count; scope says loaded context only | 06 |
| Single file / All files | Multiple independent headers, collapse state, comments and viewed controls render | 22 |
| File comment / old and new line comment | Correct editor location and side; saved comment visible beside exact source | 06–07, 29, 31, 33 |
| General comment / Enter save | General editor and saved draft render | 35–38 |
| Comments / All / Outdated | Lists and empty filtered state render; old mutable comments become outdated after the source changes | 34, 78 |
| Edit historical comment / unavailable original source | Detached editor retains text and provenance, explains unavailable source | 81 |
| Clear all | Saved draft count reaches zero; independent unsaved composer is retained | 84 |
| Unsaved review: Skip / Save and continue | Skip retains text; Save and continue adds draft then opens preview | 71–73, 79 |
| Submit preview / editing / regenerate / three content options | Generated text, manual suffix, context options and code quote observed; clipboard matches visible message | 08–09, 38–40 |
| Recipient picker / all live terminals / no agents | Virtual list scrolls; explicit no-agents guidance replaces an unexplained blank panel | 10–13, 38, 79 |
| Copy review / Send review | Clipboard inspected; actual review delivered to isolated Python stdin sink in terminal t1y; sent drafts cleared | 14–15; hc read output |
| Copy code / original and modified source | Read-only selectable loaded code panel renders | 21 |
| Mark seen / review baselines | Commit checkpoint created and selectable; later commit available for subsequent review | 18, 62 |
| Working snapshot limit | CivicLens exceeds the default cap; operation rejects without changing index/files or creating a snapshot ref | 27; git status/ref inspection |
| Guided request / load guided response | Synthetic response matching exact source ID is validated and rendered; explicitly labeled as a fixture, not agent analysis | 40–41 |
| Repository discovery / picker | Parent directory discovers repositories; scrollable picker renders | 64–65 |
| Light / dark theme | Native semantic surfaces, text, controls and diff colors follow the active layout | 50 and corresponding light frames |
| Refresh / source changes / loading and error notices | Data survives refresh; loading state and specific errors remain visible | 03–04, 27, 74, 83 |

Not every listed control was independently driven through every successful and failed outcome in the live window. Pagination, history filtering semantics, old/missing anchors, keyboard navigation, source races, disabled boundaries, delivery uncertainty and snapshot success/cleanup additionally rely on the automated suite. In particular, CivicLens provides native evidence for snapshot rejection, not native evidence for successful capture. Guided reading used a deterministic response fixture, not a generated analysis from another agent.

## Defects fixed during acceptance

1. Line-comment reveal used unsupported native scroll strategy `bottom`. The authoritative declaration accepts only `top` and `center`. Changed to `center`; regression reproduces the old failure for Unified and Split. Native line editor now opens without the runtime error.
2. Save and continue used a stale UI context after asynchronous validation. Work actions now receive the spawned live context, including scope actions. Inline editor save/cancel and controller notifications run through the main view's existing action queue; controller notifications are coalesced. A native retest reached the four-comment preview without the previous context-lifetime error.
3. History's fixed initial 480px width squeezed file lists in narrow panes. Initial size now follows width with separate wide/narrow native splitter identities, and redundant metadata is omitted in narrow panes. Within each size class, manual resizing remains native.
4. Small uppercase headings and colored filenames competed with source/status information. Section labels use sentence case, 11px semibold foreground; filenames use layout foreground, while change counts retain semantic colors.
5. Primary hover changed fill color without changing its foreground pair. Hover now retains the theme's solid/solid_foreground pair.
6. Copy code was the only item in a large overflow popup. It is now a direct diff-toolbar action.
7. Empty recipient picker gave no explanation. It now explains the absence of project agents and points to All live terminals.
8. Snapshot rejection omitted its limits. It now states MiB/files and suggests committing and using Mark seen.
9. Mixed committed/uncommitted comparisons were labeled only Uncommitted. Caption now describes both sources.
10. Fetch now closes its action menu; singular review headings say comment.

## Product assessment

Keep prominent: scope selector, file/diff view modes, Viewed, change navigation, comments, Submit review, Copy code.

Useful but insufficiently discoverable:
- Mark seen and review baselines are core to incremental review but live under More. Consider a labeled baseline control near Compare from when a checkpoint exists.
- General comment is available only from Comments. It is valuable and could also be exposed near Submit review.
- Choosing an original-side comment is explicit only in Split. A short contextual hint would help new users.

Low value in the default flow, but worth retaining under advanced controls:
- Inclusive commit ranges, full/all-branch history and remote refs; they are for exceptional review scopes, not the common agent-review loop.
- Working snapshots: useful for small repositories, currently unavailable on this CivicLens checkout because capture limits cover the whole tree. Do not silently increase the cap; consider a bounded changed-files design separately.
- The legacy layout bar is compatibility code; do not promote it as a new UI option.

Missing conveniences:
- Quick path filter for the Files list (diff Search only searches loaded source).
- Searchable recipient list with project/tab/directory context; several live terminals currently have identical executable titles.
- A visible source-return action in dedicated review tabs independent of a user's toolbar integration.
- A reversible Clear all action or Undo for large draft collections.

These are improvement opportunities, not claims that a mod should replace its host's layout, theme or native interaction model.

## Visual scoring

Subjective ratings for the inspected native Windows surfaces, considering the constraints of a layout-adaptive mod. These are not accessibility certification or guarantees for every custom color palette.

| Category | Initial | After iterations | Basis |
|---|---:|---:|---|
| Typography | 7.5 | 9.0 | Native font, readable sentence-case section labels, restrained emphasis |
| Hierarchy | 7.5 | 9.0 | Scope, navigation, file identity and feedback form distinct levels |
| Spacing & density | 6.5 | 9.0 | Adapted history/files split, compact icon action, native wrapping |
| Color & contrast | 8.5 | 9.2 | Theme-derived foreground/surface pairs, verified light and dark |
| Iconography | 8.0 | 9.0 | Native-sized icons with labels/tooltips and clear action purpose |
| Consistency & polish | 7.5 | 9.0 | Native controls, fewer popup steps, two actual runtime defects resolved |
| Clarity | 7.0 | 9.0 | Explicit missing-recipient, source and limit messages; mixed-source caption |
| Overall | 7.5 | 9.0 | Cohesive core review flow while respecting the user's layout |

## Verification

- Full Node suite: 315 passed, 0 failed (final-tests.log).
- Native installed mod check: passed.
- git diff --check: passed.
- Independent code review: no remaining must-fix findings after async-context and queue corrections.
- CivicLens master clean; temporary branch clean and tracking its pushed origin branch.
- Juhas changes are uncommitted on the requested new branch; no Juhas push or merge performed.
- No Linux/macOS interactive acceptance; no claim of successful native snapshot capture on CivicLens; no claim that hc's raw Python stdin sink preserves agent bracketed-paste formatting.
