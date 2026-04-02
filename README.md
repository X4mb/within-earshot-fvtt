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

**GitHub releases:** The installable zip has **`module.json` at the root** of the archive (plus `dist/`, `lang/`, `LICENSE`). Do not use GitHub’s green **Code → Download ZIP** for Foundry — that wraps the repo in an extra folder. Each [release](https://github.com/X4mb/within-earshot-fvtt/releases) publishes **`module.zip`** (and a copy as `withinearshot.zip`); `module.json`’s **`download`** field points at `…/releases/latest/download/module.zip`.

**Manual install (no GitHub zip):** Copy the module folder into `Data/modules/withinearshot/` so you have `module.json`, `dist/`, `lang/`, etc. (same layout as inside the zip).

**Console:** Warnings like `unreachable code after return` in **`vendor.mjs`** come from Foundry’s own bundles, not this module — safe to ignore.

**License:** PolyForm Noncommercial 1.0.0 — non-commercial use; modification and private/non-commercial sharing allowed. See `LICENSE`.
