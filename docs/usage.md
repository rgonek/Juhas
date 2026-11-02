# Using Juhas

Start with the [quick introduction](../README.md) or use this guide for the full workflow, configuration and local-data details.

## Review workflow

1. Click **Juhas** beside **Files / Changes**. It follows the active project/tab directory. A direct Git context selects its repository automatically. With `showAdvanced: true`, parent contexts can choose only repositories below the current directory.
2. Expand for the main review workspace: History + Files above a full-width diff, with native resizable panels. History defaults to commits after the configured branch's merge-base, falling back to HEAD history if no base is resolved. **History → ⋯** offers full history, all branches, remotes, branch browsing, details and search filters. Collapse returns to the shared sidebar.
3. Choose between two modes:

   | Mode | Meaning |
   |---|---|
   | Commit | Default: HEAD versus its parent. Click any history commit to review that commit. Merge commits expose a parent selector. |
   | All changes | Final tree difference against HEAD. Compare from Base branch (merge-base), Last review checkpoint, or Choose commit (changes after that commit, excluding the commit itself). |

All changes remembers the selected baseline when you visit individual commits. **Base branch** reuses local configuration and the manual override; **Change…** opens the native branch picker and allows returning to automatic selection. Missing or ambiguous bases require an explicit choice and never block Commit review. No branch naming convention is built in. **⋯** beside the modes retains Uncommitted and the advanced inclusive commit-range picker. Working-tree safeguards still apply; Shift/drag range gestures are not emulated.

Files can be shown as a flat list or collapsible tree. Tree view compacts single-child folders without direct files into paths such as `Client/Pages/Clients` and shows the number of changed files in each subtree, with status colors, added/deleted line counts and comment badges. **Details** shows the selected commit message, author, email, date and refs. The header fetch button runs `git fetch --all --prune` and refreshes the review.

**Unified / Split** is a group of native buttons that changes the diff display. **↑ / ↓** navigates contiguous changed groups and continues into the next/previous file at file boundaries, skipping files without text changes and stopping at the review boundary, using a retained native scroll handle. Toolbar mode/filter/side choices use button groups rather than tabs. In side by side mode, **Comment: old / new** chooses the side used by a row click, because native virtual rows expose one click target per row. The rightmost **⋯** menu contains **Whole file** (load unchanged context within patch limits) and **Select / copy**.

Commit Details retains its compact native text layout; the copy icon beside the SHA copies the full commit ID. **Select / copy** opens loaded code fragments in a native read-only editor with selection and standard copy shortcuts; Original/Modified chooses the source side, and Copy all excludes diff markers. Unloaded gaps are separated by blank lines. Use Whole file first when you need all available context. The virtualized diff itself keeps row clicks for review comments; it does not emulate cross-row text selection.

