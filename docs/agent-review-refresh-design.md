# Agent review, Git efficiency and background refresh

Status: user-approved design direction, extended with the accepted community-comparison suggestions. Product implementation of this design has not started. The user confirmed preserving the old comparison after amend/rebase and offering an explicit transition to the current version, and explicitly rejected two-way agent threads. Independent builder review of the initial design completed; its branch-checkout question is resolved below as a stated proposal.

Repository convention: this document lives directly under `docs/`, alongside the audit and other design documents, because this repository explicitly ignores `docs/superpowers/`.

## Intent and agreed requirements

Juhas is a native Herdr review tool for work produced by an agent on a feature branch. The user reviews either individual commits or the final combined change, adds comments across sources and sends one feedback round. Some agent work remains uncommitted. Feature branches such as `XYZ-123/XYZ-987` use `dev/XYZ-123` as their integration base through personal configuration.

The user accepted the audit's optimization, interface simplification and feature recommendations, and additionally requires automatic refresh every 15 seconds while Juhas is open/visible. Refresh must keep the interface usable, preserve the chosen commit and selected file, and retain the visible diff while fetching. When the displayed source itself changes, update the file list and diff while keeping that file selected whenever possible.

Work remains on `feature/native-pane-integration`. The earlier comment-saving/Git-read fixes and research were committed as `597f87c`; preserve that baseline. No merge, push, install into the user's live configuration or network fetch is implied. The current 159-test baseline and the audit are evidence, not proof that these new behaviors already exist.

## Approach

Use incremental background probing with immutable caches and staged, selection-guarded publication. Reuse the existing native UI and asynchronous Git runner. Keep fetched candidate data separate from the displayed state until the candidate is ready and still belongs to the active context and selection.

Running today's `refreshContext` every 15 seconds would clear context, invalidate caches and rebuild history/selection. It conflicts with the requested stable UI. A filesystem watcher alone is also insufficient: external refs, Git internals and remote contexts still need checking, and the host has watcher limits. Watchers may later accelerate detection, but the 15-second check is the baseline.

This extends the previously accepted recommendation to optimize work/cache boundaries. It deliberately adds periodic checking while avoiding the competitors' unconditional full refresh.

## Review modes and source identities

- **Commit:** a pinned target SHA and selected parent. New HEAD commits update history without changing the displayed comparison. Even if the user originally entered through a `HEAD` action, the opened commit becomes pinned for refresh purposes. Selecting another history commit is an explicit navigation action.
- **All changes:** a live aggregate comparison from the selected baseline to HEAD; the baseline is the base branch's merge-base, a chosen commit or a review checkpoint. When these live endpoints change, rebuild only the affected comparison and preserve the file selection.
- **Uncommitted:** HEAD to working files, including untracked files. A change to HEAD or working content updates this comparison.
- **All changes including uncommitted:** the same aggregate baseline to working files, including untracked files. Present this as a clearly labeled option within aggregate review, not an implicitly different meaning of HEAD review.
- **No initial commit:** Uncommitted can compare new files against an empty tree. Commit review is unavailable, but missing HEAD does not prevent the first review.

A commit SHA does not mutate. Amend/rebase creates new commits. User-confirmed behavior: retain the old pinned comparison and its comments, refresh history, mark unreachable-source comments as outdated, and offer an explicit transition to the latest HEAD. Do not infer a replacement historical commit from matching subject, author or position. An unreachable commit may still be readable; do not discard its cached diff. If its object becomes unavailable, keep the last loaded display with an explicit unavailable-source warning and prevent attaching new comments to an unverified source.

Keep personal base-rule mapping and manual overrides. Use merge-base semantics so unrelated integration-branch work is not included in the agent diff. Auto-refresh reads local refs only; Fetch remains an explicit network action.

Builder-check follow-up, settled as an implementation proposal: if an external checkout changes the branch in the same directory, preserve the existing review and composer and show that the repository is now on a different branch. Offer an explicit action to review the current branch. Do not silently apply the new branch's base/checkpoint to an existing aggregate review. Until that action, pinned commit content remains readable; mutable views are marked stale and reject saving against the changed checkout while retaining the draft. Adopting the new branch recalculates its history/base/checkpoint context, preserving a matching selected path when possible. This does not modify the repository or perform a checkout.

