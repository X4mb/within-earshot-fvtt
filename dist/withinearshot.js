// src/constants.ts
var MODULE_ID = "withinearshot";
var FLAG_VOICE_TOKEN_ID = "voiceTokenId";
var VOICE_INDICATOR_LAYER = "withinearshotVoiceIndicator";

// src/avSessionLog.ts
var MAX = 1500;
var buf = [];
function pushAvSessionLog(tag, data) {
  buf.push({ t: Date.now(), tag, data });
  if (buf.length > MAX) buf.splice(0, buf.length - MAX);
}
function getAvSessionLogSnapshot(maxLines = 400) {
  const slice = buf.slice(-maxLines);
  return JSON.stringify(slice, null, 0);
}
function clearAvSessionLog() {
  buf.length = 0;
}
function copyAvSessionLogToClipboard() {
  const s2 = getAvSessionLogSnapshot();
  void navigator.clipboard?.writeText(s2);
  pushAvSessionLog("session:copy", { len: s2.length });
}

// src/voiceProfile.ts
function getVoiceProfileForActor(actor) {
  if (!actor) return null;
  const data = actor.getFlag(
    MODULE_ID,
    "voiceProfile"
  );
  if (!data || typeof data !== "object") return null;
  return data;
}

// src/proximity.ts
var KNEE_FRAC = 0.5;
var A_KNEE = Math.pow(10, -12 / 20);
var OUTER_POWER = 3;
var NEAR_GRID_FULL = 0.55;
function computeProximityGain(distanceGrid, maxRange) {
  if (maxRange <= 0) return 1;
  if (distanceGrid <= 0) return 1;
  if (distanceGrid <= NEAR_GRID_FULL) return 1;
  if (distanceGrid >= maxRange) return 0;
  const kneeDist = maxRange * Math.min(0.85, Math.max(0.15, KNEE_FRAC));
  if (distanceGrid <= kneeDist) {
    const u2 = kneeDist > 0 ? distanceGrid / kneeDist : 1;
    return 1 + (A_KNEE - 1) * u2;
  }
  const span = maxRange - kneeDist;
  const u = span > 0 ? (distanceGrid - kneeDist) / span : 1;
  return A_KNEE * Math.pow(1 - u, OUTER_POWER);
}
function getPrimaryTokenForUser(remoteUser) {
  const actor = remoteUser.character;
  if (!actor || !canvas?.scene || !canvas.tokens) return null;
  const docs = Array.from(canvas.scene.tokens).filter((d) => d.actor?.id === actor.id);
  if (docs.length === 0) return null;
  const owned = docs.filter((d) => d.testUserPermission(remoteUser, "OWNER"));
  const pool = owned.length > 0 ? owned : docs;
  pool.sort((a, b) => (a.id ?? "").localeCompare(b.id ?? ""));
  const d0 = pool[0];
  if (!d0?.id) return null;
  return canvas.tokens.get(d0.id) ?? null;
}
function getSoleOwnedTokenOnSceneForUser(user) {
  if (!canvas?.scene || !canvas.tokens) return null;
  const ownedDocs = Array.from(canvas.scene.tokens).filter((d) => d.testUserPermission(user, "OWNER"));
  if (ownedDocs.length !== 1) return null;
  const d0 = ownedDocs[0];
  if (!d0?.id) return null;
  return canvas.tokens.get(d0.id) ?? null;
}
function getCenterPointFromTokenDocument(doc) {
  const c = doc.getCenterPoint();
  const el = c.elevation ?? doc.elevation ?? 0;
  return { x: c.x, y: c.y, elevation: el };
}
function getListenerTokenForProximity() {
  if (!canvas?.tokens || !canvas?.scene) return null;
  const u = game.user;
  if (!u) return null;
  const controlled = canvas.tokens.controlled[0];
  if (controlled?.document?.testUserPermission(u, "OWNER")) {
    return controlled;
  }
  const actor = u.character;
  if (actor) {
    const docs = Array.from(canvas.scene.tokens).filter((d) => d.actor?.id === actor.id);
    if (docs.length > 0) {
      const owned = docs.filter((d) => d.testUserPermission(u, "OWNER"));
      const pool = owned.length > 0 ? owned : docs;
      pool.sort((a, b) => (a.id ?? "").localeCompare(b.id ?? ""));
      const primaryDoc = pool[0];
      const primaryId = primaryDoc?.id;
      const primaryTok = primaryId ? canvas.tokens.get(primaryId) : null;
      if (primaryTok) {
        if (controlled) {
          const ctrlDoc = controlled.document;
          const ctrlIsThisCharacter = docs.some((d) => d.id === ctrlDoc.id);
          if (ctrlIsThisCharacter) return controlled;
        }
        return primaryTok;
      }
    }
  }
  if (controlled) return controlled;
  return getPrimaryTokenForUser(u) ?? getSoleOwnedTokenOnSceneForUser(u);
}
function gridDistanceBetween(a, b) {
  const dim = canvas?.dimensions;
  if (!dim) return 0;
  const ax = Math.round(a.x * 4) / 4;
  const ay = Math.round(a.y * 4) / 4;
  const bx = Math.round(b.x * 4) / 4;
  const by = Math.round(b.y * 4) / 4;
  const dx = bx - ax;
  const dy = by - ay;
  const px = Math.hypot(dx, dy);
  if (px <= 0) return 0;
  const size = dim.size;
  if (typeof size === "number" && size > 0) {
    const grid = px / size;
    return Math.round(grid * 5) / 5;
  }
  return 0;
}
function getProximityCenterFromToken(token) {
  return getCenterPointFromTokenDocument(token.document);
}

