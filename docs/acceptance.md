# Verification and acceptance

## Automated coverage

Run `npm test`. Tests use disposable real Git repositories, not private repository fixtures. Covered cases include linked worktrees, canonical paths, generic configuration, root/merge/branch/range comparisons, SHA-256, history pagination/search/ref selection, Unicode and literal filenames, rename, binary changes, untracked/ignored files, bounded cache, stale file/history requests, checkpoint refs, persistent draft serialization, multi-repository message formatting, in-flight duplicate submission and uncertain delivery.

The installer is exercised against disposable Herdr homes; the original layout stays byte-for-byte unchanged and repeated installation produces a backup. The workflow declares three operating systems; only the local Windows run is currently evidenced here.

A fresh independent review identified five correctness problems. Regression tests reproduce them and cover the fixes:

1. Shared views now carry resolved comparison endpoints instead of reinterpreting HEAD independently.
2. A successful send removes only drafts whose exact sent snapshot is unchanged; edits during delivery remain saved.
3. Review identity includes source commit IDs as well as trees, so amend-only rewrites make old comments outdated.
4. History generation gates reject late responses and duplicate pagination.
5. Mutable working-tree state is revalidated before and after patch loading, and before saving a comment.

A native refresh test additionally exposed work started directly on the render stack. Shared-state reconciliation is now deferred to an event callback; the regression test covers scheduling, and a new synthetic commit was visibly synchronized to both views in the running application.

## Native verification environment

Use an isolated `HERDR_APP_HOME` and `HC_SESSION`. Do not drive the user's active agent terminal. Test source data is a synthetic cart repository with a base commit, feature commit and documentation commits. The initial layout probe ran with Herdr 0.1.10; full-mod native verification ran with 0.1.11 on Windows. Exact private paths and screenshots are not included in distribution files.

Native checks performed during implementation:

- Rendering two independent mod copies in sidebar and full review card, including deferred virtual history/file/diff rows and graph paths.
- Switching the work-area stack between terminal and full review without terminating the terminal; sidebar stays available.
- Opening a historical file and displaying its unified patch in both copies.
- Creating a file comment, editing retained text including Polish characters, synchronizing its composer across copies and saving it as a durable draft.
- Reloading the mod while retaining session state.
- `herdr-app check mods/juhas` in addition to actual screenshot inspection; check alone missed runtime API assumptions, which were corrected.
- Sending a synthetic message to a deliberately created echo/sink terminal in the isolated core session; core acknowledgement and echoed text were inspected.
- Submitting two saved comments through the actual UI to the isolated sink: recipient selection, exact batch preview, acknowledgement, sent history and removal of unchanged submitted drafts were inspected.
- A raw-mode sink with bracketed paste enabled confirmed multiline and Unicode delivery, including the expected paste framing and final Enter. A plain cooked-mode terminal is not representative of an interactive coding agent's multiline input.
- Refreshing the selected HEAD after a synthetic commit and visibly confirming the same resolved revision in sidebar and full card.
- Commenting on an entire four-line hunk, saving it, viewing the saved comment inline beneath its last line, and delivering the exact quoted range through the UI to the raw-mode sink.
- Installing through the actual installer against a sandbox copy of the shipped main layout, switching to the generated full card, and inspecting the empty-repository state in both views with no runtime errors.

Final local verification: 38 tests passed, 0 failed or skipped; `herdr-app check` passed. The independent review's findings and native-integration regressions have executable coverage. The original user's Herdr configuration was not used as the installation target.

Integration update: Review now lives beside Files/Changes in a personal tabs clone and opens their existing right-hand panel. Expand selects the full work area; Back to sidebar restores the terminal and the same panel. This update was installed into the user's Herdr after their request. Both native mod checks passed. The expanded/returned views were inspected, and migration from an older saved hidden review-child state is covered by regression testing. The suite passed 40 tests; six focused presentation/installer/package tests were rerun after the final integration changes and passed.

