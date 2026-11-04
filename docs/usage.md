# Using Juhas

Start with the [quick introduction](../README.md) or use this guide for the full workflow, configuration and local-data details.

## Review workflow

1. Click **Juhas** beside **Files / Changes**. It follows the active project/tab directory. A direct Git context selects its repository automatically. With `showAdvanced: true`, parent contexts can choose only repositories below the current directory.
2. Expand opens or reuses a dedicated review tab for this repository/worktree in the current space: History + Files above the diff, with native resizable panels. It keeps the source repository when another terminal changes directory. Return selects the source tab. History defaults to commits after the configured branch's merge-base, falling back to HEAD history if no base is resolved. Details and search stay available; full/all-branch browsing belongs to `showAdvanced` controls.
3. Choose between two modes:

   | Mode | Meaning |
   |---|---|
   | Commit | Default: HEAD versus its parent. Click any history commit to review that commit. Merge commits expose a parent selector. |
   | All changes | Final tree difference against HEAD. Compare from Base branch (merge-base), Last review checkpoint, or Choose commit (changes after that commit, excluding the commit itself). |
   | Uncommitted | HEAD versus current files, including new files; also available before the first commit. |

All changes remembers its baseline when you visit individual commits. **Include uncommitted** adds later working-file changes to that aggregate diff. **Base branch** reuses local configuration and manual override; **Change…** opens a searchable branch list and allows returning to automatic selection. Typing filters loaded refs without querying Git. The branch filter has a fixed single-row height and receives focus after the popover opens. Missing or ambiguous bases never block Commit review. No branch naming convention is built in. More review options holds Fetch, baseline management, resetting Viewed and explicitly requested guided reading. Inclusive ranges remain advanced. Working-tree safeguards still apply; Shift/drag range gestures are not emulated.

Files can be shown as a flat list or collapsible tree. Tree view compacts single-child folders without direct files into paths such as `Client/Pages/Clients` and shows the number of changed files in each subtree, with status colors, added/deleted line counts and comment badges. **Details** shows the selected commit message, author, email, date and refs. The header fetch button runs `git fetch --all --prune` and refreshes the review.

**Unified / Split** is a group of native buttons that changes the diff display. **↑ / ↓** navigates contiguous changed groups and continues into the next/previous file at file boundaries, skipping files without text changes and stopping at the review boundary, using a retained native scroll handle. Toolbar mode/filter/side choices use button groups rather than tabs. In side by side mode, **Comment: old / new** chooses the side used by a row click, because native virtual rows expose one click target per row. **Whole file** in the single-file header loads unchanged context within patch limits. The rightmost **⋯** menu contains **Select / copy selected file**.

Commit Details retains its compact native text layout; the copy icon beside the SHA copies the full commit ID. **Select / copy** opens loaded code fragments in a native read-only editor with selection and standard copy shortcuts; Original/Modified chooses the source side, and Copy all excludes diff markers. Unloaded gaps are separated by blank lines. Use Whole file first when you need all available context. The virtualized diff itself keeps row clicks for review comments; it does not emulate cross-row text selection.

4. Click a code line to write a comment. Click a second line on the same side to select a range, click a hunk header to comment on its lines, or use **Comment** in the diff toolbar. The native comment editor appears directly below the selected line, on the matching side in Split. Clicking a saved card edits it with the same retained editor. Saved cards have compact, bounded heights and scroll long feedback. **Save comment** adds the draft; it sends nothing. Review comments are saved locally, including their original revisions, side, line numbers and quoted code. Unsaved text also retains the original comparison when navigating away; Resume returns to it. If the original line or revision is unavailable, an explicitly labeled source-context editor keeps the original anchor instead of relocating it. Editing an outdated comment changes its body while preserving its provenance/status.
5. Inspect **Comments**, edit or delete them (or **Clear all**), then **Submit review**. If a comment is still unsaved, Save and continue includes it, Skip omits it from this review while retaining its text, and Back returns to editing. The preview shows **Review · N comments**, the recipient and automatic/manual selection. The unique agent in the active project tab is selected automatically; if that tab has no agent, a sole agent in the project may be selected. Ambiguous matches require a choice. **Change** selects another project agent; the **All live terminals** checkbox in the recipient popup exposes an explicit fallback. Shells, finished sessions and child workers are never automatically selected.

   The preview includes only the current repository's saved comments. File paths are grouped once. New-version line/range references omit a side label (`42: ...`); original lines use `old:19-22: ...`. Rename paths, ambiguity context and outdated markers remain. There is no explanatory legend. **Include Git context** is off by default; enabling it adds repository paths and full comparison revisions once per group. Outdated comments retain the original revision for their commented side even when Git context is off. Full code quotes are omitted by default. Comments at distinct locations omit source IDs, even across multiple commits. Overlapping locations from different revisions automatically include compact source IDs and bounded excerpts; working snapshots and outdated feedback retain the context needed to identify their original source. Full provenance remains stored regardless of preview options. **Include code** adds full quotes. Both generation options preserve manual text edits until you explicitly use **Regenerate**. No tokenizer-specific count is claimed: the footer shows exact UTF-8 bytes and the transport limit remains enforced.

   Edit the final message directly, use **Copy**, or press **Send review** to send exactly that text. Changing the recipient preserves edits. Cancel/reopen restores the edited preview for that project context. **Regenerate** deliberately replaces the edited message with a fresh version from saved comments. After free-form edits, sending retains source comments because their presence in the edited text cannot be inferred reliably; an unedited message clears only unchanged comments included in that batch. Send/Copy/Cancel stay in a fixed bottom row while the editor scrolls. Review text is never silently truncated.
