# Agent review implementation plan

> Execute on the current branch using TDD at the listed seams. Independent file-owned tasks may run in parallel under dispatching-parallel-agents; integrate and independently review the final diff before committing. No install, merge or push.

**Goal:** Implement the approved native review workflow with efficient Git reads, visible-only stable refresh and content-correct feedback/progress.
**Spec:** [agent-review-refresh-design.md](agent-review-refresh-design.md).
**Architecture:** Separate immutable Git data and content-sensitive working observations from the displayed selection. Pure reading/feedback models feed the existing GPUI renderer; a visible-view scheduler fetches candidates and only publishes matching generations. Preserve existing APIs and stored drafts.
**Stack:** Native GPUI JavaScript, Git, Node test runner; portable explicit snapshot capture through existing platform execution.

## Global constraints

- Stay on `feature/native-pane-integration`; baseline `204bd7a`. Preserve prior comment fixes; remove only the two requested comparison reports.
- No two-way threads or reply/resolve protocol. No network fetch on a tick. No automatic Git object writes except the existing explicitly requested checkpoints.
- 15,000-ms visible-only checks, no overlapping refresh, stale publication rejected, selected SHA/path and unsaved input retained.
- Existing 4-MiB/20,000-row patch, 64-entry/64-MiB cache and 16,000-byte transport boundaries remain explicit. Host exec has 30-second/8-MiB bounds.
- Unknown/large syntax or expensive line comparisons fall back to plain text; changes to display never change source anchors or copied text.

## Review focus

- Content changes with identical status/numstat/size must refresh working sources and invalidate reviewed state.
- A user selects another file/tab while Git is delayed; old results never relabel or replace the new selection.
- Hidden/zoomed-away copies and duplicate copies must not poll; keyboard focus in an adjacent terminal still permits visible review refresh.
- Snapshot failures preserve the real index/HEAD/worktree and clean only owned temporary files/refs.
- Existing stored drafts, empty repositories, binary/mode-only changes and a general-only review remain usable.

## Task 1: Git data and stable candidate refresh

**Owner files:** `controller.js`, `comparisons.js`, `diff.js`, `history.js`, `git.js`, new working-observation helper, focused backend tests. Do not edit main/UI/feedback/snapshots files.
**Interfaces:** Existing Controller API retained. Add `refresh({preserveComposer=false}={})` (candidate publication without clearing display), `refreshing`, `refreshError`, `branchChanged`, `sourceUnavailable`/`newHead` state as needed; optional `openRepo(machine,folder,{repo,loadHistory=true}={})`. Aggregate scopes accept `includeWorking:true`; working-tree supports empty HEAD. File metadata includes immutable content/mode identity for reviewed markers. `resolveBase(run,repo,baseRef,targetRef='HEAD')` returns commit OID only.

- [x] Write and run failing real-Git query/correctness tests for cheap base resolution, combined dirty+committed/untracked and empty repositories; verify RED.
- [x] Implement content-sensitive working observations, reuse untracked list and metadata, preserve before/after source coherence while reducing full binary patch fingerprint work.
- [x] Write delayed-runner tests for pinned commit preservation, aggregate selected-path restoration, missing-file state and superseded refresh; verify RED then implement staged publication/caching.
- [x] Verify focused tests including existing regressions. Record behavior changes in ledger. No commits until parent integration.

## Task 2: Feedback, progress and explicit snapshots

**Owner files:** `review.js`, `submit.js`, `storage.js`, new `progress.js`, `snapshots.js`, helpers/tests as needed. Do not edit Controller, main or UI.
**Interfaces:** `generalTarget(comparison)` in own module or review.js creates `{scope:'general',repoKey,root,comparisonId,...}`; buildBatch accepts general-only drafts. `fileReviewKey(comparison,file)` and `reviewedState(session,comparison,file)`, `setFileReviewed(session,comparison,file,checked)`, `nextUnreviewed(files,session,comparison,currentId,direction=1)`. Snapshot exports `captureWorkingSnapshot(exec,repo,{branch,...})`, `deleteWorkingSnapshot(exec,repo,checkpoint)` and distinct `{kind:'working-snapshot',treeOid,refName,repoKey,branch,id,...}`; preserve existing commit checkpoints and expose `checkpointBaseline` for tree/commit distinction. Parent integrates actions/selection.

- [x] RED→GREEN meaningful tests for general-only/mixed feedback, precise empty validation and unchanged delivery rules; progress identity includes old/new contents/mode/path semantics.
- [x] RED→GREEN real-Git snapshot tests with staged/unstaged/untracked, no initial commit, ignored files, failure cleanup, index/HEAD/worktree unchanged, valid owned-ref deletion only.
- [x] Implement portable explicit capture via alternate index; no timers call snapshot APIs. No foreign runtime dependency or Unix-only Python.
- [x] Run focused suites and give exact integration interface to parent. No commits.

