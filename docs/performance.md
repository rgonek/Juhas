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

Single-commit changed-file status and line counts share one `git diff --raw --numstat -z` traversal. Cached revisits still need zero Git reads. Full-file context and full commit metadata are loaded only on request. Branch selection uses a virtual list, so repositories with many refs do not create one button handler per ref.


## Agent-review refresh

The earlier timings above are historical measurements, not measurements of the new review-tab workflow. An unchanged pinned source skips history/base/diff reads on a 15-second check; it still probes refs, branch, HEAD and source availability. Working comparisons use raw/numstat metadata and content identities instead of a full binary patch fingerprint. Untracked metadata is bounded; unusually large observations report a limit and retain the displayed source.

Only visible reviews schedule checks. Refresh stages results before publishing and keeps the selected commit/path and existing patch while Git runs. Aggregate comparisons update the selected file when possible; committed sources stay pinned after amend/rebase until Open latest. Foreground scope and refresh operations have a shared 256-command/25-second budget; the host's individual child-process limit remains 30 seconds. Deadline rejection does not cancel a child already running.

All-files reading is opt-in with a 20,000-line loaded-section limit. Find uses only loaded text and at most 10,000 matches across sections. Neighbor prefetch is off by default and reads at most two files sequentially. Syntax tokenization has bounded plain-text fallbacks. New native wrapping geometry, actual tab interaction and input-to-frame latency have not been accepted in a running app; automated callback/model checks do not establish those properties.

## Large-comparison follow-up (2026-11-05)

Immutable aggregate scopes publish rename-aware file identities before a separate line-count query. The selected patch and foreground navigation do not wait for aggregate counts. Loading feedback distinguishes scope loading, patch loading and line counting. A count failure retains the useful list with an explicit unavailable-count message. Single-commit scopes keep their combined one-query path; working-tree observations retain their existing validation.

Six samples per Git command were collected on a local 657-file aggregate; warm medians use the five samples after the first:

| Metadata | First sample | Warm median |
|---|---:|---:|
| Raw plus numstat | 280 ms | 249 ms |
| Raw only | 109 ms | 102 ms |

For a disposable 1,200-file additions fixture, warm medians were 216 ms combined versus 56 ms raw-only. The first combined sample took 14.1 seconds. These are local observations with different cache conditions, not a controlled cold-cache speedup or input-to-frame benchmark. Splitting the queries adds work overall but reduces the work required before displaying the file list.

Two subsequent asynchronous Controller samples published the 657-file list after 786/434 ms, completed foreground selection after 952/598 ms and completed counts after 1152/779 ms. This verifies separate publication stages, not native UI latency.

All-files header preparation uses one session snapshot per pass instead of one per file; a 1,000-section regression verifies that reduction and that count updates preserve collapsed/loaded state. File progress and comment counts also use one snapshot when building the file list. Oversized patches enforce the byte cap before allocating line arrays.

Regression coverage includes superseded scope/file failures, deferred-count failures and stale results, aggregate/commit cache isolation, refresh consistency when HEAD moves and independent refresh notifications for multiple views. Separate views can still repeat Git reads; cross-view data coalescing remains future work.

A native 657-file aggregate was observed with a file list, Tree, selected patch and All files, without a render error in those states. Exact input-to-frame latency and native-app memory growth remain unmeasured.

## Reproducible controller soak

Run `node --expose-gc scripts/soak.mjs` for a 15-minute workload against a disposable Git repository. It cycles large patches, immutable scopes and mutable edits with refreshes, samples memory after GC, and removes the fixture afterward.

The recorded run completed 2,240 file selections, 32 immutable scope selections and 186 mutable edits/refreshes without workload errors. After warmup, post-GC heap stayed between 76.5 and 79.5 MiB and retained cache size between 62.66 and 63.71 MiB. The byte limit bound before the independent 64-entry limit. RSS varied without a monotonic rise; these Node observations do not prove native Herdr memory stability. Latency quantiles from that run were not recoverable from the truncated output. The runner now prints bounded latency summaries for future runs.

## Working diff loading (2026-11-09)

The per-line native entities used by hover comment buttons have been removed from the production diff. The experiment and its tests remain on `spike/selectable-diff-2026-11-09`. Source rows use virtual-list item clicks again; creating a large diff no longer schedules an entity for every loaded line.

Working observations now inspect untracked paths with at most four concurrent Git processes. Results retain Git path order, mode/binary metadata and the existing content fingerprints. A failed metadata read stops scheduling new paths, drains in-flight reads and rejects the observation. Whole-comparison verification still runs before and after detached patch reads, including cache hits.

A five-sample asynchronous Controller comparison on this repository used the same branch comparison against `origin/main`, with working changes included and `mods/juhas/main.js` selected (512 patch lines). Warm medians, excluding the first sample, were 2,960 ms on `main` and 1,989 ms with bounded concurrency: about 33% less time. Both performed 36 Git commands per warm read. These are local elapsed times with host variability; they do not measure input-to-frame latency. The optimization overlaps process execution rather than skipping source validation. Comparisons with no untracked paths are not expected to gain the same improvement.
