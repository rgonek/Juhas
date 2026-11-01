# Installing or adapting Juhas Git Review

This is a native JavaScript Herdr mod, not a webview. Read your installation's `AGENTS.md`, `herdr.d.ts` and `gpui-kit.d.ts`; those files are authoritative for the installed version.

Copy only `mods/git-review` into the user's Herdr mods directory. Generated type files, private sessions, test scratch data and `docs/superpowers` are not distribution files. Run `herdr-app check` and inspect the live rendered view, including populated virtual rows and asynchronous errors.

The installer creates a personal clone of the main layout. The original Files/Changes `panel-body` gains a `git-review-sidebar` child (`props.role: "sidebar"`). The terminal area contains a stack named `git-review-work` with `git-review-terminal` holding the original terminal content, and `git-review-full` holding the full view. No extra toolbar or left review sidebar is added.

The installer generates a personal `git-review-tabs` clone from the installed Herdr tabs mod and inserts Review beside Files/Changes. It copies the presentation helper into that mod because Herdr does not allow imports across mod directory boundaries. Shipped tabs remain untouched. This generated clone is built locally from the installed app, not embedded as third-party source in this project's distribution. An incompatible tabs source is rejected explicitly.

Review opens in the existing right-hand panel. Expand hides that panel and selects the full review; Back to sidebar restores the original terminal and the review panel. Opening also unhides the review child itself, accommodating saved visibility state from older installations. Existing agent terminals remain alive. The always-visible tabs copy handles `git-review-tabs.open`, `git-review-tabs.review` and `git-review-tabs.full`, so opening does not depend on a hidden mod receiving commands.

Use a shared explicit `props.sessionId` when multiple copies must share a particular review session independently of spaces. An optional `props.folder` fixes the context for a custom embedding; never ship a real user's absolute path in a public layout. Without it, the mod continuously follows the active space/tab's terminal folder. It rejects stale terminal focus from another tab, isolates selections/composers by context and caches returning contexts. Inside a Git repository no chooser is shown; a parent context offers a chooser only when it contains multiple repositories. No global folder or saved-repository picker is exposed.

The outer view uses the same native frame pattern as Files/Changes: 10 px corners, clipped overflow, theme background and border, and a 42 px header. The diff occupies the full width below the history/files area. Runtime updates to an already integrated personal layout should copy only the mod files; preserve that layout's existing tabs and Files/Changes mods.

Do not overwrite shipped mods, change Git config, automatically fetch, switch branches, stage files, or modify an existing index to display a diff. Fetch runs only when the user presses its explicit header button. Query immutable commit/tree IDs and literal file paths; all Git invocations use argument arrays. Native modules must not import Node APIs.

Review draft submission is a deliberate action with a visible recipient and exact text preview. It sends a single message through `hc send`, keeps uncertain deliveries and their drafts, and never retries an uncertain batch automatically. Tests must send only to a purpose-created sink terminal in an isolated core session.

Configuration is generic: explicit base per worktree/branch, optional user-defined prefix mapping, discovery roots/limits, and a user-selected terminal. No organization-specific branch names, issue IDs, paths, or preferred agent are embedded.

Runtime and domain logic are separate. Pure modules and real-Git tests run in Node; UI uses gpui-kit/gpui-base. The graph uses a virtual list and native paths. Load metadata first and patches per selected file, and cache immutable results with bounded memory. Keep slow Git work in `cx.spawn`; never retain a View context for unrelated future callbacks.

The default interface hides repository selection and manual reference fields; `config.showAdvanced: true` restores them. Native resizable groups provide both split directions. The tabs integration scopes the expanded work stack to the active space with `syncReviewSpace`; keep that call when adapting a personal tabs clone. Range selection uses two explicit endpoint clicks, without emulating Shift or drag gestures that virtual rows do not expose.

Personal branch mapping belongs in `<Herdr home>/git-review.json`, not in this project or the layout source. Generic `baseRules` support either `{prefix, basePrefix}` or `{pattern, replacement}` with capture groups. Existing unambiguous refs are selected automatically; a saved manual base wins. Refresh reloads the local file. Leave this file untouched when installing/updating the mod.

Submission previews are scoped to the current repository and auto-select only an unambiguous live agent associated with the active tab/project. They never send automatically. The exact editable text is copied/sent; recipient changes preserve edits. Compact formatting groups locations and revisions and omits optional code quotes. Fixed-height actions sit below the flexing native editor, outside its scrolling region.
