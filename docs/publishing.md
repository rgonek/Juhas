# Publishing Juhas

Juhas is prepared as an early beta for Herdr. Preparing this repository or a
local package does not change repository visibility or publish a GitHub release.

## Package contents

Keep README.md, RECIPE.md, preview.png, LICENSE, NOTICE, THIRD_PARTY_NOTICES.md,
mods/juhas, the installation scripts and the linked documentation together.
There is no root layouts directory. The installer generates a personal layout
locally; the mod is not tied to the author's layout or branch conventions.

The release allowlist is maintained in scripts/package.mjs. It excludes local
review sessions, private configuration, test fixtures, generated type files,
logs and workflow notes. New public images or documentation must be explicitly
added to that list. Do not package an installed Herdr home.

## GitHub presentation

Description:

> Review coding-agent changes inside Herdr, leave inline comments and send one clear round of feedback.

Suggested topics: herdr-mod, herdr, gpui, git, code-review, coding-agents.

Use preview.png as the README and repository preview. It combines an illustration
with the actual native Juhas view using synthetic data. The separate
docs/images/review.png contains the same native screenshot without the artwork.
Neither image contains real project paths, agent messages or unrelated spaces.

For community discovery, publish a GitHub repository tagged herdr-mod. Include
mods/juhas, RECIPE.md and preview.png, without a root layouts directory. Listing
and image screening are separate steps. Check the [current directory instructions](https://herdr.dev/mods/)
before submitting or claiming that the listing is live.

## Supported baseline

- Herdr App 0.1.11 or later, exposing the documented JavaScript mod APIs.
- Native UI verification on Windows. Core CI runs on Windows, Linux and macOS;
  native interaction on macOS/Linux is not verified.
- Git for repository reads, and Node.js 22+ for the installer/developer tests.
  The running mod does not require Node.
- Local repositories for initial acceptance. Remote SSH is outside the supported
  acceptance scope.

The CLI installer rejects older or unrecognized Herdr versions before copying
files. The tabs integration is generated from the installed stock tabs mod and
rejects an incompatible source structure. A version number alone does not
replace the API check.

## Verification and packaging

Run from a source checkout:

```sh
npm test
herdr-app check mods/juhas
node scripts/package.mjs --check
node scripts/package.mjs --out dist/juhas-0.1.0
```

The output directory must be absent or empty. The package check reports whether
a nonempty project license is present; it is not a complete acceptance verdict.
Confirm the output contains this guide, the usage guide, preview, project license,
NOTICE and the Lucide license. Check local Markdown/image links and inspect the
public file list before archiving the output for a release.

The project is licensed under Apache-2.0, matching Kolczyk. Bundled icons retain
their own notices. package.json remains private to prevent accidental npm
publication; that does not prevent distributing a Herdr mod through GitHub.

## Deferred acceptance

The owner reports successful review delivery to a coding agent in real use.
The separate clean-profile install and full Herdr restart smoke test is deferred
and has not been performed. Fresh isolated installation checks, deterministic
controller/transport tests and native rendering checks cover different things.
Keep this distinction visible for the initial beta;
see the [verification record](acceptance.md).

## Publication steps

1. Review licenses, documentation, the package and screenshots. Confirm private
   configuration and review data are absent from both tracked files and history.
2. Commit and push the intended default branch, then check its CI result.
3. When the owner chooses to publish, make the repository public and apply the
   description/topics above. Tag the reviewed commit and create a beta release
   with the inspected package if a downloadable release is wanted.
4. Open the repository without signing in. Check the README image, recipe,
   installation links and community-directory status.

## Updating the preview

Capture the native view with sample data using herdr-app shot. Crop to the
review panel before saving docs/images/review.png; exclude terminal output, real paths,
space names and other windows. Keep raw captures in ignored scratch storage.
Inspect the cropped image and keep it aligned with the shipped UI. Presentation
work must not send a review or create a checkpoint in a user's repository.
