# Performance

Initial read-only baseline on a local development repository, 30 warm samples, separate first sample, Git child-process time included:

| Operation | First sample | Warm p95 |
|---|---:|---:|
| Log, 300 commits | 538 ms | 353 ms |
| Commit file metadata | 314 ms | 295 ms |
| Commit patch | 320 ms | 332 ms |

The selected HEAD was a merge and the last two commands returned no changes; these are process-overhead observations, not representative nonempty diff measurements. The benchmark must also run against a nonempty representative commit before acceptance.

Targets: cached navigation p95 <=100 ms, first useful history p95 <=500 ms on a documented local test repository. These are targets, not verified UI guarantees. A native 3,000-row list was rendered; input-to-frame latency remains a separate measurement.

Immutable comparisons and patches are cached by worktree, resolved tree IDs, file and options. History loads in pages of 300, and patches only when selected. Cache limits are 64 entries / 64 MiB. Large patches report explicit truncation. Git maintenance is never changed automatically.

## Nonempty commit follow-up

On the same local development repository, selecting a nonmerge commit with actual file changes, 30 warm samples gave:

| Operation | First sample | Warm p95 | Output bytes |
|---|---:|---:|---:|
| Log, 300 commits | 189 ms | 254 ms | 45,546 |
| Changed-file metadata | 172 ms | 206 ms | 128 |
| One selected file patch | 230 ms | 213 ms | 18,461 |
| JavaScript cache lookup + JSON serialization | <1 ms | <1 ms | 139 |

These results verify nonempty Git reads and the in-memory lookup path. They do not establish a 100 ms input-to-frame p95 or a 500 ms cold full-view guarantee: resolving repository identity and comparisons involves multiple queries. Native screenshot checks confirm rendering and navigation, not exact frame latency. The cache measurement is intentionally named separately from interactive latency.

Navigation now also includes tree IDs in history metadata: selecting a nonroot commit whose parent is already loaded needs one Git read for the changed-file list rather than five metadata/file reads. Revisiting that comparison uses zero Git reads. A real-repository integration test verifies this query reduction. Repository identity metadata is read in one Git invocation. These changes reduce process-start overhead without changing Git configuration.

Changed-file status and line counts now share one `git diff --raw --numstat -z` traversal. Cached revisits still need zero Git reads. Full-file context and full commit metadata are loaded only on request. Branch selection uses a virtual list, so repositories with many refs do not create one button handler per ref.


## Agent-review refresh

The earlier timings above are historical measurements, not measurements of the new review-tab workflow. An unchanged pinned source skips history/base/diff reads on a 15-second check; it still probes refs, branch, HEAD and source availability. Working comparisons use raw/numstat metadata and content identities instead of a full binary patch fingerprint. Untracked metadata is bounded; unusually large observations report a limit and retain the displayed source.

Only visible reviews schedule checks. Refresh stages results before publishing and keeps the selected commit/path and existing patch while Git runs. Aggregate comparisons update the selected file when possible; committed sources stay pinned after amend/rebase until Open latest. Foreground scope and refresh operations have a shared 256-command/25-second budget; the host's individual child-process limit remains 30 seconds. Deadline rejection does not cancel a child already running.

All-files reading is opt-in with a 20,000-line loaded-section limit. Find uses only loaded text and at most 10,000 matches across sections. Neighbor prefetch is off by default and reads at most two files sequentially. Syntax tokenization has bounded plain-text fallbacks. New native wrapping geometry, actual tab interaction and input-to-frame latency have not been accepted in a running app; automated callback/model checks do not establish those properties.