// src/settings.ts
function s() {
  return game.settings;
}
function loc(key, fallback) {
  const v = game.i18n?.localize(key) ?? key;
  return v === key ? fallback : v;
}
var SETTINGS = {
  MAX_RANGE: "maxRange",
  GM_VOICE_GLOBAL: "gmVoiceGlobal",
  /** 1 = no muffling through walls; 0.05 default (heavy muffling). World scope = GM only. */
  THROUGH_WALL_GAIN: "throughWallGain",
  /**
   * World (GM): when true, non-GM speakers with no resolvable token on the scene are silent to other
   * players (GM still hears everyone). When false (default), they are heard at full volume until a token exists.
   */
  MUTE_UNRESOLVED_SPEAKER: "muteUnresolvedSpeaker"
};
function registerModuleSettings() {
  s().register(MODULE_ID, SETTINGS.MAX_RANGE, {
    name: loc(`${MODULE_ID}.SETTINGS.maxRange.name`, "Maximum range (grid units)"),
    hint: loc(
      `${MODULE_ID}.SETTINGS.maxRange.hint`,
      "Beyond this many grid spaces (Foundry ruler units). One unit = one map cell."
    ),
    scope: "world",
    config: true,
    type: Number,
    range: { min: 1, max: 500, step: 1 },
    default: 15
  });
  s().register(MODULE_ID, SETTINGS.GM_VOICE_GLOBAL, {
    name: loc(`${MODULE_ID}.SETTINGS.gmVoiceGlobal.name`, "GM voice: full volume everywhere"),
    hint: loc(
      `${MODULE_ID}.SETTINGS.gmVoiceGlobal.hint`,
      "When enabled, the GM is always heard at full volume (no proximity). When disabled, the GM uses token proximity like everyone else."
    ),
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });
  s().register(MODULE_ID, SETTINGS.THROUGH_WALL_GAIN, {
    name: loc(`${MODULE_ID}.SETTINGS.throughWallGain.name`, "Voice through walls"),
    hint: loc(
      `${MODULE_ID}.SETTINGS.throughWallGain.hint`,
      "World setting (GM only). How much volume remains after a Normal sound wall. 1 = no muffling; lower = quieter through walls. Limited / Proximity / Distance scale from this."
    ),
    scope: "world",
    config: true,
    type: Number,
    range: { min: 0.05, max: 1, step: 0.05 },
    default: 0.05
  });
  s().register(MODULE_ID, SETTINGS.MUTE_UNRESOLVED_SPEAKER, {
    name: loc(`${MODULE_ID}.SETTINGS.muteUnresolvedSpeaker.name`, "Mute voice when speaker token unknown"),
    hint: loc(
      `${MODULE_ID}.SETTINGS.muteUnresolvedSpeaker.hint`,
      "When enabled, a player whose speaking position cannot be placed on the map (no character token, etc.) is inaudible to other players; the GM still hears them. When disabled, they are heard at full volume until a token can be resolved (recommended for reliability)."
    ),
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });
}
function registerModuleKeybindings() {
  game.keybindings?.register(MODULE_ID, "toggleGMVoiceGlobal", {
    name: loc(`${MODULE_ID}.SETTINGS.toggleGMVoiceGlobal.name`, "Toggle GM voice (global vs token proximity)"),
    hint: loc(
      `${MODULE_ID}.SETTINGS.toggleGMVoiceGlobal.hint`,
      "GM only: switch between global GM voice and token-based proximity."
    ),
    onDown: () => {
      if (!game.user?.isGM) return;
      void setGmVoiceGlobal(!getGmVoiceGlobal());
    }
  });
}
function getMaxRange() {
  const v = s().get(MODULE_ID, SETTINGS.MAX_RANGE);
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return 15;
  return Math.min(500, Math.max(1, n));
}
function getGmVoiceGlobal() {
  return s().get(MODULE_ID, SETTINGS.GM_VOICE_GLOBAL);
}
function setGmVoiceGlobal(v) {
  return s().set(MODULE_ID, SETTINGS.GM_VOICE_GLOBAL, v);
}
function getThroughWallGain() {
  const v = s().get(MODULE_ID, SETTINGS.THROUGH_WALL_GAIN);
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0.05;
  return Math.min(1, Math.max(0.05, n));
}
function getMuteUnresolvedSpeaker() {
  try {
    return Boolean(s().get(MODULE_ID, SETTINGS.MUTE_UNRESOLVED_SPEAKER));
  } catch {
    return false;
  }
}