6. **Mark seen · SHA** records exactly the displayed committed target, even without comments. Its tooltip shows the full SHA. It does not send feedback, approve changes or silently mark a newer HEAD. Later use **All changes → Compare from → Last review checkpoint**. Automatic selection requires the same worktree and branch and a target still reachable from HEAD. Legacy checkpoints without branch metadata remain stored and usable by explicit ID through the comparison API; they are not guessed automatically. Mark seen creates a new branch-scoped checkpoint.

**Save working snapshot** explicitly captures current working contents, including staged, unstaged and untracked files, without modifying the real index, HEAD, branch or files. It writes Git objects and an owned private ref under `refs/git-review/snapshots/`. Capture verifies the source, is limited to 64 MiB / 20,000 files and may leave unreachable objects after a rejected capture; Juhas never runs automatic GC. Review baselines lists snapshots and permits deletion only when not used by the current review or saved comments. At most 100 working snapshots per repository are retained in the UI; delete old ones before taking more. Polling and sending feedback never capture a snapshot.

## Refresh and reading

Visible review views check every 15 seconds, without taking the foreground interaction lock. Hidden/inactive-tab views do no Git work. A pending check coalesces later ticks. Manual Refresh uses the same stable publication path and reloads configuration. A pinned commit remains selected when HEAD advances; amend/rebase preserves the old version and offers Open latest. External branch checkout offers an explicit Review current branch action. Failed checks retain the last view. A changed live aggregate preserves a matching file path; a file that no longer has a diff gets an explicit notice. Unsaved input and edited previews are preserved.

Comparison-wide controls (Single file/All files, Unified/Split, Wrap and Search) sit above file-specific controls. Each All files section has its own Viewed checkbox; the single-file header applies Viewed to its named file. The file list shows viewed progress and Next unreviewed. An edit makes the affected source unreviewed. **General comment** supports review-level and general-only feedback. Use Changes / Comments above the upper section to switch between History/Files and saved comments. The diff remains below. Drag their shared divider to resize; both views use the same native split and keep its height. Previous/Next comment controls live in the comments section. Opening a comment keeps the list visible and reveals its code below. In Comments, click the entry or **Code** to reveal its original code, independently of Edit. Unavailable historical working sources remain labeled rather than being relocated. Deleted comments invalidate file badges immediately.

**Search** opens and closes the search row; it is hidden by default. Find searches both sides of loaded code, without Git, and labels its loaded-context boundary. History search is separate. Syntax uses bounded, text-preserving line tokens with plain-text fallbacks, plus local emphasis for changed portions of a line; colors are not semantic analysis. **Wrap** uses native measured rows; the default remains horizontal scrolling. **All files** presents per-file sections; expand a header to load it, within the 20,000 loaded-row boundary. The selected-file view stays available. Optional `prefetch: true` loads at most two neighboring files, one process at a time; it is off by default and does not promise a measured speedup.

## Another project and guided reading

To review changes in project Y made by an agent working in X, open a terminal in Y and open Juhas there. At Submit review, Change → All live terminals permits explicitly selecting the agent from X. Automatic selection stays within the source project. Cross-project generated feedback names the reviewed checkout even when verbose Git context is off. It contains file paths, old/new line ranges, comments and excerpts where provenance is ambiguous. Manually edited messages remain exactly as edited.

Guided reading is optional and explicit: Request guided reading opens an ordinary editable request preview addressed to the existing agent, with no automatic model call. The request asks that agent to write a bounded JSON explanation to `juhas-guided.json` in the reviewed worktree's Git directory. **Load guided reading** reads it on that checkout's machine, verifies its full source identity, accounts for every changed file and labels omitted sections. New code marks the previous explanation stale. The raw diff and manual review progress remain authoritative. Normal message transport still limits sending to 16,000 UTF-8 bytes; oversized requests can be copied intact. No agent reply/thread protocol is installed.

