# Compatibility

Baseline: Herdr App 0.1.10 on Windows; runtime JavaScript with gpui-kit, gpui-base and herdr APIs. No Node or browser runtime is needed by the mod. Node >=22 and Git are used by the test suite.

The isolated native spike rendered two copies of a 3,000-row virtual list and a shared selection in a sidebar and full work-area stack. `layout.select {stack,child}` selects the review card or terminal without ending the terminal. This meets the full-card requirement without a Herdr source change. A custom mod draws the card tabs: the installed documentation's shorthand `header: "tabs"` is rejected by this version's parser and is not used.

Core tests execute against real temporary Git repositories. Native UI verification is recorded separately in acceptance.md. Linux/macOS support is designed through platform adapters; a local Windows result does not assert native verification on those systems. Remote SSH is outside initial acceptance.

The app's generated API files are the version-specific reference. Run `herdr-app check <mod-directory>` after installation and inspect the running UI: check alone does not execute virtual rows or asynchronous states.

Resizable panes use native `h_resizable`, `v_resizable` and `resizable_panel`. The installed runtime must expose these APIs. Virtual lists expose a single click key without mouse modifiers, so range selection uses explicit endpoints and split-diff comments have an explicit old/new side selector. No global modifier tracking or pointer interception is used.

The review UI uses the installed gpui-base `Button`, `Checkbox`, `Toggle` and `Popover` primitives. A small shared theme adapter provides their presentation, as these primitives are unstyled. Native popovers host the existing virtualized branch and recipient lists. The installed Select binding requires consumer-owned option navigation, so it is not substituted for a complete selector. Toolbar selections are groups of native Buttons, including comparison modes, graph filters, diff modes and comment side; the mod uses no Tabs/Tab controls. Inputs, editable review text, resizable groups, scrollbars and virtual lists continue to use native components. A ready-made Tree/Diff binding is not present in the installed JavaScript API.

Diff change navigation uses `VirtualListScrollHandle.new()` in view initialization, `track_scroll` on the active virtual list and `scroll_to_item` from toolbar/command events. The handle is released on view close. The Rust Diff component and its measured annotations are not bound in this installed JavaScript runtime. There is no complete split-view API with independent source viewports and synchronized vertical alignment. Juhas uses bounded native-layout comment cards with a scrolling text body and retains its single diff scroll surface, without per-row event-handler or wheel synchronization workarounds.