// src/proximityLos.ts
var EDGE_SOUND = {
  NONE: 0,
  LIMITED: 10,
  NORMAL: 20,
  PROXIMITY: 30,
  DISTANCE: 40
};
function restrictionToMultiplier(restriction, wallVolumeBase) {
  const base = Math.min(1, Math.max(0, wallVolumeBase));
  switch (restriction) {
    case EDGE_SOUND.NONE:
      return 1;
    case EDGE_SOUND.LIMITED:
      return 0.45 + 0.55 * base;
    case EDGE_SOUND.NORMAL:
      return base;
    case EDGE_SOUND.PROXIMITY:
    case EDGE_SOUND.DISTANCE:
      return Math.min(1, 0.88 * base + 0.04);
    default:
      return base;
  }
}
function multiplyVertices(vertices, wallVolumeBase) {
  if (vertices.length === 0) return 1;
  let mult = 1;
  for (const v of vertices) {
    const r = v.restriction ?? EDGE_SOUND.NORMAL;
    mult *= restrictionToMultiplier(r, wallVolumeBase);
  }
  return Math.min(1, Math.max(0, mult));
}
function getVoiceLosMultiplier(listenerToken, speakerDoc) {
  if (listenerToken.id === speakerDoc.id) return 1;
  const wallVolumeBase = getThroughWallGain();
  if (wallVolumeBase >= 0.999) return 1;
  const dim = canvas?.dimensions;
  const SoundPoly = CONFIG.Canvas?.polygonBackends?.sound;
  if (!dim || !SoundPoly?.testCollision) return 1;
  const l = getProximityCenterFromToken(listenerToken);
  const g = getCenterPointFromTokenDocument(speakerDoc);
  const snap = (n) => Math.round(n * 10) / 10;
  const lx = snap(l.x);
  const ly = snap(l.y);
  const sx = snap(g.x);
  const sy = snap(g.y);
  const elL = l.elevation;
  const elS = g.elevation;
  const origin = { x: lx, y: ly, elevation: elL };
  const destination = { x: sx, y: sy, elevation: elS };
  const test = SoundPoly.testCollision;
  if (!test) return 1;
  try {
    const vertices = test.call(SoundPoly, origin, destination, {
      type: "sound",
      mode: "all",
      radius: dim.maxR,
      useThreshold: true
    });
    if (!Array.isArray(vertices) || vertices.length === 0) return 1;
    const out = multiplyVertices(vertices, wallVolumeBase);
    return Math.round(Math.min(1, Math.max(0, out)) * 20) / 20;
  } catch {
    return Math.round(Math.min(1, Math.max(0, wallVolumeBase)) * 20) / 20;
  }
}