## Task 3: Reading models and native diff presentation

**Owner files:** `ui.js`, new `reading.js`/reading view if necessary, focused rendering tests. Do not edit main, Controller or feedback/progress files. Can update existing UI harness dependencies when necessary.
**Interfaces:** Optional view methods/fields must gracefully default for existing tests: `readingOptions`, `findQuery`, `findMatches`, `findIndex`, `setFindQuery`, `moveFind`, `toggleWrap`, `isFileReviewed`, `markFileReviewed`, `moveUnreviewed`, `generalComment`, `navigateComment`, `allFiles`, `toggleAllFiles`, `requestAllFiles`. Main implements callbacks. Rendering retains pure source rows and exact comment anchors.

- [x] RED→GREEN syntax/intra-line/search models (Unicode, budget fallback, unchanged token cache, no text mutation).
- [x] Assess native Editor API before fallback. Main diff requires inline anchors; use native-supported rich spans or bounded tokenizer where Editor cannot embed comment rows.
- [x] Integrate syntax, local intra-line emphasis and matching source ranges, toolbar find controls, comment navigation and optional wrapping with valid variable-row layout; keep existing virtual-row no-handler invariant.
- [x] Simplify history menus: ordinary feature history, advanced-only full/all/browse/remotes/author/range where retained; keep one base change control supplied by main. Add optional file-progress controls and general-comment action with guarded callbacks.
- [x] Add opt-in multi-file view with per-file identity, incremental loading and explicit limited/unloaded sections; coordinate main contract early. Run focused tests and report native constraints. No commits.

## Task 4: View lifecycle and integration

**Owner:** parent; `main.js`, new `refresh.js`, config/tests. Integrate interfaces from Tasks 1–3 after they land.

- [x] RED→GREEN pure visible-state and coalesced scheduling tests (15,000 ms, close/hidden/tab/zoom/no-focus-needed, duplicate contexts, in-flight/late publication).
- [x] Wire lifecycle timer and stable manual refresh; keep input/scroll/current file on background work; freeze mutable composer context until explicit validation.
- [x] Avoid duplicate startup history/repository reads; primary Commit/All changes/Uncommitted, combined toggle, explicit base/checkpoint fallback, unavailable-source and branch-change actions.
- [x] Wire durable general comment editor, Viewed/navigation and explicit snapshot create/delete/baseline selection. Integrate independent readings/find/wrap/multifile controls and bounded prefetch.
- [x] Add explicit optional guided-reading request/result integration using the existing selected agent, source-bound cached explanation and no automatic model call. Raw review stays usable without generation.
- [x] Run focused view/workflow tests while integrating; correct old tests only when their behavior was intentionally replaced, retain regression intent.

## Task 5: Acceptance, review and commits

- [x] Update usage/performance documentation and complete spec coverage ledger with actual supported limitations; no comparison reports.
- [x] Run `npm test`, `npm run check`, `git diff --check`; inspect changed code and native supported rendering through a disposable test home if possible without installing into the user's live environment.
- [x] Independent review of standards and spec against baseline `204bd7a`; fix important findings with regression tests and rerun affected checks.
- [x] Commit scoped implementation/documentation on current branch; report actual test/native evidence, remaining optional integration limitations and clean status. Do not merge or push.


## Integration review and evidence

The implementation includes the approved follow-up: a per-space repository/worktree review tab, cross-project manual agent delivery with a compact source-root header, saved-comment code navigation separate from Edit, and comment-count rendering invalidation. Two comparison reports were removed as requested; no reply/resolve protocol was added.

Independent final review found and drove regression fixes for wrapped-list clicks, include-working state transfer, collapsed-section comment navigation, same-space cross-project headers, nested Git budget propagation, and private snapshot-ref validation. Focused backend/controller/message checks passed 27 tests after those fixes. Native-control callback checks passed 21 tests; presentation/feedback checks passed 10. Final verification: `npm test` passed 227/227; `npm run check` passed; `git diff --check` passed. The independent reviewer verified all reported fixes and found no remaining blocking issue within that review scope.

Native acceptance remains separate: no installation into the user's running app was performed. The new measured-row wrapping geometry, hit coordinates, native tab interaction and scroll behavior need a running-app check. Source selection and loaded data transfer are implemented; pixel-exact viewport transfer into a newly created tab is not. Snapshot PowerShell and Git-for-Windows sh paths were exercised on Windows; native Linux/macOS and live SSH were not verified. These are explicit validation boundaries, not claimed native passes.