Switching comparison views does not make saved comments outdated. Inline comments appear only in their original comparison; comments across several commits remain available for one review batch. Their original revisions, side, ranges and quotes are retained. A committed source removed from HEAD ancestry by amend/rebase or a changed working-tree fingerprint is marked outdated. Git verification errors are surfaced without relabeling existing notes. This validates the original context, not whether feedback has since been addressed. Comments are never silently relocated. Outdated notes remain in the preview with explicit markers. Submit review is disabled when there are neither saved comments nor an unsaved composer in the current review; an unsaved-only review requires saving before it can proceed. A working-tree view is a captured observation, not an atomic snapshot while another process writes files; refresh after the agent finishes.

A review tab inherits the sidebar session, selected comparison and loaded data when opened; an existing tab receives an explicit source selection when reused. Its repository context then stays pinned. Switching projects replaces the displayed repository; returning restores that context's review state. Different Herdr spaces use separate sessions by default. Changing repositories inside a multi-repository parent context retains the session's saved comments. A custom layout may supply an explicit `sessionId` on both copies. Repository selection and unsaved composers are additionally scoped to the active machine, space, tab and directory, so a saved selection cannot redirect a different project.

When the code/file list has keyboard focus: `j` / `k` select files, `]` / `[` select commits, `c` adds a file comment, and Escape returns to the terminal with the review sidebar. Text fields retain their normal input, including Unicode. The always-visible tabs mod accepts `herdr-app do juhas-tabs.open` and `herdr-app do juhas-tabs.full`; this works even when the review itself is closed. Review commands also include `juhas.refresh`, `juhas.next-file`, `juhas.previous-file`, `juhas.next-commit`, and `juhas.previous-commit`, `juhas.next-change` and `juhas.previous-change`. Shown views also accept `juhas.branch`, `juhas.branches`, `juhas.details`, `juhas.tree`, `juhas.all-files`, `juhas.search`, `juhas.diff-mode`, `juhas.whole-file` and `juhas.comments` and `juhas.preview`.

## Configuration

Repository scope comes from the current Herdr context; base branches and optional discovery limits are user settings, not source-code conventions. Supply optional configuration through mod `props.config` in your personal layout. For example:

```json
{
  "mod": "juhas",
  "props": {
    "role": "full",
    "sessionId": "my-review",
    "config": {
      "maxDepth": 3,
      "maxRepos": 200,
      "baseRules": [
        {"prefix": "feature/", "basePrefix": "integration/"}
      ]
    }
  }
}
```

No branch rule is enabled by default. This example automatically chooses `integration/cart` for `feature/cart` if it is the only existing candidate. A saved manual base takes priority; the picker can switch back with **Use automatic base**. A missing or ambiguous candidate opens the branch picker. A uniquely matching remote branch is supported when the local branch does not exist. The chosen base and its `auto`, `manual` or `configured` source are visible beside the comparison.

Personal rules can live outside every source repository in `<Herdr home>/juhas.json` (normally `~/.config/herdr-app/juhas.json`). Both sidebar and full views read this optional local file. For example, a captured part of a branch name can select its integration branch:

```json
{
  "baseRules": [
    {"pattern": "^feature/([^/]+)/[^/]+$", "replacement": "integration/$1"}
  ]
}
```

This maps `feature/cart/task` to `integration/cart`, only if that branch exists. Patterns are regular expressions; replacements use standard `$1`, `$2` captures. Keep organization-specific patterns in the local file, which the installer and release packager do not copy or overwrite. Press Refresh after editing it. Invalid JSON or malformed patterns report a configuration error instead of guessing a base.

Configuration priority is defaults, local file, Herdr shared `git-review.v1.config`, then `props.config`. Arrays are replaced, not concatenated. A manually saved base still takes priority over automatic rules.

Limits are explicit: discovery defaults to depth 3 / 200 repositories; text patches to 4 MiB / 20,000 rows; cache to 64 entries / 64 MiB. A limit or binary/mode-only change is displayed, never interpreted as an unchanged file. Submit currently limits text to 16,000 UTF-8 bytes to stay below Windows command-line limits; larger reviews are blocked intact.

## Local data and delivery

Drafts, open comment text, edited review previews, recipient choices, repository choices and sent batch history live in Herdr shared state under `git-review.v1.*`. They contain private code and paths: do not publish your Herdr home or copy this state into the project. No user session data belongs in releases.