// src/voiceToken.ts
function canUserPickVoiceToken(user, token) {
  if (user.isGM) return true;
  return token.document.testUserPermission(user, "OWNER");
}
function getVoiceTokenIdFromUser(user) {
  const v = user.getFlag(
    MODULE_ID,
    FLAG_VOICE_TOKEN_ID
  );
  return typeof v === "string" && v.length > 0 ? v : null;
}
function getSpeakerTokenDocumentForUser(remoteUser) {
  const pinId = getVoiceTokenIdFromUser(remoteUser);
  if (pinId && canvas?.scene) {
    const pinned = canvas.scene.tokens.get(pinId);
    if (pinned) return pinned;
  }
  if (!canvas?.scene) return null;
  const actor = remoteUser.character;
  if (actor) {
    const docs = Array.from(canvas.scene.tokens).filter((d) => d.actor?.id === actor.id);
    if (docs.length === 0) return null;
    const owned = docs.filter((d) => d.testUserPermission(remoteUser, "OWNER"));
    const pool = owned.length > 0 ? owned : docs;
    pool.sort((a, b) => (a.id ?? "").localeCompare(b.id ?? ""));
    return pool[0] ?? null;
  }
  const ownedDocs = Array.from(canvas.scene.tokens).filter((d) => d.testUserPermission(remoteUser, "OWNER"));
  if (ownedDocs.length === 0) return null;
  ownedDocs.sort((a, b) => (a.id ?? "").localeCompare(b.id ?? ""));
  return ownedDocs[0] ?? null;
}
function getSpeakerTokenForUser(remoteUser) {
  const doc = getSpeakerTokenDocumentForUser(remoteUser);
  if (!doc || !canvas?.tokens) return null;
  const sid = doc.id;
  if (!sid) return null;
  return canvas.tokens.get(sid) ?? null;
}
function getVoiceSourceTokenForDisplay(user) {
  if (user.isGM && !getVoiceTokenIdFromUser(user)) return null;
  return getSpeakerTokenForUser(user);
}
async function clearVoiceTokenFlagForCurrentUser() {
  const user = game.user;
  if (!user?.unsetFlag) return;
  try {
    await user.unsetFlag(MODULE_ID, FLAG_VOICE_TOKEN_ID);
  } catch {
  }
}
async function toggleVoiceTokenForCurrentUser(token) {
  const user = game.user;
  if (!user) return;
  if (!canUserPickVoiceToken(user, token)) {
    ui.notifications?.warn(loc(`${MODULE_ID}.VOICE.cannotPick`, "You can only set your voice token to a token you own."));
    return;
  }
  const current = getVoiceTokenIdFromUser(user);
  const next = current === token.id ? null : token.id;
  const u = user;
  try {
    if (next === null) await u.unsetFlag(MODULE_ID, FLAG_VOICE_TOKEN_ID);
    else await u.setFlag(MODULE_ID, FLAG_VOICE_TOKEN_ID, next);
  } catch (err) {
    const msg2 = err instanceof Error ? err.message : String(err);
    ui.notifications?.error(`Within Earshot: could not save voice token (${msg2})`);
    return;
  }
  const name = token.name ?? token.document.name;
  const msg = next === null ? loc(`${MODULE_ID}.VOICE.cleared`, "Voice position: automatic (assigned character token).") : loc(`${MODULE_ID}.VOICE.set`, "Voice position: speaking as {name}.").replace("{name}", name);
  ui.notifications?.info(msg);
}