## Refresh scheduling and visibility

- Nominal interval: 15,000 ms. One refresh/probe at a time per repository/context; missed ticks are coalesced, never queued into a backlog. A request lasting more than one interval does not cause overlapping work.
- Run only for a visible review view in the active Herdr tab/space. A visible pane next to a focused agent terminal still qualifies; keyboard focus on Juhas is not required. Hidden legacy sidebar/full copies, inactive tabs, toolbar-only copies and views hidden by another pane's zoom must not poll.
- Create and retain a timer with the view. Explicitly cancel/release scheduling on close and hot reload. Visibility is checked before starting Git, not inferred from the existence of an instance: the installed API documents that hiding a copy or switching tabs does not close it.
- Inspect actual pane/layout/active-tab state for each presentation. Where visibility cannot be established through supported host APIs, conservatively skip rather than poll hidden copies. Document any legacy presentation limitation and verify it natively before claiming support.
- A shared context coordinator coalesces duplicate visible copies. It must release ownership when a copy closes or becomes hidden; a failed owner cannot permanently suppress another copy's refresh.
- Resuming visibility schedules a prompt background check, respecting any existing in-flight work. It retains the last displayed review immediately.
- Manual Refresh uses the same stable publication path, forces a fresh check, rereads configuration and repository policy when needed, and does not jump to HEAD. It can coalesce with an existing request rather than start a competing one.

## Cheap probes and expensive data

Separate source discovery/probing, baseline resolution, history, file metadata, selected-file patches, details and comment-status reconciliation.

1. Resolve repository identity once per context/policy generation. Reuse discovered metadata at open.
2. Resolve moving refs/HEAD and baseline once per coherent refresh generation. History base resolution returns commit OIDs without querying trees it does not use.
3. Reuse immutable trees, changed-file lists, patches and commit details by repository plus resolved object identity. A cache keyed only by a moving branch name is insufficient. Retain cache size/byte limits.
4. Load initial history once with the desired feature scope. Preserve loaded-page depth, filters and the current selection on refresh; append/reset pagination coherently when the DAG changes without duplicate rows.
5. If the selected commit's objects are unchanged, do not reload its files or patch merely because HEAD advanced. Comment reachability and history can update independently.
6. For live working-file modes, detect content changes, not merely changes of status labels. Editing an already-modified file must trigger an update, as must editing an already-untracked file. A porcelain status string alone is insufficient. Evaluate status metadata plus batched content hashes for changed paths, covering deletes, renames, mode changes, binary files and symlinks. Bound costly work; if the observation cannot be verified, retain the old display and show an explicit stale/limit state.
7. Reuse a verified working observation across related reads. Replace repeated whole-repository `diff --binary` fingerprints on every file click with a smaller, content-sensitive protocol. Preserve source validation across concurrent agent writes; do not trade the 11-process path for comments attached to the wrong contents.
8. Before publishing a mutable comparison, verify that its relevant observation remained coherent during collection. If files change mid-read, discard/retry boundedly and keep the previous display. Before saving a mutable comment, verify its source is still the displayed observation. No silent relocation.
9. No-op selection and unchanged probes do not notify, publish shared selection versions, reread patches, reset scroll or scan unrelated comment sources unnecessarily.

The exact portable probe commands and coordinator API are implementation choices, to be justified by command-count regressions and source-correctness tests. One global content-stable observation must not be claimed on metadata/timestamps alone.

## Stable UI publication and races