Checkpoints create refs under `refs/git-review/checkpoints/` pointing to existing commits. They do not change your worktree, index, branch or remotes. These refs keep reviewed commits reachable after rebase/GC. Do not push them with a blanket mirror push. Deleting a checkpoint ref is a deliberate cleanup operation; it can make old history unavailable. Mark seen remains committed-only. Save working snapshot is a separate explicit action using private refs under `refs/git-review/snapshots/`, with its own delete action and an alternate index.

Submit records an in-flight batch before asking `hc` to send. If delivery is uncertain, drafts remain and the same batch is not automatically resent, including after restart. Inspect the destination terminal before deciding what to do next. A successful send means the core accepted terminal input, not that the agent completed or even understood the requested changes. The mod never starts an agent automatically.

## Remove / rollback

Switch to your previous layout first. Remove the personal `layouts/juhas.json`, `mods/juhas` and `mods/juhas-tabs` from the Herdr home. If replacing an older version, the installer's backup can restore those paths. This does not remove shared review data or checkpoint refs: retain them to preserve history, or clean them deliberately after checking what you want to keep. Never delete all of `.git`, reset the repository or clear the real index to remove this mod.

## Naming and existing installations

The product and Herdr mod are **Juhas**: `mods/juhas`, `juhas.*` commands, the generated `juhas-tabs` integration and `juhas` layout. Git review describes its function. Personal settings use `<Herdr home>/juhas.json`; the previous `git-review.json` is read only when the new file is missing. Keep existing settings outside this repository.

Internal `git-review.v1.*` shared-state keys, checkpoint refs and `git-review-*` panel IDs are retained for compatibility with saved comments, review previews and integrated personal layouts. An existing personal layout can update its review blocks to `mod: "juhas"` without renaming panel IDs or resetting its layout. The old mod folder may remain while validating the new one; it is not included in this distribution.

## Current limits

Split view uses one shared diff scroll surface. Independent horizontal scrolling for each side is not exposed as a complete control in the supported JavaScript API. Range selection uses explicit endpoints; Shift-click and drag selection are not emulated. Native verification covers Windows; macOS/Linux native interaction is not verified. See [compatibility](compatibility.md) for API details.


## Saved-comment filters and comparison summary

Comments can be filtered by Current/Outdated status and source comparison.
Current means the original source is still valid under Juhas's revision checks;
it does not mean the agent has addressed the comment. These filters affect
browsing only: Submit review includes all saved comments in the current
repository. Clear all also includes comments hidden by the filters, while
preserving saved comments from other repositories.

The header counts commits and changed files in the selected comparison, not
just the visible history page. Counts are cached for immutable revisions.
Uncommitted comparisons show files without a commit count. An unavailable
optional count is reported without blocking the diff. Loading indicators stay
in existing headers, preserve loaded rows and distinguish pagination from
history refreshes.


The comment editor starts at two text lines, grows natively to five and then scrolls. Its diff row uses measured layout while open. Enter saves through the native textarea submit event; Shift+Enter inserts a line break. Older hosts insert a line break before reporting Enter submission, so that inserted line break remains in the saved text. Newer hosts exposing submit-on-enter avoid that extra break. No ancestor keyboard override or host upgrade is used.

Expand immediately hides the originating legacy sidebar; a native Juhas pane is closed after the review tab is confirmed. Registration identifies the newly created tab instead of trusting the focused tab during init. If tab creation fails, the original view remains available.


Dedicated review tabs omit the redundant Juhas/branch heading. Refresh is in the common review-mode toolbar in both sidebar and tab. History rows show local commit times: relative under three hours, then Today HH:mm or Yesterday HH:mm, otherwise YYYY-MM-DD HH:mm. The original exact timestamp stays available in the tooltip.

History rows omit the redundant `HEAD -> branch` decoration; other refs/tags remain visible and full refs stay in the tooltip and details.


**Reply with code context** optionally asks the agent to identify each concern and fix using relevant symbol names or short code excerpts, so the reply makes sense without looking up line numbers. It is off on first use. Include code, Include Git context and Reply with code context are saved as user preferences across projects and Herdr restarts, including after a review is sent. An existing saved preview retains its own choices; a new review uses the remembered defaults. Manual message edits remain exact until explicit Regenerate. These options are separate from guided-reading requests.

The release also bundles `mods/juhas/skills/juhas-review-response/SKILL.md`. RECIPE asks the user whether to install it for their agent, and where. Installing Juhas only copies the skill inside the mod; it does not add agent-wide or repository skill configuration. Skill installation and the response-instruction checkbox are independent.