// src/avClientGain.ts
var lastClientState = /* @__PURE__ */ new Map();
function clearClientGainStateForPeer(userId) {
  lastClientState.delete(userId);
}
function getFoundryClientGainForPeer(userId) {
  let tag;
  let result;
  const settings = game.webrtc?.settings;
  if (!settings) {
    tag = "no_webrtc_settings";
    result = 1;
  } else if (settings.client.muteAll) {
    tag = "muteAll";
    result = 0;
  } else {
    const u = settings.getUser(userId);
    if (!u) {
      tag = "no_user_row";
      result = 1;
    } else {
      const v = u.volume;
      if (typeof v !== "number" || !Number.isFinite(v)) {
        tag = "volume_invalid";
        result = 1;
      } else if (v <= 0) {
        tag = "volume_zero_as_full";
        result = 1;
      } else {
        tag = "volume";
        result = Math.min(1, Math.max(0, v));
      }
    }
  }
  const sig = `${tag}:${result}`;
  if (lastClientState.get(userId) !== sig) {
    lastClientState.set(userId, sig);
    pushAvSessionLog("clientGain", { userId, tag, result });
  }
  return result;
}

// src/proximityAudioRouter.ts
function quantizeEnvGain(x) {
  const c = Math.min(1, Math.max(0, x));
  return Math.round(c * 20) / 20;
}
var ENV_GAIN_STICKY_EPS = 0.04;
function isGameMasterUser(user) {
  if (!user) return false;
  if (user.isGM === true) return true;
  const role = user.role;
  if (typeof role === "number" && role >= CONST.USER_ROLES.ASSISTANT) return true;
  try {
    return user.hasRole(CONST.USER_ROLES.GAMEMASTER, { exact: false });
  } catch {
    return false;
  }
}
var ProximityAudioRouter = class {
  audioContext = null;
  peers = /* @__PURE__ */ new Map();
  lastStableEnvGain = /* @__PURE__ */ new Map();
  get context() {
    if (!this.audioContext) this.audioContext = new AudioContext();
    return this.audioContext;
  }
  async ensureResumed() {
    const ctx = this.context;
    if (ctx.state === "suspended") await ctx.resume();
  }
  attachPeer(userId, stream) {
    if (this.peers.has(userId)) this.detachPeer(userId);
    const ctx = this.context;
    const source = ctx.createMediaStreamSource(stream);
    const profileGain = ctx.createGain();
    const clientGain = ctx.createGain();
    const proximityGain = ctx.createGain();
    source.connect(profileGain);
    profileGain.connect(clientGain);
    clientGain.connect(proximityGain);
    proximityGain.connect(ctx.destination);
    const remoteUser = game.users?.get(userId);
    const mult = getVoiceProfileForActor(remoteUser?.character ?? null)?.gainMultiplier ?? 1;
    profileGain.gain.value = Math.min(2, Math.max(0, mult));
    this.peers.set(userId, { source, profileGain, clientGain, proximityGain, stream });
    this.lastStableEnvGain.delete(userId);
    pushAvSessionLog("peer:attach", { userId });
    this.refreshGain(userId);
  }
  detachPeer(userId) {
    this.lastStableEnvGain.delete(userId);
    clearClientGainStateForPeer(userId);
    pushAvSessionLog("peer:detach", { userId });
    const p = this.peers.get(userId);
    if (!p) return;
    try {
      p.source.disconnect();
      p.profileGain.disconnect();
      p.clientGain.disconnect();
      p.proximityGain.disconnect();
    } catch {
    }
    this.peers.delete(userId);
  }
  detachAll() {
    for (const id of [...this.peers.keys()]) this.detachPeer(id);
  }
  refreshGain(userId) {
    const p = this.peers.get(userId);
    if (!p) return;
    const rawClient = getFoundryClientGainForPeer(userId);
    const clientG = rawClient <= 0 ? 0 : rawClient >= 1 ? 1 : Math.round(rawClient * 20) / 20;
    p.clientGain.gain.value = clientG;
    const env = this.computeGainForSpeaker(userId);
    let q = Math.min(1, Math.max(0, env));
    const prev = this.lastStableEnvGain.get(userId);
    if (prev !== void 0 && Math.abs(q - prev) < ENV_GAIN_STICKY_EPS) {
      q = prev;
    } else {
      this.lastStableEnvGain.set(userId, q);
    }
    p.proximityGain.gain.value = q;
  }
  /** Recompute all remote peer gains (no artificial throttle — canvas ticker + hooks drive rate). */
  refreshAllGains(_force = true) {
    for (const id of this.peers.keys()) this.refreshGain(id);
  }
  get peerCount() {
    return this.peers.size;
  }
  updateProfileGainForUser(userId) {
    const p = this.peers.get(userId);
    if (!p) return;
    const remoteUser = game.users?.get(userId);
    const mult = getVoiceProfileForActor(remoteUser?.character ?? null)?.gainMultiplier ?? 1;
    p.profileGain.gain.value = Math.min(2, Math.max(0, mult));
  }
  computeGainForSpeaker(speakerUserId) {
    const speaker = game.users?.get(speakerUserId);
    if (!speaker) return 1;
    if (isGameMasterUser(game.user)) return 1;
    if (isGameMasterUser(speaker) && getGmVoiceGlobal()) return 1;
    if (isGameMasterUser(speaker) && !getVoiceTokenIdFromUser(speaker)) return 1;
    const maxRange = getMaxRange();
    if (!canvas?.scene) return 1;
    const listenerToken = getListenerTokenForProximity();
    if (!listenerToken) return 1;
    const speakerDoc = getSpeakerTokenDocumentForUser(speaker);
    if (!speakerDoc) {
      if (isGameMasterUser(speaker)) return 1;
      if (getMuteUnresolvedSpeaker()) return canvas.ready ? 0 : 1;
      return 1;
    }
    const lp = getProximityCenterFromToken(listenerToken);
    const sp = getCenterPointFromTokenDocument(speakerDoc);
    const listenerPoint = { x: lp.x, y: lp.y };
    const speakerPoint = { x: sp.x, y: sp.y };
    const distanceGrid = gridDistanceBetween(listenerPoint, speakerPoint);
    const proximity = computeProximityGain(distanceGrid, maxRange);
    const los = getVoiceLosMultiplier(listenerToken, speakerDoc);
    let combined = proximity * los;
    if (combined >= 0.995) combined = 1;
    return quantizeEnvGain(combined);
  }
};
var proximityRouter = new ProximityAudioRouter();
var rafScheduled = false;
function scheduleProximityRefresh() {
  if (rafScheduled) return;
  rafScheduled = true;
  requestAnimationFrame(() => {
    rafScheduled = false;
    proximityRouter.refreshAllGains(true);
  });
}