- Background checks use a separate refreshing state, not the global `busy` interaction lock used by current foreground actions. Navigation, typing and scrolling remain available.
- Do not set displayed `patch`, `file`, `comparison` or file list to null/empty while refreshing. Keep prior data visible. A compact indicator can show activity without overlaying the diff.
- A candidate captures context generation, repository identity, selection generation, source endpoints, file identity and diff options. Only matching generations may publish. A late request cannot restore an old tab, file, commit, parent or mode.
- A user navigation during refresh wins. Reuse useful completed cache data, but discard publication for the superseded selection. A poll may update independent history only if its context/history inputs still match.
- Keep the selected file by its stored path/identity, then an unambiguous Git rename mapping when available. Do not select the first file merely because the list was rebuilt. If the path no longer has a diff or was removed, show a clear empty/unavailable state for the retained selection and offer navigation to another changed file.
- If another commit is explicitly selected, replace its file list and keep the same file path selected if it has a diff there. Keep the old diff while loading with a clearly indicated transition; never label it as the new commit's code before the new patch is ready. If the file is absent, show the explicit empty state.
- Unchanged patches retain scroll exactly, native editor focus/caret, split mode, whole-file expansion and selection. Changed patches preserve a source-line anchor where a deterministic mapping is available, otherwise clamp to a nearby valid location without forcing top-of-file. Record the fallback in UI tests.
- An open comment or edited review preview is never cleared or overwritten by refresh. Defer replacing the affected mutable source while its composer is active, show that newer changes are available and keep the draft's original provenance. History and independent data may still update. Saving stale mutable text follows explicit source validation and preserves the text on rejection.
- A Git error, timeout, missing repository or changing worktree retains the last display and input, exposes a compact recoverable stale/error state and retries on a later eligible tick. It does not enter a tight retry loop.

## Focused interface and review progress

Primary UI: Commit, All changes and Uncommitted; aggregate review has an explicit Include uncommitted option. Show a single base label/change entry. Keep refresh prominent, fetch secondary. Remove All branches/Browse branches/Include remotes from ordinary review; retain any necessary remote refs in the baseline picker. Full history, inclusive ranges and author filtering belong in advanced controls. Keep compact details, optional search/path filtering, conditional merge-parent selection, file tree, split/unified, full context and code copy.

Retain manual commit baselines and review checkpoints for subsequent agent rounds. Explain Mark seen as establishing a baseline and never silently mark it on Send. Preserve saved comments and provenance across modes; do not migrate or delete review state because a control moved.

Two-way threads, agent reply ingestion, agent-driven resolve/reopen, a thread CLI and notifications about agent replies are explicitly excluded by the user. Navigation between the user's saved comments is included; it does not introduce a thread protocol. Delivery remains an explicit human-authored feedback message, with the current preview/Copy/Send safeguards.

Add per-file reviewed state and next-unreviewed navigation. Key progress by repository, comparison source and per-file content identity, not filename alone. New file contents become unreviewed; unchanged contents may retain reviewed state under an explicitly equivalent source. Review progress is separate from comment presence, checkpoints and delivery success. Keep clear, bounded persistent state and a reset action.

## Accepted reading and feedback additions

### Syntax rendering and intra-line emphasis

Assess supported native GPUI syntax/source rendering before choosing an implementation. Current Juhas colors whole added/deleted lines in a custom virtual-list diff and separately uses native Editor in Select / copy; the request does not authorize a needless replacement of native capabilities with a second tokenizer. Provide syntax-aware reading in both Unified and Split while retaining inline comments, original source coordinates and selection/copy behavior. Prefer native capabilities when they can meet that contract; otherwise use a small bounded fallback with plain-text rendering for unsupported languages, oversized/minified lines or unavailable highlighting.

Keep parsed/tokenized source independent of theme colors, cache by content/language/parser version, prioritize visible rows, and avoid retokenizing unchanged content on refresh. Token spans must concatenate exactly to original text; display decoration must never enter comments, hashes, copied source or transport payloads. Highlight changed fragments within paired old/new lines locally, without a second Git process. Bound comparison work for very long lines, keep Unicode intact, and fall back to whole-line emphasis when the budget is exceeded. Highlighting is visual evidence of edits, not language-semantic analysis.

### Find in diff, comment navigation and wrapping

Provide find-in-loaded-diff with previous/next match and a result count, independent of history filters. Search actual source text on both sides, excluding gutters, hunk headers and saved-comment bodies; mark which side a match belongs to. Show that search covers loaded context only when the patch is partial or whole-file context has not been requested. Searching and changing matches does not execute Git. Keep query and cursor through unchanged refresh; invalidate obsolete matches when source changes. A matched source range can be revealed without changing the selected commit.

Provide previous/next saved-comment navigation. Resolve the comment's exact comparison/path/side first, retaining the user's unsaved composer through the existing guard. A historical or unavailable source stays explicitly labeled; do not move a comment to a similar current line. Navigation is bounded and does not cycle indefinitely at the ends.

