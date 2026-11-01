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
- `herdr-app check mods/git-review` in addition to actual screenshot inspection; check alone missed runtime API assumptions, which were corrected.
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

Local automatic base rules: generic capture/replacement rules are supported, with manual-base precedence, explicit return to automatic choice, remote-only candidates and a picker for missing/ambiguous candidates. Personal rules are loaded from the optional Herdr-home `git-review.json` file, outside source repositories and the release allowlist. The local rule was separately checked against an existing worktree using read-only Git calls. Malformed configuration is surfaced; native missing-file null responses and OS missing-file errors are covered. The intermediate full suite passed 64 tests.

Submission editor update: the full suite now passes 75 tests with no failures or skips. Tests cover unambiguous project/tab agent selection, rejection of finished/child/unrelated sessions, single-repository grouping, optional code quotes, original revision/location retention, exact edited text delivery, recipient changes and copy behavior, persisted edits, byte limits, empty/context-mismatched submissions, deduplication and preservation of source comments after free-form edits. Transport and clipboard actions were mocked in tests; no review was sent to a user's agent and no real clipboard was overwritten.

The installed personal layout was inspected with an existing four-comment session. It selected the associated agent automatically, showed a compact editable review, and placed Send/Copy/Cancel at the bottom outside the editor. Both source repositories and the installed mod contain matching modules. Existing unrelated layout/SSH errors remain outside this change. Screenshots and project-specific rule contents are private evidence and are excluded from release artifacts.

Optional Git context follow-up: the preview now defaults to file/side/line/comment text, with an independent **Include Git context** toggle for repository and full comparison headers. Outdated comments preserve the original revision for the commented side even without those headers. The setting survives preview reopen, changes message identity/byte count when regenerated, and never overwrites manual edits implicitly. Seventeen focused submission/package tests and four existing delivery regressions passed. Native check passed, source/installed hashes match, and the running personal layout showed the new toggle with context omitted. The existing four-comment example decreased from 417 to 281 UTF-8 bytes; this is a byte measurement, not a tokenizer count. No real send or clipboard write was performed.

Native component migration: action controls now use Button, binary generation/remote options use Checkbox, pressed display/filter controls use Toggle, and comparison/history/diff choices use Tabs/Tab. Native Popover owns branch/recipient popup presentation and dismissal while retaining virtualized rows. One shared theme adapter supplies the unstyled primitives' appearance. Twenty-seven focused control/submission/presentation/installer/package tests and four existing native synchronization/delivery regressions passed. A native component probe and installed-mod check passed. The running personal layout was visually inspected with the comparison/history tabs, Remotes checkbox, tree toggle and an open branch popup; no new review-mod errors were reported. No transport or clipboard side effects were exercised against a real recipient.

Initial repository publication preparation: the complete local suite passed 85 tests with no failures or skips. Staged-source checks found no organization-specific rules, private local paths, credentials, screenshots, session data or workflow notes; local Markdown links resolve. A self-contained design brief is included with the repository and release allowlist. Hosted CI results remain distinct from this Windows verification.

## Release acceptance still requiring separate evidence

- Native UI verification on macOS/Linux; remote CI must run after a repository is published.
- Exact warm input-to-frame p95 and cold full-view performance budgets; current measurements are separated Git/cache timings.
- Large real-world graph scrolling and all themes at multiple display scales on each supported platform.
- Author's public license choice. No community source was copied; see THIRD_PARTY_NOTICES.md.

Do not describe declared CI coverage, source inspection, or a mod check as completed cross-platform native testing. A core send acknowledgement means delivery to a terminal, not completion by an agent.