// src/ProximitySimplePeerAVClient.ts
var Base = foundry.av.clients.SimplePeerAVClient;
var ProximitySimplePeerAVClient = class extends Base {
  async initializePeerStream(userId) {
    const inst = await super.initializePeerStream(userId);
    await this.#wirePeerWhenReady(userId);
    return inst;
  }
  async disconnectPeer(userId) {
    proximityRouter.detachPeer(userId);
    return super.disconnectPeer(userId);
  }
  async disconnectAll() {
    proximityRouter.detachAll();
    return super.disconnectAll();
  }
  async disconnect() {
    proximityRouter.detachAll();
    return super.disconnect();
  }
  async setUserVideo(userId, videoElement) {
    await super.setUserVideo(userId, videoElement);
    if (userId !== game.user?.id) {
      videoElement.muted = true;
      videoElement.volume = 0;
    }
    scheduleProximityRefresh();
  }
  async onSettingsChanged(changed) {
    await super.onSettingsChanged(changed);
    scheduleProximityRefresh();
  }
  async #wirePeerWhenReady(userId, attempt = 0) {
    const stream = this.remoteStreams.get(userId);
    if (stream && stream.getAudioTracks().length > 0) {
      proximityRouter.attachPeer(userId, stream);
      await proximityRouter.ensureResumed();
      return;
    }
    if (attempt > 30) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
    return this.#wirePeerWhenReady(userId, attempt + 1);
  }
};

// src/voiceProfileSet.ts
async function persistVoiceProfileFlag(actor, profile) {
  const a = actor;
  if (profile === null) await a.unsetFlag(MODULE_ID, "voiceProfile");
  else await a.setFlag(MODULE_ID, "voiceProfile", profile);
}

