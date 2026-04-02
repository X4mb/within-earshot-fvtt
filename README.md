# Within Earshot

Foundry **v14+** module: proximity voice over Simple Peer / WebRTC — remote volume follows token distance and walls, with optional GM global voice and a voice-token shortcut. Works with any game system.

**Controls:** **Ctrl+Shift+V** (default) — with a token selected, pins your voice to that token for proximity; press again on the same token to clear. Change bindings under **Configure Controls** → *Within Earshot*. GMs can assign a key for “Toggle GM voice” (global vs token proximity) if desired.

**Install:** Foundry → Setup → Add-on Modules → *Install Module* → paste the manifest URL below. On GitHub, use the **copy** button on the code block.

```text
https://raw.githubusercontent.com/X4mb/within-earshot-fvtt/main/module.json
```

**Repository** (clone, issues, releases):

```text
https://github.com/X4mb/within-earshot-fvtt
```

For updates, use the same manifest URL or install from a [release](https://github.com/X4mb/within-earshot-fvtt/releases) (`module.zip`).

**Install errors (`ENOENT` … `withinearshot.zip`):** Foundry downloads the package from the manifest’s **`download`** URL (`…/releases/…/download/module.zip`). That file must exist on GitHub. If you see this error, the release is missing **`module.zip`** (wrong filename, or no release). Fix: create or edit a [Release](https://github.com/X4mb/within-earshot-fvtt/releases) for the current tag and attach **`module.zip`** from `npm run release-pack`, **or** push a new `v*` tag after enabling Actions — the workflow in `.github/workflows/release.yml` builds and uploads **`module.zip`** automatically.

**Develop:** `npm install` → `npm run build`. Release package: `npm run release-pack` (attach `module.zip` to a GitHub Release, or rely on the release workflow when you push a `v*` tag).

**License:** PolyForm Noncommercial 1.0.0 — non-commercial use; modification and private/non-commercial sharing allowed. See `LICENSE`.