Provide an optional long-line wrapping control, off by default, without altering copied text or code coordinates. Establish native supported row sizing in a focused rendering spike before implementing wrapping in the virtual list. Unified rows and Split pairs must use consistent variable heights so old/new line alignment, inline comment placement, click targets and scroll anchors remain correct. No character-count approximation of painted height may be used as proof of correct wrapped hit targets. Preserve the current horizontal-scroll mode as the default.

### General review comments

Add durable review-level comments with no artificial file/line anchor. Scope them to the repository and review context/source, and preserve their text through project switches, background refresh and preview edits. General-only reviews must be valid and make Submit review available; existing empty-body validation and UTF-8 message limits still apply. Preview clearly separates general feedback from file/line remarks. Include general comments in existing edit/delete/clear and successful-delivery retention rules, and migrate existing drafts without reinterpreting file comments as general comments. Do not create another outbound transport or auto-send on save.

## Accepted broader review options

### Explicit checkpoint of uncommitted work

Extend checkpoints so a human can explicitly capture the currently reviewed working contents and later compare the next round against them, even when the agent commits nothing. Capture staged, unstaged and untracked changes; respect ignored files and current size/snapshot limits. A snapshot represents review content, not a claim that one selected agent authored every change in a shared checkout.

This is an explicit action, never a side effect of opening review, a timer tick, saving a comment or sending feedback. The UI states that it stores a local snapshot. It may write Git objects and a private `refs/git-review/snapshots/<id>` reference, while leaving the real index, HEAD, branches and working files untouched. Use a portable alternate-index capture with cleanup on success/failure; verify source coherence before declaring capture successful. If capture is unavailable, fails or exceeds limits, retain the previous baseline, display and unsaved input and expose an actionable error.

Introduce a distinct working-snapshot checkpoint kind, with captured tree/ref identity and branch/worktree provenance, alongside the existing committed checkpoint kind. Do not pass a tree OID through commit-only ancestry checks or silently reinterpret old checkpoint records. A missing or invalid snapshot is unavailable, not an empty tree. Provide bounded history, explicit deletion and cleanup of owned temporary resources/private snapshot refs; never run automatic `git gc` or delete refs outside the validated owned namespace. Keep explicit snapshots alive while referenced by a review. Any agent-turn integration is optional and uses this same explicit checkpoint contract; installing background hooks is not implied.

### Optional all-files diff and adaptive loading

Add an opt-in all-files view to the existing selected-file view, with file headers, collapse/expand, status and reviewed markers. Each visible source row and inline composer retains its originating file and exact comparison/side/range; header rows cannot be mistaken for code lines. File/comment navigation reveals the appropriate section. Preserve the selected-file view and its current position when returning from the all-files view.

Keep the first selected file on the critical path. Load remaining expanded/near-viewport files incrementally rather than fetching all contents without limits. Adaptive whole-range batching is permitted only when metadata/output budgets make it appropriate and the result preserves rename, binary, mode-only and untracked semantics; reuse batch results for per-file caches. Remove redundant queued requests already satisfied by a batch. Bound loaded rows and bytes using the existing patch/cache limits and show unloaded/limited sections explicitly, never as unchanged files.

Allow bounded neighboring-file prefetch after the selected patch is available: at most one prefetch process at a time and at most two neighboring files for a selection generation. Navigation requests outrank prefetch; stale or oversized prefetch cannot block a selected patch or publish a selection change. Measure representative multi-file review before enabling batching/prefetch by default. These are implementation stages with independent query/memory evidence, not a promise that eager loading is always faster.

### Optional guided reading

Retain guided reading / requirement mapping as an accepted low-priority optional integration, after the deterministic review features. It may group related changed fragments into reading steps and show which changes a task concerns. It must preserve a complete ungrouped diff and list omitted/unsupported sections; generated explanations never mark code reviewed or comments addressed automatically.

Use an explicitly selected existing agent/integration only on human request, with a visible source/task scope and model invocation. No automatic second model call, transcript scraping, new mandatory Claude dependency or hidden generation on open/refresh is part of ordinary review. Tie explanations to source content, visibly mark stale explanations after edits, retain applicable read progress by content, and bound persisted generated data. The provider contract can be designed separately before this optional stage; core review must work without it.

## Limits and portability

