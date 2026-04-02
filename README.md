# Within Earshot

> Proximity-based voice for **Foundry Virtual Tabletop** (v13+). Works with **any game system** and Foundry’s built-in **Simple Peer / WebRTC** voice — no extra voice server required.

---

## What it does

Within Earshot changes how you **hear** other people in a call: instead of everyone at the same volume, each remote speaker’s volume depends on **where their token is** on the scene relative to **your** token. It also respects **sound walls** so voices can be quieter through obstacles, the way you’d expect in a tabletop space.

---

## How it works (in play)

| | |
| --- | --- |
| **Who you hear** | Each connected user’s voice is treated as coming from their **speaker token** (see *Voice token* below). |
| **Distance** | The farther that token is from **your** controlled token (in grid spaces), the **quieter** they sound. Past the configured **maximum range**, they fade out. |
| **Walls** | **Normal** sound walls between listener and speaker reduce volume further (GM can tune how much leaks through). |
| **GM** | The GM can use the same proximity rules as everyone else, or turn on **full-volume GM voice** so players always hear the GM clearly regardless of map position. |

You still use Foundry’s normal **Audio / Video** connection; this module only adjusts **gain** (volume) per remote stream on each client.

---

## Features

- **Proximity volume** — Remote audio level follows **grid distance** between tokens (with a smooth falloff inside **maximum range**).
- **Walls** — Line-of-sound through scene walls; optional **voice through walls** strength (world setting, GM).
- **GM voice: full volume everywhere** — Optional world toggle so the GM is always heard at full level for all players (off by default; GM can also use a **keybinding** to flip global vs proximity).
- **Voice token shortcut** — Default **Ctrl+Shift+V** while a token is selected: **pin** your “speaking position” to that token, or **clear** the pin to fall back to your assigned character token. Rebind under **Configure Controls → Within Earshot**.
- **Mute when speaker unknown** — Optional world rule: if a player’s speaking position can’t be resolved on the map, other players won’t hear them (GM still does). Off by default to avoid “GM hears me, players don’t” surprises.
- **Visual hint** — A ring can show where your voice is sourced from on the map (updates as tokens move).

---

## Requirements

- **Foundry v13** or newer  
- **Built-in A/V** using **Simple Peer** (the default WebRTC mode this module extends)

---

## Install

**Foundry:** *Setup → Add-on Modules → Install Module* → paste the manifest URL. On GitHub, use the **copy** button on the code block.

```text
https://raw.githubusercontent.com/X4mb/within-earshot-fvtt/main/module.json
```

---

## Links

| | |
| --- | --- |
| **Repository** | `https://github.com/X4mb/within-earshot-fvtt` |
| **Releases** | [GitHub Releases](https://github.com/X4mb/within-earshot-fvtt/releases) (`module.zip`) |

---

## License

**PolyForm Noncommercial 1.0.0** — non-commercial use; you may modify and share for non-commercial purposes. See [`LICENSE`](LICENSE).
