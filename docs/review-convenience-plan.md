# Review convenience implementation

Scope approved by the request to add the three highest-value opportunities from the visual audit.

1. Add a local path filter above Files. Match current and previous paths, case-insensitively with normalized separators. Reveal matching tree ancestors without changing saved collapse state. Keep the active diff and full review scope intact; show matching/total counts and an empty state.
2. Add recipient search to the native picker. Match address, title, program and directory within the chosen recipient scope. Show directory context and a distinct no-results message. Selection and edited review text remain unchanged by filtering.
3. Expose Mark seen and Checkpoints in the comparison toolbar. Reuse existing guarded operations and baseline panel; remove duplicated menu actions. Explain an empty checkpoint list.
4. Verify contracts with focused tests, then run the full suite and native check. Install without layout changes, exercise populated native filters and checkpoint controls against the existing temporary CivicLens branch, and commit the finished additions separately.
