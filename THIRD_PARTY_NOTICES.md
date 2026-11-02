# Third-party notices

This implementation is written independently; it does not embed source from the referenced community mods. Herdr, gpui-kit and gpui-base are supplied by the user's Herdr installation, not redistributed here.

At installation, a personal tabs clone is generated from the user's installed Herdr tabs mod to add the Review button. The project's release contains the generator, not a bundled copy of Herdr's tabs source. The installed clone retains the app's asset references and is backed up before replacement.

Design references:

- https://github.com/rabeeh-ta/herdr-git-graph — native history, graph lanes and caching.
- https://github.com/vytasgavelis/herdr-reviewer — grouped draft comments and submission.
- https://github.com/jkuepker/herdr-mods/tree/main/agent-review — review checkpoints and terminal delivery.

## Lucide icons

Juhas uses unmodified SVG icons from [Lucide](https://github.com/lucide-icons/lucide), the icon family used by Herdr's shipped UI. Vendored from commit `a630cec77eac6568b989e87e4947a8bfe45caacd`; no dependency on another installed mod's asset paths is required.

Local asset names map to upstream names: refresh = refresh-cw, fetch = download, expand = maximize-2, collapse = minimize-2, comment = message-square, more = ellipsis. Copy, arrow-up, arrow-down, chevron-right, chevron-down, check and loader-circle retain their upstream names.

Copyright (c) 2026 Lucide Icons and Contributors. Feather-derived icons also carry Copyright (c) 2013-present Cole Bemis. The full ISC and MIT notices are included in [LICENSE-Lucide.txt](mods/juhas/icons/LICENSE-Lucide.txt) and distributed with the mod.