4. Click a code line to write a comment. Click a second line on the same side to select a range, click a hunk header to comment on its lines, or use **Comment** in the diff toolbar. The native comment editor appears directly below the selected line, on the matching side in Split. Clicking a saved card edits it with the same retained editor. Saved cards have compact, bounded heights and scroll long feedback. **Save comment** adds the draft; it sends nothing. Review comments are saved locally, including their original revisions, side, line numbers and quoted code. Unsaved text also retains the original comparison when navigating away; Resume returns to it. If the original line or revision is unavailable, an explicitly labeled source-context editor keeps the original anchor instead of relocating it. Editing an outdated comment changes its body while preserving its provenance/status.
5. Inspect **Comments**, edit or delete them (or **Clear all**), then **Submit review**. If a comment is still unsaved, Save and continue includes it, Skip omits it from this review while retaining its text, and Back returns to editing. The preview shows **Review · N comments**, the recipient and automatic/manual selection. The unique agent in the active project tab is selected automatically; if that tab has no agent, a sole agent in the project may be selected. Ambiguous matches require a choice. **Change** selects another project agent; the **All live terminals** checkbox in the recipient popup exposes an explicit fallback. Shells, finished sessions and child workers are never automatically selected.

   The preview includes only the current repository's saved comments. File paths are grouped once, with line sides/ranges, rename paths and outdated markers retained. **Include Git context** is off by default; enabling it adds repository paths and full comparison revisions once per group. Outdated comments retain the original revision for their commented side even when Git context is off. Full code quotes are omitted by default. Comments at distinct locations omit source IDs, even across multiple commits. Overlapping locations from different revisions automatically include compact source IDs and bounded excerpts; working snapshots and outdated feedback retain the context needed to identify their original source. Full provenance remains stored regardless of preview options. **Include code** adds full quotes. Both generation options preserve manual text edits until you explicitly use **Regenerate**. No tokenizer-specific count is claimed: the footer shows exact UTF-8 bytes and the transport limit remains enforced.

   Edit the final message directly, use **Copy**, or press **Send review** to send exactly that text. Changing the recipient preserves edits. Cancel/reopen restores the edited preview for that project context. **Regenerate** deliberately replaces the edited message with a fresh version from saved comments. After free-form edits, sending retains source comments because their presence in the edited text cannot be inferred reliably; an unedited message clears only unchanged comments included in that batch. Send/Copy/Cancel stay in a fixed bottom row while the editor scrolls. Review text is never silently truncated.
6. **Mark seen · SHA** records exactly the displayed committed target, even without comments. Its tooltip shows the full SHA. It does not send feedback, approve changes or silently mark a newer HEAD. Later use **All changes → Compare from → Last review checkpoint**. Automatic selection requires the same worktree and branch and a target still reachable from HEAD. Legacy checkpoints without branch metadata remain stored and usable by explicit ID through the comparison API; they are not guessed automatically. Mark seen creates a new branch-scoped checkpoint.

Switching comparison views does not make saved comments outdated. Inline comments appear only in their original comparison; comments across several commits remain available for one review batch. Their original revisions, side, ranges and quotes are retained. A committed source removed from HEAD ancestry by amend/rebase or a changed working-tree fingerprint is marked outdated. Git verification errors are surfaced without relabeling existing notes. This validates the original context, not whether feedback has since been addressed. Comments are never silently relocated. Outdated notes remain in the preview with explicit markers. Submit review is disabled when there are neither saved comments nor an unsaved composer in the current review; an unsaved-only review requires saving before it can proceed. A working-tree view is a captured observation, not an atomic snapshot while another process writes files; refresh after the agent finishes.

Sidebar and full card share their session and selected comparison for the active context. Switching projects replaces the displayed repository; returning restores that context's review state. Different Herdr spaces use separate sessions by default. Changing repositories inside a multi-repository parent context retains the session's saved comments. A custom layout may supply an explicit `sessionId` on both copies. Repository selection and unsaved composers are additionally scoped to the active machine, space, tab and directory, so a saved selection cannot redirect a different project.

When the code/file list has keyboard focus: `j` / `k` select files, `]` / `[` select commits, `c` adds a file comment, and Escape returns to the terminal with the review sidebar. Text fields retain their normal input, including Unicode. The always-visible tabs mod accepts `herdr-app do juhas-tabs.open` and `herdr-app do juhas-tabs.full`; this works even when the review itself is closed. Review commands also include `juhas.refresh`, `juhas.next-file`, `juhas.previous-file`, `juhas.next-commit`, and `juhas.previous-commit`, `juhas.next-change` and `juhas.previous-change`. Shown views also accept `juhas.branch`, `juhas.branches`, `juhas.details`, `juhas.tree`, `juhas.diff-mode`, `juhas.whole-file` and `juhas.comments` and `juhas.preview`.

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

Checkpoints create refs under `refs/git-review/checkpoints/` pointing to existing commits. They do not change your worktree, index, branch or remotes. These refs keep reviewed commits reachable after rebase/GC. Do not push them with a blanket mirror push. Deleting a checkpoint ref is a deliberate cleanup operation; it can make old history unavailable. Uncommitted snapshots cannot be marked seen in this release.

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
