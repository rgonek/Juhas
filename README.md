# Juhas

Git review assistant for Herdr.

A native Herdr mod for reviewing committed work and sending a batch of line comments to an agent terminal. Browse commits, compare revisions, review the final result of a branch, then revisit only changes since a review checkpoint. Use the compact sidebar or the full review card without leaving Herdr.

The mod is independent of hosting services, issue trackers, branch naming conventions and agent vendors. It does not require a GitHub account or a pull request. The mod sends no telemetry. Browsing reads local Git objects and refs; the explicit Fetch button can contact configured Git remotes. Submit deliberately sends review text to the terminal you choose.

## Requirements

- Herdr App 0.1.10 or later with the documented native mod APIs. Native verification currently targets Windows; see [compatibility](docs/compatibility.md).
- Git on the environment used by Herdr. Local repositories only in the initial release.
- Node >=22 for the installer and developer tests, not for the running mod.
- Windows discovery uses Windows PowerShell; macOS/Linux use `find`. No Bash dependency on Windows.

## Install

Clone or download this project, then run from its root:

```powershell
node scripts/install.mjs --layout main
```

The installer copies `mods/juhas`, creates a personal layout named `juhas` from the chosen layout and checks the mod. Existing Juhas files are backed up under Herdr's `data` directory. Shipped Herdr files and the active layout are preserved. To install from another personal layout, replace `main` with its name. Layouts must contain an active terminal area; a layout already integrating this mod is refused.

Select the new layout in Herdr, or explicitly activate it:

```powershell
herdr-app do layout.switch --name juhas
```

For a sandbox or nondefault installation use `--app-home <directory>`. Pass `--activate` to the installer only if you also want it to switch layouts. Windows `scripts/install.ps1` and Unix `scripts/install.sh` wrap the same installer.

For manual installation copy `mods/juhas` into the Herdr home `mods` directory and follow [RECIPE.md](RECIPE.md) to embed sidebar, toolbar and full-card copies. Do not edit Herdr's shipped mods or generated `.d.ts` files.

## Review workflow

1. Click **Juhas** beside **Files / Changes** in Herdr's top bar. It opens in their shared right-hand sidebar and follows the active project/tab directory, like the native panels. Inside a Git repository, that repository is selected automatically and there is no repository chooser. The default interface focuses on one repository. Repository selection, its path and manual ref/SHA fields are hidden; set `showAdvanced: true` to expose these controls. A parent with just one repository selects it automatically; in advanced mode **Repositories** offers only repositories below the current directory.
2. Click the expand icon for the full work-area review. The collapse icon restores the terminal and the same review in the right-hand panel. History and changed files appear above the full-width diff, with native draggable dividers between the panes. The expanded state is remembered separately for each project. **Branches** opens a native popup to choose the ref to browse; **Current**, **All branches** and **Remotes** filter the graph; filters search text/hash, author or path. Click a commit and a changed file to read its diff. Single-click already opens the file, so double-click also does so.
3. Select a comparison:

   | Mode | Meaning |
   |---|---|
   | Commit | Selected commit versus a parent; merge commits expose a parent selector. |
   | Range | Click Range, then the first and last commit. Both endpoints are included, in either click order. Clicking another mode cancels the selection. Native virtual rows do not supply click modifiers, so Shift/drag selection is not emulated. |
   | Branch | Choose a base branch from the list. Compare its common ancestor with the current branch against HEAD. The base is saved per worktree/branch; Base branch changes it. |
   | Since review | Last checkpoint for this worktree versus the chosen target. |
   | Uncommitted | HEAD versus tracked and untracked nonignored working files. Kept separate from historical comparisons. |

Files can be shown as a flat list or collapsible tree. Tree view compacts single-child folders without direct files into paths such as `Client/Pages/Clients` and shows the number of changed files in each subtree, with status colors, added/deleted line counts and comment badges. **Details** shows the selected commit message, author, email, date and refs. The header fetch button runs `git fetch --all --prune` and refreshes the review.

**Unified / Split** is a group of native buttons that changes the diff display. **↑ / ↓** navigates contiguous changed groups within the selected file and wraps at the ends, using a retained native scroll handle. Toolbar mode/filter/side choices use button groups rather than tabs. In side by side mode, **Comment: old / new** chooses the side used by a row click, because native virtual rows expose one click target per row. **Whole file** loads unchanged context on demand, subject to the same patch limits.