// src/voiceIndicatorLayer.ts
var rafId = 0;
function ensureGraphics(layer) {
  let g = layer.getChildByName(VOICE_INDICATOR_LAYER);
  if (!g) {
    g = new PIXI.Graphics();
    g.name = VOICE_INDICATOR_LAYER;
    g.eventMode = "none";
    if (!layer.sortableChildren) layer.sortableChildren = true;
    g.zIndex = 999999;
    layer.addChild(g);
  }
  return g;
}
function positionOnTokenLayer(layer, g, token) {
  const pt = new PIXI.Point();
  token.getGlobalPosition(pt);
  layer.toLocal(pt, void 0, pt);
  g.position.copyFrom(pt);
  g.rotation = token.rotation;
}
function redrawVoiceIndicator() {
  if (!canvas?.ready || !canvas.tokens) return;
  const tokenLayer = canvas.tokens;
  const g = ensureGraphics(tokenLayer);
  g.clear();
  const user = game.user;
  if (!user) return;
  const token = getVoiceSourceTokenForDisplay(user);
  if (!token) return;
  positionOnTokenLayer(tokenLayer, g, token);
  const d = canvas.dimensions?.distance ?? 100;
  const rx = token.document.width * d / 2 * 0.92;
  const ry = token.document.height * d / 2 * 0.92;
  const lw = Math.max(4, d * 0.12);
  const gfx = g;
  if (typeof gfx.ellipse === "function" && typeof gfx.stroke === "function") {
    const v8 = gfx;
    v8.ellipse(0, 0, rx, ry);
    v8.stroke({ width: lw, color: 3407820, alpha: 1 });
  } else if (typeof gfx.lineStyle === "function" && typeof gfx.drawEllipse === "function") {
    const leg = gfx;
    leg.lineStyle(lw, 3407820, 1);
    leg.drawEllipse(0, 0, rx, ry);
  } else {
    const anyG = gfx;
    if (typeof anyG.lineStyle === "function" && typeof anyG.drawCircle === "function") {
      anyG.lineStyle(lw, 3407820, 1);
      anyG.drawCircle(0, 0, Math.max(rx, ry));
    }
  }
}
function scheduleVoiceIndicatorRedraw() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    redrawVoiceIndicator();
  });
}
function destroyVoiceIndicatorLayer() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  if (!canvas?.tokens) return;
  const g = canvas.tokens.getChildByName(VOICE_INDICATOR_LAYER);
  if (g) {
    canvas.tokens.removeChild(g);
    g.destroy({ children: true });
  }
}

// src/voiceTokenInput.ts
function registerVoiceTokenKeybinding() {
  game.keybindings?.register(MODULE_ID, "toggleVoiceToken", {
    name: loc(`${MODULE_ID}.SETTINGS.toggleVoiceToken.name`, "Toggle voice token (selected)"),
    hint: loc(
      `${MODULE_ID}.SETTINGS.toggleVoiceToken.hint`,
      "While controlling a token, toggle whether your voice is positioned at that token (or clear to default)."
    ),
    editable: [{ key: "KeyV", modifiers: ["CONTROL", "SHIFT"] }],
    onDown: () => {
      if (!canvas?.ready || !canvas.tokens) return;
      const token = canvas.tokens.controlled[0];
      if (!token) {
        ui.notifications?.warn(
          loc(`${MODULE_ID}.VOICE.needSelection`, "Select a token first (control it), then press the keybinding.")
        );
        return;
      }
      void toggleVoiceTokenForCurrentUser(token).then(() => {
        token.refresh();
        scheduleVoiceIndicatorRedraw();
        scheduleProximityRefresh();
      });
    }
  });
}

