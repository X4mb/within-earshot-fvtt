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

For updates, use the same manifest URL or install from a [release](https://github.com/X4mb/within-earshot-fvtt/releases) (`withinearshot.zip`).

**Install errors (`ENOENT` … `withinearshot.zip`):** Per [Foundry’s package flow](https://foundryvtt.com/article/package-management/), the app fetches your manifest, then downloads the **`download`** URL and unpacks it into `Data/modules/<module id>/`. The server first stages a zip named like **`withinearshot.zip`**. If the **`download`** URL returns **404** (no [GitHub Release](https://github.com/X4mb/within-earshot-fvtt/releases) yet, or the asset name does not match), nothing is saved and you get **ENOENT**. **Fix:** publish a Release whose assets include **`withinearshot.zip`** (run `npm run release-pack` locally, or push a `v*` tag so Actions uploads it). **Verify** before sharing: open `https://github.com/X4mb/within-earshot-fvtt/releases/latest/download/withinearshot.zip` in a browser — it must download a zip, not 404.

**Manual install (no GitHub zip):** Copy the module folder into `Data/modules/withinearshot/` so you have `module.json`, `dist/`, `lang/`, etc. (same layout as inside the zip).

**Console:** Warnings like `unreachable code after return` in **`vendor.mjs`** come from Foundry’s own bundles, not this module — safe to ignore.

**Develop:** `npm install` → `npm run build`. Release package: `npm run release-pack` → upload **`withinearshot.zip`** to a GitHub Release, or push a `v*` tag and let `.github/workflows/release.yml` attach it.

**License:** PolyForm Noncommercial 1.0.0 — non-commercial use; modification and private/non-commercial sharing allowed. See `LICENSE`.
