# Juhas - Code review

Review your agent's changes in Herdr.

Review commits one by one, see a branch's combined changes, or inspect
uncommitted work. Comment beside the code, then send your feedback to the
coding agent in one review.

![Juhas code review cover with a sample diff, inline feedback and a sheep illustration](preview.png)

*Illustrated cover with a close-up of sample code and feedback. See the native screenshot below for the current interface.*

## Review workflow

- Start in **Changes** to see the combined diff, with all changed files in one
  expandable list. Include uncommitted work when needed, or switch to **Commit**,
  **Uncommitted**. Git history stays hidden until opened.
- Comment on a line, a range or a whole file. Drafts keep their original source
  when you move to another commit.
- Collect comments from several commits into one review. Check the recipient,
  edit or copy the message, then send it to your agent when you're ready.

Use the sidebar for a quick look, or open beside/below the agent or in a dedicated review tab with Git
history, a file list or tree, and a full-width Unified or Split diff. Toggle Comments, Files and History independently; place each panel above, left or right of the diff. Resize the
panels to fit the code, and use change navigation to move through the diff.
Filter changed files by path without changing the open diff. Search review recipients by name, terminal address or directory. Loading indicators show when Git is still working.

Juhas uses Herdr’s native GPUI controls. It works with local Git repositories
and agent terminals; no GitHub account or pull request is required. Base-branch
rules are yours to configure, with no built-in team conventions.

## A closer look

![A native Juhas Changes view with a compact toolbar, sample diff and inline comment](docs/images/review.png)

*A real native review view, using sample code and comments.*

## Install

You need **Herdr App 0.1.11 or later**, Git and **Node.js 22+** for the installer.
The running mod uses Herdr’s built-in JavaScript runtime and does not need Node.
Native UI verification currently covers Windows; core tests also run on Linux
and macOS.

Clone or download this repository, then run from its root:

```sh
node scripts/install.mjs
```

The installer copies the mod and backs up an existing installation without
changing layouts, toolbar mods or review data. Open a native pane:

```sh
herdr-app do pane.split --direction right --mod juhas
```

Juhas follows the project where you open it. The new-tab action opens or reuses a review
tab for that exact repository/worktree within the space. The review tab keeps
its source when you work in another terminal. With the optional toolbar integration, clicking Juhas on the source tab
focuses its existing review tab; clicking Juhas in that review returns to the sidebar,
preserving the selected commit, file and unsaved comment. Pane management uses Herdr controls.

## Your first review

1. Open **Juhas** in the project you want to review. Use the sidebar actions to open beside the agent, below it, or in a new tab.
2. Start in **Changes** for the branch diff, or choose **Commit** to inspect individual commits
   one by one. Confirm the inferred base branch or choose another when needed.
3. Choose **Uncommitted** for working files, or enable **Include uncommitted**
   in Changes to review commits and later fixes together. Click the code,
   write feedback and choose **Comment** or press **Ctrl/⌘+Enter** to save (**Enter** adds a new line). Comments can come from
   several commits and still go into one review.
4. Choose **Submit review**. Check the recipient and message, then **Send review**
   or **Copy**. Unsaved comments offer an explicit Save / Skip / Back choice.


## Local by default, deliberate when sending

Juhas sends no telemetry. Browsing reads Git locally; **Fetch** contacts your
configured remotes only when you request it. **Send review** deliberately sends
the preview text to the selected terminal.

Drafts and edited previews stay in your Herdr home. Comments keep their
original revisions and line ranges; outdated feedback is marked rather than
silently moved to another line. Full code quotes and Git headers are optional.

Visible reviews check for changes every 15 seconds without jumping away from
your selected commit/file. Unchanged sources reuse cached data. Viewed markers,
find in loaded code, optional wrapping and All files support longer reviews.
General feedback needs no file anchor.

The author reports successful review delivery to a coding agent in real use.
A send acknowledgement means the terminal accepted the message, not that the
agent finished the changes. Uncertain deliveries retain drafts and are not
retried automatically. See [local data and delivery](docs/usage.md#local-data-and-delivery)
for the details and current limits.

## Why “Juhas”?

A *juhas* is a shepherd working with the *baca*, the head shepherd in the Polish
mountain tradition. Herdr has a flock; Juhas helps you keep an eye on the work
coming back from your coding agents. You choose the base branches and layout for your own projects.

## Credits and license

Inspired by the Herdr community’s
[Git graph](https://github.com/rabeeh-ta/herdr-git-graph),
[reviewer](https://github.com/vytasgavelis/herdr-reviewer) and
[agent review](https://github.com/jkuepker/herdr-mods/tree/main/agent-review) mods.
The implementation uses Herdr, gpui-kit and gpui-base from your installation.
Bundled **Lucide** icons retain their ISC/MIT notices.

Juhas is licensed under [Apache 2.0](LICENSE). See [NOTICE](NOTICE) and
[third-party notices](THIRD_PARTY_NOTICES.md).

Maintainers: see the [publication guide](docs/publishing.md),
[verification record](docs/acceptance.md) and [design brief](docs/design-brief.md).

To add the Juhas button to an unmodified personal tabs copy, run
`node scripts/install.mjs --tabs <personal-tabs-mod>`. To upgrade an existing
Juhas toolbar integration, use `--update-tabs <personal-tabs-mod>` instead.
Both options back up the personal tabs mod and leave layout files untouched.