Keep native GPUI JavaScript and existing supported-platform boundaries. The installed `herdr.exec` documents a 30-second timeout and 8-MiB output limit per command; it exposes no per-call timeout/capture options in the current generated declaration. Investigate actual supported behavior before promising tighter subprocess controls. Any request-level deadline must also reject late publication and not start further child queries; a Promise timeout alone does not cancel the underlying process.

Keep explicit patch truncation/limit states, no silent truncation in review messages and no automatic Git maintenance. Rename detection remains correct by default; measure representative moves before choosing a threshold or optional fast path. Do not add a Unix-only helper to a Windows workflow.

## Delivery boundaries

Implement in separately testable stages on the current branch: (1) Git query/cache boundaries and resource-budget evidence, (2) stable refresh and visibility lifecycle, (3) focused modes plus aggregate working-file/empty-repository review, (4) reviewed progress and general comments, (5) native syntax assessment, intra-line emphasis, find/comment navigation and wrapping, (6) explicit working-snapshot checkpoints, (7) optional all-files view and measured bounded batching/prefetch, (8) optional guided-reading integration. Each later stage remains usable independently of optional integrations. Write executor-ready task plans before product implementation; the user has approved the feature scope, so do not repeat the scope approval question merely because tasks are split into stages.

The [community catalog comparison](community-review-mods-comparison.md) records the source evidence and the user's subsequent decision: include the useful reading/performance/checkpoint additions and exclude two-way threads. hq-deck and Spend remain partial architecture references, not code to transplant or proof that all native visibility cases work. Repository-administration, PR-host dashboards, multi-agent management and document approval remain outside this focused review design.

## Acceptance evidence

- Real-Git fixtures count calls for no-op refresh, cold/warm commit navigation, aggregate endpoint changes and mutable-file navigation, with and without comments. Assert meaningful query reductions, not machine-specific elapsed-time promises.
- Deterministic delayed-runner tests: background refresh does not clear old data or set the foreground busy flag; navigating during a request wins; tab/repository/mode changes reject old publication; ticks coalesce; close/hidden/inactive views start no Git work.
- Selection tests: new HEAD leaves a pinned old commit/file/diff unchanged; aggregate HEAD updates while retaining a file; explicit commit switch preserves a matching file; unavailable/deleted/renamed files follow the fallback contract; selected merge parent remains stable.
- Working tests: staged, unstaged and untracked changes, combined committed/dirty changes, empty repositories, binary/mode-only/rename cases, dirty-to-dirty edits, identical-size edits, edits during capture, source edits while composing and read errors preserve correct provenance and unsaved text.
- Presentation tests: unchanged refresh preserves scroll, focus, caret, filters, loaded history pages, whole-file expansion, split mode, pending composer and edited review preview. Updated content uses the defined anchor fallback.
- Progress tests invalidate reviewed state by actual source/content changes and preserve it through unchanged refresh; next-unreviewed skips reviewed files and stops at boundaries.
- Reading tests preserve raw text/anchors through syntax and intra-line decoration, unknown-language/oversized-line fallback, theme changes and Unicode. Search checks both sides, match navigation and incomplete-context labeling without Git; comment navigation checks unavailable sources and an existing composer. Native wrapping verification checks actual variable row geometry, Split alignment and click-to-source coordinates.
- General-comment tests cover a general-only review, restart/context persistence, mixed general/file/line feedback, edited preview retention and deletion/clear/delivery identity rules. Confirm that no agent reply/resolve interface was introduced.
- Snapshot tests prove staged/unstaged/untracked coverage, ignored-file exclusion, same-size edits during capture, portable cleanup on errors, a byte-identical real index and unchanged HEAD/branches/worktree, correct checkpoint kinds, private-ref ownership and unavailable/deleted snapshot behavior. Snapshot writes must be absent from automatic refresh.
- All-files/prefetch tests cover cross-file anchors, collapsed/unloaded/limited sections, cached return to selected-file view, batch de-duplication, query concurrency and selected-file priority. Optional generated reading stays off until explicitly requested and retains the raw diff when unavailable, stale or over budget.
- Run `npm test`, `npm run check` and `git diff --check`; inspect native Windows behavior separately for timer lifecycle, visible/hidden views, focus, scrolling and responsiveness while Git is deliberately delayed. A module check does not establish these interactive properties.
- Report Windows native verification and any other platform tests separately; do not claim a measured 100-ms UI guarantee from process counts or screenshots.
