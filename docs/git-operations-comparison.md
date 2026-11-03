# Git operation comparison: Juhas, branch-review, herdr-annotator

Research date: 2026-11-03. This note compares source paths and command counts, not elapsed-time benchmarks. Remote code was cloned read-only into a temporary directory; no remote mod was installed or executed. Juhas means the current working tree, including the comment/Git changes already present on `feature/native-pane-integration`.

Pinned upstream revisions:

- [cunderw/herdr-mods: 370f3f7f28264d7041abf4604c659ae9dd383b21](https://github.com/cunderw/herdr-mods/tree/370f3f7f28264d7041abf4604c659ae9dd383b21/branch-review).
- [jakub-tucek/herdr-annotator: 2dfeed7452349645d8d3e7b7a143adff6335fa79](https://github.com/jakub-tucek/herdr-annotator/tree/2dfeed7452349645d8d3e7b7a143adff6335fa79).

## Remote implementations

### branch-review

The normal refresh path resolves repository root, reads the current branch, recomputes merge-base, reloads up to 200 commits, reloads the changed-file statistics, and reloads the selected file patch. With an already chosen base and an open changed file that is six sequential Git processes, even if the checkout did not change. Initialization also discovers the base using `origin/HEAD`, then possibly up to four candidate-ref checks. The same full refresh is scheduled every 15 seconds; there is a loading guard, but no unchanged-HEAD or patch cache. [Refresh and base discovery](https://github.com/cunderw/herdr-mods/blob/370f3f7f28264d7041abf4604c659ae9dd383b21/branch-review/mods/branch-review/main.js#L23-L90).

Switching files runs just the selected patch query and ignores selecting the already open file. Switching scope runs the changed-file query and selected patch. This is a useful small-operation boundary, although revisiting an earlier file still reads its diff again. Saving a comment writes local storage, clears the composer and notifies immediately, with **zero Git queries**. [Diff loading and file selection](https://github.com/cunderw/herdr-mods/blob/370f3f7f28264d7041abf4604c659ae9dd383b21/branch-review/mods/branch-review/main.js#L98-L150), [comment saving](https://github.com/cunderw/herdr-mods/blob/370f3f7f28264d7041abf4604c659ae9dd383b21/branch-review/mods/branch-review/main.js#L178-L186).

That cheap save has weaker provenance: comments are identified by repository/branch, path, side, line and a human scope label. There is no revalidation against an immutable working-tree snapshot or Git ancestry on save. Scope labels distinguish commit views but a whole-branch label does not change when HEAD advances. Do not copy the zero-query save without preserving Juhas's stronger source contract. [Anchors and labels](https://github.com/cunderw/herdr-mods/blob/370f3f7f28264d7041abf4604c659ae9dd383b21/branch-review/mods/branch-review/review.js#L20-L70), [comment identity and storage](https://github.com/cunderw/herdr-mods/blob/370f3f7f28264d7041abf4604c659ae9dd383b21/branch-review/mods/branch-review/main.js#L47-L49).

The file-list query disables rename detection (`--no-renames`). The patch query does not explicitly disable rename detection and may follow Git configuration. Display is capped at 3000 rows and line text is shortened to 2000 characters, **after the full command output has been captured**. Therefore the row limit is not a subprocess/output-capture budget. [File and patch queries](https://github.com/cunderw/herdr-mods/blob/370f3f7f28264d7041abf4604c659ae9dd383b21/branch-review/mods/branch-review/main.js#L98-L120).

Scopes support individual commits/ranges, whole branch from merge-base to HEAD, and HEAD to working tree. The uncommitted scope uses `git diff HEAD`, so it does not enumerate untracked files. Base selection only understands the remote default and main/master candidates, not the user's `XYZ-123/XYZ-987 -> dev/XYZ-123` convention. [Scope endpoints](https://github.com/cunderw/herdr-mods/blob/370f3f7f28264d7041abf4604c659ae9dd383b21/branch-review/mods/branch-review/review.js#L28-L38), [base selection](https://github.com/cunderw/herdr-mods/blob/370f3f7f28264d7041abf4604c659ae9dd383b21/branch-review/mods/branch-review/main.js#L86-L90).

### herdr-annotator

The JavaScript UI invokes a Rust helper once per request. That helper call must not be mistaken for one Git operation: a normal existing-HEAD uncommitted snapshot runs repository-root resolution, HEAD resolution, symbolic branch query, branch/ref enumeration, status including untracked files, changed-file names, and the selected-file patch: **seven Git processes**, before any extra files needed for saved-comment validation. Branch mode adds base-commit resolution and merge-base; automatic base selection can add the remote-default query. These commands are sequential in `snapshot`. [Snapshot queries](https://github.com/jakub-tucek/herdr-annotator/blob/2dfeed7452349645d8d3e7b7a143adff6335fa79/src/git.rs#L84-L267), [helper request](https://github.com/jakub-tucek/herdr-annotator/blob/2dfeed7452349645d8d3e7b7a143adff6335fa79/mods/annotator/main.js#L157-L176).

Selecting a file calls the full snapshot refresh. Saving a comment calls `act("add")`, which invokes the same preparation path. Resolving a comment, marking it read, exporting and sending also enter preparation; GitHub-only operations branch off before it. Preparation hydrates the selected file and files with saved comments; within one request its `loaded` flag avoids loading the same file twice, and a second pass fetches wider context only when a comment needs it. This is **request-local reuse, not an immutable cross-request diff cache**. [File selection](https://github.com/jakub-tucek/herdr-annotator/blob/2dfeed7452349645d8d3e7b7a143adff6335fa79/mods/annotator/main.js#L493-L496), [save and request completion](https://github.com/jakub-tucek/herdr-annotator/blob/2dfeed7452349645d8d3e7b7a143adff6335fa79/mods/annotator/main.js#L130-L140), [operation preparation](https://github.com/jakub-tucek/herdr-annotator/blob/2dfeed7452349645d8d3e7b7a143adff6335fa79/src/lib.rs#L38-L136), [hydration and validation](https://github.com/jakub-tucek/herdr-annotator/blob/2dfeed7452349645d8d3e7b7a143adff6335fa79/src/preparation.rs#L17-L38).

It polls snapshots every 15 seconds when the composer has no text, and polls GitHub every five minutes. Busy guards prevent simultaneous UI requests. The filesystem watcher shown in initialization watches Herdr application state for sidebar/focus restoration; it is not a Git checkout watcher replacing snapshot polling. [Timers and application-state watcher](https://github.com/jakub-tucek/herdr-annotator/blob/2dfeed7452349645d8d3e7b7a143adff6335fa79/mods/annotator/main.js#L51-L68).

Its concrete efficiency advantage is finer subprocess capture budgeting: ordinary Git output is capped at 512 KiB, metadata at 8 MiB, with a shared 25-second request budget. The code drains output while retaining bounded data, reports truncation, and limits hydrated preview content to 2 MiB, 2000 rows per file and 8192 bytes per source line. It does not imply that Git stops computing as soon as the retained-output limit is reached. **Correction after inspecting the installed Herdr API:** Juhas's host `herdr.exec` already documents a 30-second limit and an 8-MiB output limit per command (`gpui-kit.d.ts`, `herdr.exec`). The difference is annotator's smaller ordinary-output limit and shared request budget; Juhas's own 4-MiB/row parser limits apply after host capture. Neither implementation should be described as having unlimited command capture. [Capture limits and metadata classification](https://github.com/jakub-tucek/herdr-annotator/blob/2dfeed7452349645d8d3e7b7a143adff6335fa79/src/git.rs#L21-L81), [process capture and shared budget](https://github.com/jakub-tucek/herdr-annotator/blob/2dfeed7452349645d8d3e7b7a143adff6335fa79/src/process.rs#L12-L30), [bounded pipe drain](https://github.com/jakub-tucek/herdr-annotator/blob/2dfeed7452349645d8d3e7b7a143adff6335fa79/src/process.rs#L111-L140), [preview hydration](https://github.com/jakub-tucek/herdr-annotator/blob/2dfeed7452349645d8d3e7b7a143adff6335fa79/src/git.rs#L270-L347).

Rename detection is disabled for both file metadata and tracked-file patches. This avoids similarity search at the cost of representing moves as delete/add. The helper supports only uncommitted and whole-branch modes, **not per-commit review**. Its branch baseline is compared directly to the working tree: cumulative committed changes and dirty changes are combined, including untracked files from status. This is a useful fit for the mixed committed/uncommitted use case, but differs from Juhas's current HEAD-only All changes. [Modes](https://github.com/jakub-tucek/herdr-annotator/blob/2dfeed7452349645d8d3e7b7a143adff6335fa79/src/model.rs#L20-L27), [working-tree endpoints and untracked enumeration](https://github.com/jakub-tucek/herdr-annotator/blob/2dfeed7452349645d8d3e7b7a143adff6335fa79/src/git.rs#L187-L229), [per-file endpoint](https://github.com/jakub-tucek/herdr-annotator/blob/2dfeed7452349645d8d3e7b7a143adff6335fa79/src/git.rs#L293-L322).

The subprocess implementation imports Unix-only APIs and uses Unix process groups/libc. It was not built or benchmarked on this Windows machine. This note makes source-level comparisons, not a native compatibility or measured latency claim. [Platform-specific process implementation](https://github.com/jakub-tucek/herdr-annotator/blob/2dfeed7452349645d8d3e7b7a143adff6335fa79/src/process.rs#L1-L9).

## Implications for Juhas

- Preserve Juhas's immutable commit/tree caches and `fromHistory` reuse. Both remote designs repeat work that these already avoid. Current Juhas combines `--raw` and `--numstat` into one Git diff traversal/process; there is no need to split those queries. Local sources: `mods/juhas/cache.js`, `comparisons.js:fromHistory`, `controller.js:selectScope/selectFile`, `diff.js:listChangedFiles`.
- Borrow branch-review's immediate local composer completion, with provenance validation handled separately. The current working-tree changes already close the composer before reconciliation; further optimization should target actual redundant Git work instead of weakening source anchoring.
- Borrow annotator's **combined base-to-working-tree review** for mixed committed/dirty agent output, and its subprocess/output budgets where supported by Herdr. Do not copy its full snapshot rebuild for every comment/file click.
- Consider opt-in or threshold-limited rename detection after profiling representative large moves. Both competitors avoid it in file enumeration, whereas Juhas uses `--find-renames=20%` for enumeration and patches. Do not claim it is the bottleneck without measurement.
- Prefer one validated mutable snapshot per coherent action and cheap invalidation, retaining before/after checks where needed to reject a changing working tree. Juhas currently recomputes a full binary diff and hashes all untracked content when resolving its working-tree fingerprint; that is much more work than metadata-only refresh. Replacing it with timestamps alone would weaken correctness.

## Measured Juhas Git process counts

Measured on Windows using the real `Controller`, the existing `tests/helpers/repos.mjs` disposable-repository fixture, and a wrapper counting calls to `run`. The fixture had a base branch `dev/XYZ-123`, a feature branch `XYZ-123/XYZ-987`, and three commits modifying one file. Later it received one tracked-file modification and one untracked file. The store was in-memory; no user repository files or review state were changed. These are counts for that fixture and action sequence, not time measurements, UI-level totals, or universal constants. In particular, a commit's parent being present in the loaded history matters.

| Controller action | Git processes | Conditions |
|---|---:|---|
| `openRepo` | 5 | Includes initial unfiltered history, no comments |
| `setHistoryBase` | 5 | Resolves two commits, merge-base and two trees |
| `loadHistory` with feature exclusion | 3 | Resolves HEAD and exclusion, then reads log again |
| Select a commit already in history, with its parent | 1 | No comments; only changed-file metadata |
| Open that committed file | 1 | First patch read |
| Save first committed comment | 3 | HEAD, ancestry and base-object validation |
| Select another loaded commit after adding the comment | 2 | Changed files plus HEAD validation |
| Revisit cached commit with that comment | 1 | Only HEAD validation; without comments this can be zero |
| First All changes selection | 8 | Includes the existing comment check |
| Repeat All changes selection | 6 | File list and commit count cached; resolution repeated |
| Select Uncommitted | 8 | Includes existing committed-comment check and untracked scan |
| Open a tracked file in Uncommitted | 11 | Five-command full working fingerprint before and after one patch |
| Save working comment | 6 | Five-command validation plus HEAD for existing committed comment |

The command families and explanations are grounded in [controller.js](../mods/juhas/controller.js), [comparisons.js](../mods/juhas/comparisons.js), [history.js](../mods/juhas/history.js), and [diff.js](../mods/juhas/diff.js). Counts include the uncommitted fixes already in this checkout. The older [performance note](performance.md) describes zero-query cached navigation; with saved comments, current reconciliation adds a HEAD query even on a cached comparison.

### Concrete optimization candidates

1. **Working-tree file navigation.** `selectFile` calls `validateWorking` before and after loading the patch. Each validation constructs the whole-repository binary diff, enumerates untracked files and hashes their contents. The checks protect against concurrent agent writes, so they cannot simply be deleted. Design a coherent review observation/invalidation contract, reuse its metadata and expensive fingerprints, and validate the selected source before saving. Preserve explicit handling of edits during capture and outdated anchors. This is the largest observed process multiplier, not proof of the largest elapsed-time cost in every repository.
2. **Base resolution asks for unused trees.** `setHistoryBase` calls full `resolveComparison` and uses only `.baseOid`; its two tree queries are unnecessary for that purpose. Resolving a baseline should be a smaller operation shared by history and aggregate review.
3. **Startup reads history twice.** `openRepo` loads default history, then `activateContext` calls `updateFeatureHistory`, which computes the base and reloads filtered history. Context discovery also resolves repository metadata before `openRepo` repeats it. Reuse already resolved repository/HEAD information and load the desired history once. See [main.js](../mods/juhas/main.js), `activateContext` and `updateFeatureHistory`.
4. **Aggregate comparisons repeat immutable metadata reads.** `selectScope` caches literal-OID commit/range scopes; branch scopes resolve HEAD, base, merge-base and both trees again. Resolve moving refs once per refresh generation, then cache work by their OIDs. Avoid a permanent branch-name cache that becomes stale when the agent commits or the base moves.
5. **Separate navigation from comment-status refresh.** Existing comments cause a HEAD lookup for every comparison selection. Reuse one checked HEAD within a coherent operation/refresh; retain fresh verification at defined boundaries so amend/rebase remains visible. A comment-body change is not inherently a reason to scan unrelated comment sources.
6. **Cache commit details.** `loadDetails` runs `git show` whenever requested; OID-keyed immutable details are reusable.
7. **Process/output budgets.** Juhas's own parser limits apply after `exec` returns, on top of Herdr's documented 30-second/8-MiB per-command bounds, and its working fingerprint requests a full binary diff. Investigate a smaller diff budget and a coherent request budget using the actual Herdr exec API before choosing a portable implementation. Annotator is a reference for the desired bounded behavior, not a drop-in Windows helper.
8. **A no-op control still reloads history.** Include remotes changes `git log` arguments only for `ref === 'all'`, but its checkbox reloads history in every mode. Disable/hide it outside all-branch browsing, or remove that browsing feature from the focused UI. This is independent of whether rename detection proves expensive.

## Fit to the agent-review workflow

The two committed workflows are already represented correctly: individual commit-versus-parent comparisons preserve separate source anchors, and aggregate review compares the configured base's merge-base with HEAD. Comments across these comparisons remain available for one feedback message. Do not replace the aggregate baseline with a plain base-tip diff: integration-branch changes made after the split must not appear as the agent's changes. See [comparisons.js](../mods/juhas/comparisons.js) and [submit.js](../mods/juhas/submit.js).

The significant missing mode is **aggregate review including uncommitted changes**. Current All changes stops at HEAD. Current Uncommitted starts at HEAD. Neither presents merge-base to the current working files, including untracked files, as one result. Annotator's branch mode does. Make this an explicit target choice (HEAD / working files) or a clearly labeled Include uncommitted option; preserve the existing meaning of committed review and keep source provenance explicit. Also consider the empty-repository case: current `openRepo` and render treat missing HEAD as an empty repository and do not offer reviewing the first uncommitted files.

The branch mapping is supported by the current configuration mechanism:

```json
{
  "baseRules": [
    {"pattern": "^([^/]+)/[^/]+$", "replacement": "dev/$1"}
  ]
}
```

This was checked through `selectBase` with `XYZ-123/XYZ-987` and an existing `refs/heads/dev/XYZ-123`: it selected that base automatically. This confirms the mechanism, not the contents of the user's private installed configuration. Use a narrower pattern if other two-component branches must not match. Manual overrides take priority, and no automatic fetch is performed. See [config.js](../mods/juhas/config.js) and [usage](usage.md#configuration).

### Suggested interface scope

| Capability | Recommendation for this workflow | Reason |
|---|---|---|
| Commit / All changes | Keep as primary modes | Matches the two review strategies |
| Uncommitted | Promote from Advanced comparisons | Required agent output, not an edge case |
| Aggregate committed + dirty changes | Add | Covers an agent that commits some work and leaves later fixes dirty |
| Base-branch label / Change | Keep one clear access point | Makes the actual review boundary visible |
| Feature branch commits | Make the normal history, remove the redundant menu action if there are no other history modes | Relevant review scope |
| All branches / Include remotes / Browse branches | Remove from the focused interface | General repository browsing rather than current-agent review; base selection can still list remote refs |
| Show full history | Advanced fallback | Occasionally useful for older baselines, not normal review |
| Repeated Choose base branch entries | Consolidate | Currently exposed in history options, review-more and the All changes base row |
| Inclusive commit range | Advanced or remove visible control | Manual baseline plus HEAD covers most sessions; selected-range semantics need extra explanation |
| Choose commit as baseline | Keep as fallback | Supports reviewing only a particular round of agent work |
| Mark seen / Last review checkpoint | Keep, but clarify as a review baseline | Useful after the next agent round; avoids repeatedly reviewing the whole feature branch; do not silently mark on Send |
| Commit details and text/hash search | Keep compact/optional | Helps distinguish what each agent commit did |
| Author filter | Advanced | Usually less useful when agent commits share an author |
| Path filter | Optional | Can help review larger changes in a module |
| Fetch all remotes | Move to secondary actions | Keep local Refresh prominent; network work remains explicit |
| Merge parent selector | Keep conditional or advanced | Needed only when a selected commit is a merge |
| Unified / Split, file tree, full context, code copy | Keep | These support actual code inspection |
| Per-file reviewed state and next-unreviewed navigation | Consider after Git fixes | Helpful in a large review; invalidate by source content/comparison, not filename alone |

Removing UI choices alone will not fix the 11-process working-file path: prioritize the work and cache boundaries first. Do not add periodic full Git refresh as a substitute for a clear refresh/staleness contract. The competitors' 15-second polling is not an efficiency improvement over Juhas's event-driven/requested work. The user's subsequent requirement is a 15-second background check while Juhas is visible, preserving the selected commit/file/diff. This calls for incremental probing and staged publication, not repeatedly running the current destructive refresh path; see the [follow-up design](agent-review-refresh-design.md).

Suggested order: (1) redundant Git work and working-tree correctness contract, (2) simpler primary modes and menu consolidation, (3) combined aggregate working-file review, (4) output/time budgets, (5) optional review-progress features. These are audit recommendations, not an implementation plan or authorization to remove behavior.