Context and native appearance update: the suite now passes 47 tests, with no failures or skips. Actual project switching and restoration were verified in an existing personal layout, including a linked Git worktree. Review follows the active space/tab directory, preserves that context's selection and composer, and ignores stale terminal focus from another tab. A direct Git context has no repository chooser; parent contexts offer only their discovered repositories and only if there is more than one. Choosing a repository resets incompatible refs and search filters. The full view's diff is below the history/files area across its entire width. Native frame/background/border/header conventions match the installed Files/Changes panels. Existing layout and tabs/Files/Changes sources were preserved during this update.

Review refinement update: the full suite passes 56 tests, with no failures or skips. A final focused graph test also passes after verifying all-branch pagination and hash search. Coverage includes per-space expanded-state restoration with delayed layout updates, explicit range endpoints and cancellation, tree collapse, split-row anchors, file statistics, unchanged context, full commit metadata and a real fetch from a local test remote. Fetch preserves the checked-out branch and working tree. File metadata and line counts still require one Git process; cached revisits require none.

In the running personal layout, screenshots verified the compact segmented mode control, header SVG icons, colored files/statistics, branch picker without the previous render error, collapsible tree and side-by-side diff. Native mod and tabs checks pass. Dividers use native resizable groups. Tooltip rendering was observed. Fetch was tested against a local fixture, without fetching a user's production remote. Shift/drag range selection and implicit split-row side detection are deliberately not emulated; explicit range endpoints and an old/new comment-side selector expose the current runtime limits. Repository/manual-ref controls remain available behind `showAdvanced` and are hidden by default.

Local automatic base rules: generic capture/replacement rules are supported, with manual-base precedence, explicit return to automatic choice, remote-only candidates and a picker for missing/ambiguous candidates. Personal rules are loaded from the optional Herdr-home `juhas.json` file, outside source repositories and the release allowlist. The local rule was separately checked against an existing worktree using read-only Git calls. Malformed configuration is surfaced; native missing-file null responses and OS missing-file errors are covered. The intermediate full suite passed 64 tests.

Submission editor update: the full suite now passes 75 tests with no failures or skips. Tests cover unambiguous project/tab agent selection, rejection of finished/child/unrelated sessions, single-repository grouping, optional code quotes, original revision/location retention, exact edited text delivery, recipient changes and copy behavior, persisted edits, byte limits, empty/context-mismatched submissions, deduplication and preservation of source comments after free-form edits. Transport and clipboard actions were mocked in tests; no review was sent to a user's agent and no real clipboard was overwritten.

The installed personal layout was inspected with an existing four-comment session. It selected the associated agent automatically, showed a compact editable review, and placed Send/Copy/Cancel at the bottom outside the editor. Both source repositories and the installed mod contain matching modules. Existing unrelated layout/SSH errors remain outside this change. Screenshots and project-specific rule contents are private evidence and are excluded from release artifacts.

Optional Git context follow-up: the preview now defaults to file/side/line/comment text, with an independent **Include Git context** toggle for repository and full comparison headers. Outdated comments preserve the original revision for the commented side even without those headers. The setting survives preview reopen, changes message identity/byte count when regenerated, and never overwrites manual edits implicitly. Seventeen focused submission/package tests and four existing delivery regressions passed. Native check passed, source/installed hashes match, and the running personal layout showed the new toggle with context omitted. The existing four-comment example decreased from 417 to 281 UTF-8 bytes; this is a byte measurement, not a tokenizer count. No real send or clipboard write was performed.

Native component migration: action controls now use Button, binary generation/remote options use Checkbox, pressed display/filter controls use Toggle, and comparison/history/diff choices use Tabs/Tab. Native Popover owns branch/recipient popup presentation and dismissal while retaining virtualized rows. One shared theme adapter supplies the unstyled primitives' appearance. Twenty-seven focused control/submission/presentation/installer/package tests and four existing native synchronization/delivery regressions passed. A native component probe and installed-mod check passed. The running personal layout was visually inspected with the comparison/history tabs, Remotes checkbox, tree toggle and an open branch popup; no new review-mod errors were reported. No transport or clipboard side effects were exercised against a real recipient.