4. Click a code line to write a comment. Click a second line on the same side to select a range, click a hunk header to comment on its lines, or use **Comment** in the diff toolbar. Saved comments appear as bordered annotation cards beneath their source lines; split mode places a line comment on its source side. Click a card to edit it; its body can scroll when the feedback is long. **Save comment** adds the draft; it sends nothing. Review comments are saved locally, including their original revisions, side, line numbers and quoted code.
5. Inspect **Comments**, edit or delete them (or **Clear all**), then **Submit review**. The unique agent in the active project tab is selected automatically; if that tab has no agent, a sole agent in the project may be selected. Ambiguous matches require a choice. **Change** selects another project agent; the **All live terminals** checkbox in the recipient popup exposes an explicit fallback. Shells, finished sessions and child workers are never automatically selected.

   The preview includes only the current repository's saved comments. File paths are grouped once, with line sides/ranges, rename paths and outdated markers retained. **Include Git context** is off by default; enabling it adds repository paths and full comparison revisions once per group. Outdated comments retain the original revision for their commented side even when Git context is off. Code quotes are omitted by default to reduce payload size; **Include code** adds them. Both generation options preserve manual text edits until you explicitly use **Regenerate**. No tokenizer-specific count is claimed: the footer shows exact UTF-8 bytes and the transport limit remains enforced.

   Edit the final message directly, use **Copy**, or press **Send review** to send exactly that text. Changing the recipient preserves edits. Cancel/reopen restores the edited preview for that project context. **Regenerate** deliberately replaces the edited message with a fresh version from saved comments. After free-form edits, sending retains source comments because their presence in the edited text cannot be inferred reliably; an unedited message clears only unchanged comments included in that batch. Send/Copy/Cancel stay in a fixed bottom row while the editor scrolls. Review text is never silently truncated.
6. **Mark seen** records a committed target as a checkpoint, even when you have no comments. It does not submit comments or approve changes. Later use **Since review** to inspect the next round.

Changing revisions marks previous comments for that repository as outdated; it never silently relocates them. Outdated comments remain visible in the submit preview and are explicitly marked in the message. Delete them if they should not be sent. A working-tree view is a captured observation, not an atomic snapshot while another process writes files; refresh after the agent finishes before commenting.

Sidebar and full card share their session and selected comparison for the active context. Switching projects replaces the displayed repository; returning restores that context's review state. Different Herdr spaces use separate sessions by default. Changing repositories inside a multi-repository parent context retains the session's saved comments. A custom layout may supply an explicit `sessionId` on both copies. Repository selection and unsaved composers are additionally scoped to the active machine, space, tab and directory, so a saved selection cannot redirect a different project.

When the code/file list has keyboard focus: `j` / `k` select files, `]` / `[` select commits, `c` adds a file comment, and Escape returns to the terminal with the review sidebar. Text fields retain their normal input, including Unicode. The always-visible tabs mod accepts `herdr-app do juhas-tabs.open` and `herdr-app do juhas-tabs.full`; this works even when the review itself is closed. Review commands also include `juhas.refresh`, `juhas.next-file`, `juhas.previous-file`, `juhas.next-commit`, and `juhas.previous-commit`, `juhas.next-change` and `juhas.previous-change`. Shown views also accept `juhas.branch`, `juhas.branches`, `juhas.details`, `juhas.tree`, `juhas.diff-mode`, `juhas.whole-file` and `juhas.comments` and `juhas.preview`.

## Configuration

Repository scope comes from the current Herdr context; base branches and optional discovery limits are user settings, not source-code conventions. Supply optional configuration through mod `props.config` in your personal layout. For example:

```json
{
  "mod": "git-review",
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

## Development and release

```powershell
npm test
herdr-app check mods/juhas
node scripts/bench.mjs --repo <absolute-repository-root> --commit <nonempty-commit> --samples 30
```

Tests create disposable real Git repositories, including linked worktrees and SHA-256 repositories. The GitHub Actions workflow defines Windows/macOS/Linux runs; its presence does not mean remote CI has already run. Native UI and input-to-frame performance are verified separately. See [acceptance](docs/acceptance.md), [performance](docs/performance.md) and [third-party notices](THIRD_PARTY_NOTICES.md).

Public release is pending the author's license choice and final acceptance. Until a license is added, this repository does not grant a general reuse license. Do not redistribute community code or private review fixtures as part of a release.

`node scripts/package.mjs --check` lists the public allowlist without copying data. After adding the author-approved license, `node scripts/package.mjs --out <empty-directory>` prepares the distributable files. Packaging refuses a nonempty destination and excludes local plans, shared sessions, caches, logs, generated types and unlisted files. Publication remains a separate action.

## UI design

The self-contained [design brief](docs/design-brief.md) describes the workflow, native component inventory and design constraints without requiring access to a local Herdr installation.

## Naming and existing installations

The product and Herdr mod are **Juhas**: `mods/juhas`, `juhas.*` commands, the generated `juhas-tabs` integration and `juhas` layout. Git review describes its function. Personal settings use `<Herdr home>/juhas.json`; the previous `git-review.json` is read only when the new file is missing. Keep existing settings outside this repository.

Internal `git-review.v1.*` shared-state keys, checkpoint refs and `git-review-*` panel IDs are retained for compatibility with saved comments, review previews and integrated personal layouts. An existing personal layout can update its review blocks to `mod: "juhas"` without renaming panel IDs or resetting its layout. The old mod folder may remain while validating the new one; it is not included in this distribution.

Split mode currently keeps a single shared diff scroll region. Independent horizontal scroll per source side with synchronized vertical alignment is not exposed as a complete control in the installed JavaScript API; no custom wheel-event synchronization is implemented. The scroll viewport is bounded to the diff panel.