// src/module.ts
var BaseClient = foundry.av.clients.SimplePeerAVClient;
var canvasPositionTicker;
function registerCanvasPositionTicker() {
  unregisterCanvasPositionTicker();
  const app = canvas?.app;
  if (!app?.ticker) return;
  canvasPositionTicker = () => {
    if (!canvas?.ready) return;
    redrawVoiceIndicator();
    proximityRouter.refreshAllGains();
  };
  const afterMove = PIXI.UPDATE_PRIORITY?.LOW ?? -25;
  app.ticker.add(canvasPositionTicker, void 0, afterMove);
}
function unregisterCanvasPositionTicker() {
  const app = canvas?.app;
  if (canvasPositionTicker && app?.ticker) app.ticker.remove(canvasPositionTicker);
  canvasPositionTicker = void 0;
}
Hooks.once("init", () => {
  CONFIG.WebRTC.clientClass = ProximitySimplePeerAVClient;
  registerModuleKeybindings();
  registerVoiceTokenKeybinding();
});
Hooks.once("ready", async () => {
  registerModuleSettings();
  await clearVoiceTokenFlagForCurrentUser();
  const H = Hooks;
  H.on("controlObject", () => {
    scheduleProximityRefresh();
    scheduleVoiceIndicatorRedraw();
  });
  H.on("targetToken", () => {
    scheduleProximityRefresh();
    scheduleVoiceIndicatorRedraw();
  });
  H.on("canvasReady", () => {
    scheduleProximityRefresh();
    scheduleVoiceIndicatorRedraw();
    registerCanvasPositionTicker();
  });
  H.on("canvasTearDown", () => {
    unregisterCanvasPositionTicker();
    destroyVoiceIndicatorLayer();
    proximityRouter.detachAll();
  });
  H.on("canvasPan", () => {
    scheduleProximityRefresh();
    scheduleVoiceIndicatorRedraw();
  });
  H.on("updateToken", () => {
    scheduleProximityRefresh();
    scheduleVoiceIndicatorRedraw();
  });
  H.on("moveToken", () => {
    scheduleProximityRefresh();
    scheduleVoiceIndicatorRedraw();
  });
  H.on("rtcSettingsChanged", scheduleProximityRefresh);
  H.on("visibilityRefresh", scheduleProximityRefresh);
  for (const h of ["createWall", "updateWall", "deleteWall"]) {
    H.on(h, scheduleProximityRefresh);
  }
  H.on("refreshToken", () => {
    scheduleProximityRefresh();
    scheduleVoiceIndicatorRedraw();
  });
  H.on("updateUser", (...args) => {
    const user = args[0];
    const change = args[1];
    if (change.flags?.[MODULE_ID] !== void 0) {
      scheduleProximityRefresh();
      if (user.id === game.user?.id) scheduleVoiceIndicatorRedraw();
    }
  });
  H.on("updateActor", (...args) => {
    const doc = args[0];
    const change = args[1];
    const flags = change.flags;
    if (flags?.[MODULE_ID]?.voiceProfile) {
      const uid = game.users?.find((u) => u.character?.id === doc.id)?.id;
      if (uid) {
        proximityRouter.updateProfileGainForUser(uid);
        scheduleProximityRefresh();
      }
    }
  });
  window.addEventListener("pointerdown", () => void proximityRouter.ensureResumed(), { once: true });
  async function setVoiceProfileForActor(actor, profile) {
    await persistVoiceProfileFlag(actor, profile);
    const uid = game.users?.find((u) => u.character?.id === actor.id)?.id;
    if (uid) {
      proximityRouter.updateProfileGainForUser(uid);
      scheduleProximityRefresh();
    }
  }
  const mod = game.modules?.get(MODULE_ID);
  if (mod)
    mod.api = {
      getVoiceProfileForActor,
      setVoiceProfileForActor,
      scheduleProximityRefresh,
      getAvSessionLog: getAvSessionLogSnapshot,
      clearAvSessionLog,
      copyAvSessionLogToClipboard
    };
});
Hooks.on(
  "clientSettingChanged",
  (...args) => {
    const [namespace, key] = args;
    if (namespace === MODULE_ID && (key === SETTINGS.GM_VOICE_GLOBAL || key === SETTINGS.MAX_RANGE || key === SETTINGS.THROUGH_WALL_GAIN || key === SETTINGS.MUTE_UNRESOLVED_SPEAKER))
      scheduleProximityRefresh();
    if (namespace === "core" && key === "rtcClientSettings") scheduleProximityRefresh();
  }
);
//# sourceMappingURL=withinearshot.js.map