Initial repository publication preparation: the complete local suite passed 85 tests with no failures or skips. Staged-source checks found no organization-specific rules, private local paths, credentials, screenshots, session data or workflow notes; local Markdown links resolve. A self-contained design brief is included with the repository and release allowlist. Hosted CI results remain distinct from this Windows verification.

Juhas naming update: the distributable mod is `mods/juhas`, the visible product label is Juhas and commands use the `juhas.*` prefix. Installer layout/tabs names, package metadata, asset/helper paths, documentation and tests use the new name. Personal `juhas.json` configuration takes precedence; a missing new file falls back to the old configuration name, while malformed new configuration is surfaced. Existing shared-state/checkpoint namespaces and layout block identifiers are deliberately unchanged to preserve saved work. The full suite passed 88 tests without failures or skips; native mod checks passed after updating an existing personal layout without regenerating it.

Compact file tree: single-child directory chains with no direct files are rendered as one slash-separated row. Direct files or branching stop compaction. Folder labels include the number of changed files in the complete subtree, including collapsed descendants. Counts are computed while building the existing in-memory tree, without extra Git reads. Existing collapsed paths remain recognized after compaction; reopening clears the compressed chain's aliases. Four tree-model tests, four native control tests and the existing tree regression passed. Installed native mod check passed. The running sidebar was visually checked with compact directory names and muted subtree counts.

Diff controls and annotations: all toolbar mode/filter/side selectors now use grouped native Buttons. Previous/next change navigation wraps through changed groups in the selected file using a retained native virtual-list scroll handle, without Git reads. Comments render as bounded cards below their anchors and on the matching split side; annotations do not break old/new replacement pairing. The full suite passed 100 tests; after final presentation changes, 30 focused tests passed. Source and installed native mod checks and a synthetic long-line/comment-card native check passed. The running Windows view was inspected with grouped controls and a working change counter. Independent horizontal scrolling for split sides remains unavailable through the current complete JS API and was not emulated; the shared scroll surface is constrained to the diff viewport.

## Release acceptance still requiring separate evidence

- Native UI verification on macOS/Linux; remote CI must run after a repository is published.
- Exact warm input-to-frame p95 and cold full-view performance budgets; current measurements are separated Git/cache timings.
- Large real-world graph scrolling and all themes at multiple display scales on each supported platform.
- Author's public license choice. No community source was copied; see THIRD_PARTY_NOTICES.md.

Do not describe declared CI coverage, source inspection, or a mod check as completed cross-platform native testing. A core send acknowledgement means delivery to a terminal, not completion by an agent.

## Simplified agent review workflow

The default UI now has Commit and All changes. All changes reuses existing branch, exclusive range and since-review comparisons against HEAD. Its branch/manual/checkpoint source is retained across individual commits and synchronized between sidebar and expanded views, including comparisons whose tree IDs coincide. Legacy inclusive ranges and working-tree comparisons remain behind More; History options retain full/all/ref browsing, remotes, details and search.

Feature history excludes merge-base ancestors while preserving topology, merges, filters and pinned pagination. Missing or ambiguous bases fall back to HEAD history and require the existing explicit picker for All changes. Configured rules and per-worktree/branch overrides remain generic and unchanged.

Draft validity is independent of comparison visibility. Original revisions, sides, ranges and quotes remain unchanged. Original committed targets must remain reachable from HEAD; mutable snapshots retain strict fingerprint checks. Git execution errors surface without relabeling existing notes. This verifies source context, not whether later code addressed the feedback. New checkpoint branch metadata is additive within schema version 1. Automatic selection checks live branch, worktree and ancestry; legacy branchless checkpoints remain accessible by explicit ID. Mark seen displays and records the selected committed target, not an unrelated newer HEAD. Submit review is disabled for an empty current-repository draft set; recipient, preview, transport and deduplication behavior are unchanged.

