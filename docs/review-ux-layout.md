# Review UX follow-up

Approved layout 2: comparison-wide view controls above file-specific headers; Single file/All files, Unified/Split, Wrap, Search and overflow. Search opens on demand, comment navigation belongs in Comments. Each All files section owns its Viewed control; the file list shows progress and Next unreviewed. General comment belongs beside Comments/Submit.

Branch picker searches loaded refs without Git calls. Expand hides/closes only the originating Juhas sidebar after a review tab exists. Comments uses a native resizable split with a stable ID. Native Textarea submit handles Enter save and Shift+Enter newline, with a two-line editor.

Feedback omits the default new-side prefix, uses old: only for original lines, and has no explanatory legend. Existing provenance, ambiguity and edited transport rules remain.

Implementation stays on the current branch, uses targeted regressions and final suite/native checks, then installs to the existing Herdr home with backup. No merge/push or host upgrade.

## Verification

Independent review found a delayed file-header comment race; controller/comparison/file checks and comparison-bound queue actions now reject superseded clicks. Header controls are retained entities created outside render/layout, dispatched through the parent async context. Unchanged header signatures avoid redundant child notifications.

Native Windows screenshots confirmed the single-file toolbar, hidden search row, Comments split and All files headers with per-file Viewed/Comment. A long unwrapped line initially pushed header controls offscreen; explicit viewport width corrected it and has a regression. Automated tests cover native submit routing, branch filtering without Git, source-specific progress, queued actions and delayed file-comment selection. Physical keyboard/IME and dragging were not automated in the user's window. The installed older Textarea API adds a newline before submit; newer submit-on-enter is feature-detected, without upgrading Herdr.
