# Gallery preview

`preview.png` is the cover shown on the unopened mod card in the [Herdr gallery](https://herdr.dev/gallery/?type=mods). Keep the 1586 × 992 PNG and its illustrated frame. The gallery card uses a 16:10 viewport with the image aligned to the top left.

## Capture the review

1. Run the current Juhas mod in an isolated Herdr profile with synthetic Git repositories. Set up three repositories under one folder and leave uncommitted additions and deletions in at least two so the expanded selector shows real line counts.
2. Open **Changes** for a feature branch against its base. Put **Files** in tree mode on the left and the **All files** diff on the right. Align the two toolbar dividers. Keep the window compact so the UI occupies more of the card. A 1080 × 474 px capture worked for the current frame.
3. Show an added file, a deleted file, and distinct file icons such as TypeScript, CSS, YAML, JSON and Markdown. Leave enough tree rows visible below the expanded repository selector. Expand at least two diffs and save a sample inline comment. Keep the full comment visible.
4. Move the pointer off interactive controls, wait for loading and tooltips to clear, then capture the live view with `herdr-app shot <path.png>`. The capture should contain only the demo review, with no personal paths, terminals, or agent data.

## Compose and check

1. Use [the transparent frame](images/preview-frame.png) as the top layer at its original size. Place the screenshot beneath it in the 1512 × 663 px opening at x=37, y=219. Match that aspect ratio in the capture or crop excess space before scaling. The frame already includes the sheep in front of the screenshot.
2. Flatten the result to an opaque PNG and save it as `preview.png` at the repository root.
3. Inspect the full-size PNG for clipped controls, frame seams, and artifacts around the sheep. Inspect a 400 × 250 px version for the gallery card. Check that **Changes**, the expanded repository selector and its counts, the varied file icons, the added and deleted files, and the saved comment are recognizable without opening the mod description.