Native Windows verification used an isolated repository and dedicated review sessions. Expanded Commit and final All changes diff, a 340-pixel sidebar, disabled empty Submit and History's native popover were inspected from window frames. Popover states were opened programmatically in a disposable test mod, not by a mouse end-to-end test. Computer Use's native pipe was unavailable. No real branch, working tree, checkpoint or private configuration was changed and no feedback was sent. Cross-platform native verification and performance budgets remain separate gates.

Final verification: npm test passed 115 tests, with no failures or skips. After the final per-project baseline restoration fix, 7 context/workflow tests passed. Source and installed native checks passed. The native Compare from menu and commit-base list were also rendered and inspected in the disposable probe. Test tabs were closed and the probe archived outside installed mods; deployed source modules match the repository. No test review was sent.

## Inline feedback and submission refinement

Line comments now use one retained native InlineEditor entity inside the virtual diff list. Add and edit share the same Textarea state/component. Saved annotations have compact, bounded row heights and scrolling overflow. Explicit side/line anchors, reverse ranges and split replacement pairing are retained. File comments remain available for binary and mode-only changes. A labeled source-context fallback permits editing unavailable historical anchors without relocating them; body-only updates of outdated notes preserve their stored source fields/status and reject changed anchors.

Unsaved text persists with its original comparison through file, scope and view changes. Resume restores that source, including on-demand context. Save captures the requested text while retaining newer typing that arrives during validation. Reopening an already edited draft preserves that typing; an unchanged saved editor does not trigger an unsaved warning. Submit offers Save and continue / Skip for this review / Back; Skip retains the composer. Preview refuses a stale project context before choosing an agent.

Generated feedback retains side/range and compact source IDs independently of a moving HEAD. Full Git headers and full code quotes remain optional and default off; overlapping revisions, mutable snapshots and outdated feedback receive bounded automatic excerpts where needed. Original draft snapshots, transport byte limits, edited-preview behavior and delivery deduplication are retained. Mark seen still saves the exact displayed committed target, independently of sending.

The diff toolbar's rightmost native menu contains Whole file and Select/copy; Comment and Refresh use SVG icons. The preview uses Review · N comments, a readable recipient/automatic-selection header, an editable native message and fixed Send/Copy/Cancel footer. Public release allowlisting includes the new retained editor and its required icons.

Verification: npm test passed 130 tests (no failures/skips). After the final UI/source-click guards and unchanged-editor refinement, 44 focused composer, message, native-control and packaging tests passed. Source and installed herdr-app checks passed. Native Windows frames were inspected for expanded and narrow Unified/Split, compact saved cards, the inline editor, unsaved-review decision and editable review preview with an automatic fixture recipient. The fixture blocked sending and checkpoint creation; no real review was sent. This is native rendering verification, not a mouse-driven end-to-end test. The original shared horizontal scroll and explicit Split side selector remain; no pointer/wheel interception or runtime patch was added.


Review follow-up: the full suite passed 145 tests with no failures/skips. Deterministic tests cover out-of-order base resolution, clearing a pending base, resolved-DAG commit counting/cache, repository/status/source comment filtering and native filter controls. Native rendering was inspected with synthetic data in expanded/Split and a 360-pixel sidebar/Unified, including count/loading labels and filtered comments. The temporary overlay and its exact owned layout block were removed; runtime status reported no errors afterwards. Computer Use's native pipe was unavailable, so this is rendering verification plus controlled-handler tests, not a mouse-driven end-to-end run or a real app restart. No agent feedback was sent and no real checkpoint, branch or working tree was changed.

Final focused verification passed 50 tests, plus a real-Git scenario asserting one commit in Commit mode, two commits in the final branch comparison and one in an exclusive manual range. Optional count failures retain the review comparison and expose the count error; browsing filters do not reduce the submission batch. The in-memory view-cache generation was bumped for the added summary fields; durable session/selection schema remains compatible.
