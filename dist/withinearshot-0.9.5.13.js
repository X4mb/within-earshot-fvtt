// src/constants.ts
var MODULE_ID = "withinearshot-test";
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
  let v;
  try {
    v = s().get(MODULE_ID, SETTINGS.MAX_RANGE);
  } catch {
    return 15;
  }
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return 15;
  return Math.min(500, Math.max(1, n));
}
function getGmVoiceGlobal() {
  try {
    return Boolean(s().get(MODULE_ID, SETTINGS.GM_VOICE_GLOBAL));
  } catch {
    return false;
  }
}
function setGmVoiceGlobal(v) {
  return s().set(MODULE_ID, SETTINGS.GM_VOICE_GLOBAL, v);
}
function getThroughWallGain() {
  let v;
  try {
    v = s().get(MODULE_ID, SETTINGS.THROUGH_WALL_GAIN);
  } catch {
    return 0.05;
  }
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

// src/pitchShiftWorklet.ts
var PITCH_SHIFT_WORKLET_CODE = `
class PitchShiftProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{
      name: 'pitchFactor',
      defaultValue: 1.0,
      minValue: 0.25,
      maxValue: 4.0,
      automationRate: 'k-rate'
    }];
  }

  constructor() {
    super();
    this._bufSize = 8192;              // power of two; must exceed grain + 2
    this._buf = new Float32Array(this._bufSize);
    this._writePos = 0;
    this._win = 2048;                  // grain length (~43ms @ 48kHz, ~21ms avg latency)
    this._phase = 0;                   // grain phase in [0, 1)
  }

  _read(delay) {
    const mask = this._bufSize - 1;
    const pos = this._writePos - delay;
    const base = Math.floor(pos);
    const frac = pos - base;
    const s0 = this._buf[base & mask];
    const s1 = this._buf[(base + 1) & mask];
    return s0 + frac * (s1 - s0);
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!output) return true;

    const factor = parameters.pitchFactor[0] ?? 1.0;
    const mask = this._bufSize - 1;
    const win = this._win;
    // delay(t) slope = 1 - factor, so read position advances at exactly \`factor\` per sample.
    const dPhase = (1 - factor) / win;

    for (let i = 0; i < output.length; i++) {
      this._buf[this._writePos & mask] = input ? input[i] : 0;
      this._writePos++;

      let p = this._phase + dPhase;
      p -= Math.floor(p);               // wrap into [0, 1) for either sweep direction
      this._phase = p;
      const p2 = p + 0.5 - Math.floor(p + 0.5);

      // delay in [1, win + 1]: always behind the write head, never past the buffer.
      const g1 = Math.sin(Math.PI * p);
      const g2 = Math.sin(Math.PI * p2);
      output[i] = g1 * this._read(1 + p * win) + g2 * this._read(1 + p2 * win);
    }

    return true;
  }
}

registerProcessor('withinearshot-pitch-shift', PitchShiftProcessor);
`;

// src/voiceChain.ts
function makeDistortionCurve(amount) {
  const k = amount * 3;
  const n = 8192;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  const deg = Math.PI / 180;
  for (let i = 0; i < n; i++) {
    const x = i * 2 / n - 1;
    curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
  }
  return curve;
}
function buildVoiceChain(ctx, source, sink, profile, workletAvailable) {
  const preset = profile.preset ?? "none";
  const outputGain = ctx.createGain();
  outputGain.connect(sink);
  outputGain.gain.value = 1;
  const filters = [];
  let workletNode = null;
  let ringOsc = null;
  const presetDefaultShift = preset === "deep" ? -4 : preset === "high" ? 4 : preset === "feminine" ? 3.5 : preset === "masculine" ? -3.5 : 0;
  const pitchShift = profile.pitchShift || presetDefaultShift;
  const pitchFactor = Math.pow(2, pitchShift / 12);
  let head = source;
  if (Math.abs(pitchFactor - 1) > 1e-3 && workletAvailable) {
    workletNode = new AudioWorkletNode(ctx, "withinearshot-pitch-shift", {
      parameterData: { pitchFactor }
    });
    head.connect(workletNode);
    head = workletNode;
    filters.push(workletNode);
  }
  if (preset === "robot") {
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1e3;
    bp.Q.value = 0.8;
    const ringGain = ctx.createGain();
    ringGain.gain.value = 0;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 60;
    osc.connect(ringGain.gain);
    osc.start();
    ringOsc = osc;
    head.connect(bp);
    bp.connect(ringGain);
    head = ringGain;
    filters.push(bp, ringGain);
    outputGain.gain.value = 0.8;
  } else if (preset === "whisper") {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 4e3;
    const mid = ctx.createBiquadFilter();
    mid.type = "peaking";
    mid.frequency.value = 800;
    mid.gain.value = -6;
    head.connect(lp);
    lp.connect(mid);
    head = mid;
    filters.push(lp, mid);
    outputGain.gain.value = 0.35;
  }
  const eqLow = profile.eqLowGain ?? 0;
  const eqHigh = profile.eqHighGain ?? 0;
  if (eqLow !== 0 || eqHigh !== 0) {
    const low = ctx.createBiquadFilter();
    low.type = "lowshelf";
    low.frequency.value = 250;
    low.gain.value = eqLow;
    const high = ctx.createBiquadFilter();
    high.type = "highshelf";
    high.frequency.value = 3e3;
    high.gain.value = eqHigh;
    head.connect(low);
    low.connect(high);
    head = high;
    filters.push(low, high);
  }
  const distortion = Math.max(0, Math.min(100, profile.distortion ?? 0));
  if (distortion > 0) {
    const shaper = ctx.createWaveShaper();
    shaper.curve = makeDistortionCurve(distortion);
    shaper.oversample = "4x";
    const makeup = ctx.createGain();
    makeup.gain.value = 1 / (1 + distortion / 40);
    head.connect(shaper);
    shaper.connect(makeup);
    head = makeup;
    filters.push(shaper, makeup);
  }
  const echo = Math.max(0, Math.min(100, profile.echo ?? 0));
  if (echo > 0) {
    const dry = ctx.createGain();
    dry.gain.value = 1;
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.22;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.35;
    const wet = ctx.createGain();
    wet.gain.value = echo / 100 * 0.9;
    head.connect(dry);
    dry.connect(outputGain);
    head.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(outputGain);
    filters.push(dry, delay, feedback, wet);
  } else {
    head.connect(outputGain);
  }
  return { workletNode, filters, ringOsc, outputGain };
}
function teardownVoiceChain(chain, source) {
  if (!chain) return;
  const { workletNode, filters, ringOsc, outputGain } = chain;
  try {
    ringOsc?.stop();
  } catch {
  }
  try {
    ringOsc?.disconnect();
  } catch {
  }
  for (const node of filters) {
    try {
      node.disconnect();
    } catch {
    }
  }
  try {
    workletNode?.disconnect();
  } catch {
  }
  try {
    outputGain.disconnect();
  } catch {
  }
  try {
    source?.disconnect();
  } catch {
  }
}

// src/voiceChangerProcessor.ts
var VoiceChangerProcessor = class {
  ctx = null;
  rawInputStream = null;
  sourceNode = null;
  destNode = null;
  processedStream = null;
  chain = null;
  state = "uninitialized";
  workletReady = false;
  workletFailed = false;
  pendingProfile = null;
  workletBlobUrl = null;
  chainBaseGain = 1;
  outputMuted = false;
  isInitialized() {
    return this.state === "ready";
  }
  getProcessedStream() {
    return this.processedStream;
  }
  /**
   * The raw mic stream feeding this processor. The dialog preview taps it instead of opening a
   * second getUserMedia capture: Firefox can end/silence the first capture when the same device
   * is opened twice with conflicting constraints, leaving the GM mute to players.
   */
  getRawInputStream() {
    return this.rawInputStream;
  }
  /** True when the track is this processor's output (lets callers avoid re-processing it). */
  ownsTrack(track) {
    return this.processedStream?.getAudioTracks().includes(track) ?? false;
  }
  /**
   * Hard-mute the processed output at the chain gain. Unlike toggling track.enabled — which
   * Foundry's voice-activation gating flips on speech and would undo — a zero gain guarantees
   * peers hear silence, e.g. while the GM tunes a voice in the Assign Voice dialog.
   */
  setOutputMuted(muted) {
    this.outputMuted = muted;
    if (this.chain) this.chain.outputGain.gain.value = muted ? 0 : this.chainBaseGain;
  }
  async initialize(micStream) {
    if (this.state === "initializing") return;
    if (this.state !== "uninitialized") this.reset();
    this.state = "initializing";
    try {
      this.ctx = new AudioContext({ sampleRate: 48e3 });
      this.resumeWhenAllowed();
      this.rawInputStream = micStream;
      this.sourceNode = this.ctx.createMediaStreamSource(micStream);
      this.destNode = this.ctx.createMediaStreamDestination();
      this.processedStream = this.destNode.stream;
      await this.ensureWorklet();
      await this.buildChain(this.pendingProfile ?? { preset: "none" });
      this.pendingProfile = null;
      this.state = "ready";
      pushAvSessionLog("voiceChanger:initialized", {});
    } catch (err) {
      this.state = "uninitialized";
      throw err;
    }
  }
  async applyProfile(profile) {
    if (this.state === "disposed") return;
    if (this.state !== "ready") {
      this.pendingProfile = profile;
      return;
    }
    await this.buildChain(profile ?? { preset: "none" });
    pushAvSessionLog("voiceChanger:applyProfile", { preset: profile?.preset ?? "none" });
  }
  dispose() {
    if (this.state === "disposed") return;
    this.tearDownChain();
    try {
      this.sourceNode?.disconnect();
    } catch {
    }
    try {
      this.ctx?.close();
    } catch {
    }
    if (this.workletBlobUrl) {
      URL.revokeObjectURL(this.workletBlobUrl);
      this.workletBlobUrl = null;
    }
    this.ctx = null;
    this.rawInputStream = null;
    this.sourceNode = null;
    this.destNode = null;
    this.processedStream = null;
    this.chain = null;
    this.state = "disposed";
    this.workletReady = false;
    this.workletFailed = false;
    this.pendingProfile = null;
    pushAvSessionLog("voiceChanger:disposed", {});
  }
  reset() {
    this.dispose();
    this.state = "uninitialized";
  }
  /**
   * Never `await ctx.resume()` here: under autoplay policy the promise can stay pending until a
   * user gesture, which would stall the whole A/V connect inside initializeLocalStream.
   */
  resumeWhenAllowed() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "suspended") return;
    void ctx.resume().catch(() => {
    });
    window.addEventListener(
      "pointerdown",
      () => {
        if (this.ctx?.state === "suspended") void this.ctx.resume().catch(() => {
        });
      },
      { once: true }
    );
  }
  async ensureWorklet() {
    if (this.workletReady || this.workletFailed || !this.ctx) return;
    try {
      const blob = new Blob([PITCH_SHIFT_WORKLET_CODE], { type: "application/javascript" });
      this.workletBlobUrl = URL.createObjectURL(blob);
      await this.ctx.audioWorklet.addModule(this.workletBlobUrl);
      this.workletReady = true;
    } catch (err) {
      console.warn("[withinearshot] Pitch shift worklet unavailable (CSP or browser issue). EQ-only mode active.", err);
      this.workletFailed = true;
    }
  }
  async buildChain(profile) {
    if (!this.ctx || !this.sourceNode || !this.destNode) return;
    this.tearDownChain();
    this.chain = buildVoiceChain(
      this.ctx,
      this.sourceNode,
      this.destNode,
      profile,
      this.workletReady && !this.workletFailed
    );
    this.chainBaseGain = this.chain.outputGain.gain.value;
    if (this.outputMuted) this.chain.outputGain.gain.value = 0;
  }
  tearDownChain() {
    teardownVoiceChain(this.chain, this.sourceNode);
    this.chain = null;
  }
};
var voiceChangerProcessor = new VoiceChangerProcessor();

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
  if (game.user?.isGM) {
    const actor = next !== null ? token.actor : null;
    const profile = actor ? getVoiceProfileForActor(actor) : null;
    void voiceChangerProcessor.applyProfile(profile).catch((err) => {
      ui.notifications?.warn(`Within Earshot: could not apply voice profile \u2014 ${String(err)}`);
    });
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
    } else if (u.muted) {
      tag = "muted";
      result = 0;
    } else if (u.blocked) {
      tag = "blocked";
      result = 0;
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
  hasPeer(userId) {
    return this.peers.has(userId);
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
var WIRE_RETRY_DELAY_MS = 100;
var WIRE_MAX_ATTEMPTS = 30;
var ProximitySimplePeerAVClient = class extends Base {
  /** Pending video elements awaiting Web Audio wiring before being muted. */
  #videoElements = /* @__PURE__ */ new Map();
  /**
   * SimplePeerAVClient has no `getUserMedia` — this is the real mic acquisition point, called by
   * both `connect` and `updateLocalStream` (device switch). The processed track is swapped into
   * the stream **in place**: `connectPeer` / `updateLocalStream` ship `this.localStream` after this
   * returns, and `levelsStream` (VU meter / voice activation) was already cloned from the raw mic.
   */
  async initializeLocalStream() {
    const stream = await super.initializeLocalStream();
    if (!game.user?.isGM || !stream) return stream;
    const rawTrack = stream.getAudioTracks()[0];
    if (!rawTrack || voiceChangerProcessor.ownsTrack(rawTrack)) return stream;
    try {
      await voiceChangerProcessor.initialize(new MediaStream([rawTrack]));
      const processedTrack = voiceChangerProcessor.getProcessedStream()?.getAudioTracks()[0];
      if (processedTrack) {
        stream.removeTrack(rawTrack);
        stream.addTrack(processedTrack);
        await this.#applyPinnedVoiceProfile();
      }
    } catch (err) {
      ui.notifications?.warn(`Within Earshot: voice changer unavailable \u2014 ${String(err)}`);
    }
    return stream;
  }
  /** Re-apply the profile of the GM's pinned voice token after the graph is (re)built. */
  async #applyPinnedVoiceProfile() {
    const user = game.user;
    if (!user) return;
    const pinnedId = getVoiceTokenIdFromUser(user);
    const actor = pinnedId ? canvas?.scene?.tokens.get(pinnedId)?.actor ?? null : null;
    await voiceChangerProcessor.applyProfile(actor ? getVoiceProfileForActor(actor) : null);
  }
  async initializePeerStream(userId) {
    const inst = await super.initializePeerStream(userId);
    void this.#wirePeerWhenReady(userId);
    return inst;
  }
  async disconnectPeer(userId) {
    this.#videoElements.delete(userId);
    proximityRouter.detachPeer(userId);
    return super.disconnectPeer(userId);
  }
  async disconnectAll() {
    this.#videoElements.clear();
    proximityRouter.detachAll();
    return super.disconnectAll();
  }
  async disconnect() {
    this.#videoElements.clear();
    proximityRouter.detachAll();
    voiceChangerProcessor.reset();
    return super.disconnect();
  }
  async setUserVideo(userId, videoElement) {
    await super.setUserVideo(userId, videoElement);
    if (userId !== game.user?.id) {
      this.#videoElements.set(userId, videoElement);
      if (proximityRouter.hasPeer(userId)) {
        videoElement.muted = true;
        videoElement.volume = 0;
      }
    }
    scheduleProximityRefresh();
  }
  async onSettingsChanged(changed) {
    await super.onSettingsChanged(changed);
    scheduleProximityRefresh();
  }
  async #wirePeerWhenReady(userId, attempt = 0) {
    const stream = this.getMediaStreamForUser(userId);
    if (stream && stream.getAudioTracks().length > 0) {
      proximityRouter.attachPeer(userId, stream);
      await proximityRouter.ensureResumed();
      const el = this.#videoElements.get(userId);
      if (el) {
        el.muted = true;
        el.volume = 0;
      }
      return;
    }
    if (attempt >= WIRE_MAX_ATTEMPTS) {
      console.warn(
        `[withinearshot] Could not attach Web Audio for user ${userId} after ${WIRE_MAX_ATTEMPTS} attempts. Audio will play through the video element instead (no proximity attenuation).`
      );
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, WIRE_RETRY_DELAY_MS));
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
  const cellPx = canvas.dimensions?.size ?? 100;
  const dotR = Math.max(5, cellPx * 0.08);
  const tw = token.document.width * cellPx;
  const th = token.document.height * cellPx;
  const dx = tw - dotR * 0.6;
  const dy = th - dotR * 0.6;
  const gfx = g;
  if (typeof gfx.circle === "function" && typeof gfx.fill === "function") {
    const v8 = gfx;
    v8.circle(dx, dy, dotR);
    v8.fill({ color: 3407820, alpha: 1 });
  } else {
    const leg = gfx;
    if (typeof leg.beginFill === "function" && typeof leg.drawCircle === "function") {
      leg.beginFill(3407820, 1);
      leg.drawCircle(dx, dy, dotR);
      leg.endFill?.();
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

// src/voicePreview.ts
var VoicePreviewer = class {
  ctx = null;
  micStream = null;
  /** Only stop tracks we captured ourselves — never the live A/V stream we merely tap. */
  ownsMicStream = false;
  source = null;
  chain = null;
  workletReady = false;
  starting = false;
  /** Live track we switched to raw processing for the monitor; restored on stop. */
  tappedTrack = null;
  tappedOriginal = null;
  isActive() {
    return this.ctx !== null;
  }
  async start(profile) {
    if (this.starting || this.ctx) return;
    this.starting = true;
    try {
      const liveRaw = voiceChangerProcessor.getRawInputStream();
      let mic;
      if (liveRaw?.getAudioTracks().some((t) => t.readyState === "live")) {
        mic = liveRaw;
        this.ownsMicStream = false;
        const track = mic.getAudioTracks().find((t) => t.readyState === "live");
        if (track) {
          const s2 = track.getSettings();
          const original = {};
          if (s2.echoCancellation !== void 0) original.echoCancellation = s2.echoCancellation;
          if (s2.noiseSuppression !== void 0) original.noiseSuppression = s2.noiseSuppression;
          if (s2.autoGainControl !== void 0) original.autoGainControl = s2.autoGainControl;
          try {
            await track.applyConstraints({
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false
            });
            this.tappedTrack = track;
            this.tappedOriginal = original;
          } catch {
          }
        }
      } else {
        const constraints = {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        };
        const audioSrc = game.webrtc?.settings?.get("client", "audioSrc");
        if (typeof audioSrc === "string" && audioSrc !== "disabled" && audioSrc !== "default") {
          constraints.deviceId = { ideal: audioSrc };
        }
        mic = await navigator.mediaDevices.getUserMedia({ audio: constraints });
        this.ownsMicStream = true;
      }
      const ctx = new AudioContext({ sampleRate: 48e3 });
      void ctx.resume().catch(() => {
      });
      if (ctx.state === "suspended") {
        window.addEventListener(
          "pointerdown",
          () => {
            if (this.ctx?.state === "suspended") void this.ctx.resume().catch(() => {
            });
          },
          { once: true }
        );
      }
      try {
        const blobUrl = URL.createObjectURL(
          new Blob([PITCH_SHIFT_WORKLET_CODE], { type: "application/javascript" })
        );
        try {
          await ctx.audioWorklet.addModule(blobUrl);
          this.workletReady = true;
        } finally {
          URL.revokeObjectURL(blobUrl);
        }
      } catch {
        this.workletReady = false;
      }
      this.micStream = mic;
      this.ctx = ctx;
      this.source = ctx.createMediaStreamSource(mic);
      this.chain = buildVoiceChain(ctx, this.source, ctx.destination, profile, this.workletReady);
    } catch (err) {
      this.stop();
      throw err;
    } finally {
      this.starting = false;
    }
  }
  /** Rebuild the preview chain with new settings; no-op when the preview is not running. */
  update(profile) {
    if (!this.ctx || !this.source) return;
    teardownVoiceChain(this.chain, this.source);
    this.chain = buildVoiceChain(this.ctx, this.source, this.ctx.destination, profile, this.workletReady);
  }
  stop() {
    teardownVoiceChain(this.chain, this.source);
    this.chain = null;
    try {
      this.source?.disconnect();
    } catch {
    }
    this.source = null;
    if (this.tappedTrack && this.tappedOriginal) {
      void this.tappedTrack.applyConstraints(this.tappedOriginal).catch(() => {
      });
    }
    this.tappedTrack = null;
    this.tappedOriginal = null;
    if (this.ownsMicStream) {
      for (const t of this.micStream?.getTracks() ?? []) t.stop();
    }
    this.ownsMicStream = false;
    this.micStream = null;
    try {
      void this.ctx?.close();
    } catch {
    }
    this.ctx = null;
    this.workletReady = false;
  }
};
var voicePreviewer = new VoicePreviewer();

// src/voiceAssignDialog.ts
var PRESETS = [
  { value: "none", label: "None (passthrough)" },
  { value: "deep", label: "Deep" },
  { value: "high", label: "High" },
  { value: "feminine", label: "Female (male \u2192 female)" },
  { value: "masculine", label: "Male (female \u2192 male)" },
  { value: "whisper", label: "Whisper" },
  { value: "custom", label: "Custom" }
];
var SLIDER_DEFAULTS = { pitchShift: 0, eqLowGain: 0, eqHighGain: 0, distortion: 0, echo: 0 };
var PRESET_RECIPES = {
  none: { ...SLIDER_DEFAULTS },
  deep: { pitchShift: -4, eqLowGain: 6, eqHighGain: -4, distortion: 0, echo: 0 },
  high: { pitchShift: 4, eqLowGain: -4, eqHighGain: 4, distortion: 0, echo: 0 },
  // M→F: our granular shifter moves formants along with pitch, so a big shift turns chipmunk
  // fast — stay moderate on pitch (+3.5) and let EQ carry the rest: cut chest resonance hard
  // (a pitched-up voice with male chest weight reads as "small man", not female) and brighten
  // for head-voice timbre. Pitch MUST then be tuned to the speaker's base voice (see note).
  feminine: { pitchShift: 3.5, eqLowGain: -9, eqHighGain: 6, distortion: 0, echo: 0 },
  // F→M: mirror — lower pitch moderately, rebuild chest weight, darken the top end.
  masculine: { pitchShift: -3.5, eqLowGain: 7, eqHighGain: -4, distortion: 0, echo: 0 },
  robot: { pitchShift: 0, eqLowGain: 0, eqHighGain: 2, distortion: 15, echo: 0 },
  whisper: { pitchShift: 0, eqLowGain: 0, eqHighGain: 3, distortion: 0, echo: 0 },
  custom: null
};
function isLiveVoiceActor(actorId) {
  if (!game.user?.isGM || !voiceChangerProcessor.isInitialized()) return false;
  const pinnedId = getVoiceTokenIdFromUser(game.user);
  if (!pinnedId) return false;
  const pinnedDoc = canvas?.scene?.tokens.get(pinnedId);
  return pinnedDoc?.actor?.id === actorId;
}
function openVoiceAssignDialogForActor(actor) {
  const profile = getVoiceProfileForActor(actor) ?? {};
  const currentPreset = profile.preset ?? "none";
  const pitchShift = profile.pitchShift ?? 0;
  const eqLowGain = profile.eqLowGain ?? 0;
  const eqHighGain = profile.eqHighGain ?? 0;
  const distortion = profile.distortion ?? 0;
  const echo = profile.echo ?? 0;
  const actorId = actor.id;
  const actorName = actor.name;
  const presetOptions = PRESETS.map(
    (p) => `<option value="${p.value}"${p.value === currentPreset ? " selected" : ""}>${p.label}</option>`
  ).join("");
  const canMuteLive = !!game.user?.isGM && voiceChangerProcessor.isInitialized();
  const muteHint = canMuteLive ? '<p class="notes" style="margin:0 0 6px"><i class="fas fa-volume-mute"></i> Players cannot hear you while this window is open.</p>' : "";
  const slider = (name, label, valId, min, max, step, value) => `
      <div class="form-group" style="margin-top:8px">
        <label>${label}: <span id="${valId}">${value}</span></label>
        <input type="range" name="${name}" min="${min}" max="${max}" step="${step}"
               value="${value}" style="width:100%">
      </div>`;
  const content = `
    <form>
      <input type="hidden" name="actorId" value="${actorId}">
      ${muteHint}
      <div class="form-group">
        <label><b>Voice Preset</b></label>
        <select name="preset" style="width:100%">${presetOptions}</select>
        <p class="notes" style="margin:2px 0 0">Presets load starting values into the sliders \u2014 tweak from there.</p>
        <p class="notes" id="wea-preset-note" style="display:none; margin:2px 0 0"><b>Tune the pitch to the speaker:</b>
          the right shift depends on how low or high the base voice is. A deep voice needs more
          (up to \xB15), a lighter voice less (\xB12\u20133). Go in 0.5 steps until it stops sounding
          artificial, then adjust Bass/Treble.</p>
      </div>
      ${slider("pitchShift", "Pitch shift (semitones)", "wea-pitch-val", -12, 12, 0.5, pitchShift)}
      ${slider("eqLowGain", "Bass (dB)", "wea-low-val", -18, 18, 1, eqLowGain)}
      ${slider("eqHighGain", "Treble (dB)", "wea-high-val", -18, 18, 1, eqHighGain)}
      ${slider("distortion", "Growl (distortion)", "wea-growl-val", 0, 100, 5, distortion)}
      ${slider("echo", "Echo (cave/spirit)", "wea-echo-val", 0, 100, 5, echo)}
      <div class="form-group" style="margin-top:12px; display:flex; gap:6px">
        <button type="button" id="wea-preview-btn" style="flex:1">
          <i class="fas fa-headphones"></i> Preview my voice
        </button>
        <button type="button" id="wea-reset-btn" title="Reset all sliders to 0" style="flex:0 0 auto">
          <i class="fas fa-undo"></i>
        </button>
      </div>
      <p class="notes" style="margin:4px 0 0">
        Hear yourself with these settings, live as you adjust them. Always open mic \u2014
        push-to-talk does not apply here. Use headphones \u2014 on speakers the mic picks the
        playback up again.
      </p>
    </form>`;
  const D = Dialog;
  if (canMuteLive) voiceChangerProcessor.setOutputMuted(true);
  const readProfileFromForm = (form) => {
    const fd = new FormData(form);
    return {
      preset: fd.get("preset") ?? "none",
      pitchShift: parseFloat(fd.get("pitchShift")) || 0,
      eqLowGain: parseFloat(fd.get("eqLowGain")) || 0,
      eqHighGain: parseFloat(fd.get("eqHighGain")) || 0,
      distortion: parseFloat(fd.get("distortion")) || 0,
      echo: parseFloat(fd.get("echo")) || 0
    };
  };
  new D({
    title: `Assign Voice: ${actorName}`,
    content,
    default: "save",
    render: (html) => {
      const form = html.find("form")[0];
      const VALUE_LABELS = {
        pitchShift: "#wea-pitch-val",
        eqLowGain: "#wea-low-val",
        eqHighGain: "#wea-high-val",
        distortion: "#wea-growl-val",
        echo: "#wea-echo-val"
      };
      const setSlider = (name, value) => {
        html.find(`input[name=${name}]`).val(String(value));
        html.find(VALUE_LABELS[name]).text(String(value));
      };
      for (const name of Object.keys(VALUE_LABELS)) {
        html.find(`input[name=${name}]`).on("input", function() {
          html.find(VALUE_LABELS[name]).text(this.value);
        });
      }
      let applyTimer;
      const applyLive = () => {
        window.clearTimeout(applyTimer);
        applyTimer = window.setTimeout(() => {
          const p = readProfileFromForm(form);
          if (voicePreviewer.isActive()) voicePreviewer.update(p);
          if (isLiveVoiceActor(actorId)) {
            void voiceChangerProcessor.applyProfile(p).catch(() => {
            });
          }
        }, 120);
      };
      html.find("input[type=range]").on("input change", applyLive);
      const updatePresetNote = (preset) => {
        const note = html.find("#wea-preset-note");
        if (preset === "feminine" || preset === "masculine") note.show();
        else note.hide();
      };
      updatePresetNote(currentPreset);
      html.find("select[name=preset]").on("change", function() {
        const recipe = PRESET_RECIPES[this.value];
        if (recipe) {
          for (const [name, value] of Object.entries(recipe)) {
            setSlider(name, value);
          }
        }
        updatePresetNote(this.value);
        applyLive();
      });
      html.find("#wea-reset-btn").on("click", () => {
        for (const [name, value] of Object.entries(SLIDER_DEFAULTS)) {
          setSlider(name, value);
        }
        applyLive();
      });
      const btn = html.find("#wea-preview-btn");
      const setBtnState = (on) => {
        btn.html(
          on ? '<i class="fas fa-stop"></i> Stop preview' : '<i class="fas fa-headphones"></i> Preview my voice'
        );
      };
      const startPreview = (notifyOnFail) => {
        voicePreviewer.start(readProfileFromForm(form)).then(() => setBtnState(true)).catch((err) => {
          setBtnState(false);
          if (notifyOnFail) {
            ui.notifications?.warn(`Within Earshot: preview failed \u2014 ${String(err)}`);
          }
        });
      };
      btn.on("click", () => {
        if (voicePreviewer.isActive()) {
          voicePreviewer.stop();
          setBtnState(false);
          return;
        }
        startPreview(true);
      });
      startPreview(false);
    },
    close: () => {
      voicePreviewer.stop();
      const raw = voiceChangerProcessor.getRawInputStream();
      if (raw && raw.getAudioTracks().length > 0 && raw.getAudioTracks().every((t) => t.readyState === "ended")) {
        console.warn("[withinearshot] live mic track dead after dialog close \u2014 re-acquiring");
        const client = game.webrtc?.client;
        void client?.updateLocalStream?.()?.catch?.(() => {
        });
      }
      if (canMuteLive) {
        voiceChangerProcessor.setOutputMuted(false);
        if (isLiveVoiceActor(actorId)) {
          const stored = game.actors?.get(actorId);
          const saved = stored ? getVoiceProfileForActor(stored) ?? { preset: "none" } : null;
          if (saved) void voiceChangerProcessor.applyProfile(saved).catch(() => {
          });
        }
      }
    },
    buttons: {
      save: {
        icon: '<i class="fas fa-save"></i>',
        label: "Save",
        callback: async (html) => {
          const form = html.find("form")[0];
          const fd = new FormData(form);
          const targetActorId = fd.get("actorId");
          const targetActor = targetActorId ? game.actors?.get(targetActorId) : null;
          if (!targetActor) return;
          const newProfile = {
            ...getVoiceProfileForActor(targetActor) ?? {},
            ...readProfileFromForm(form)
          };
          await persistVoiceProfileFlag(targetActor, newProfile);
          if (isLiveVoiceActor(targetActor.id)) {
            void voiceChangerProcessor.applyProfile(newProfile).catch((err) => {
              ui.notifications?.warn(
                `Within Earshot: could not apply voice \u2014 ${String(err)}`
              );
            });
          }
        }
      },
      cancel: { label: "Cancel" }
    }
  }).render(true);
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
  const version = game.modules?.get(MODULE_ID)?.version ?? "?";
  console.log(`[${MODULE_ID}] v${version} init`);
});
var HooksOn = Hooks;
var dlog = (msg, ...rest) => console.log(`[${MODULE_ID}] ${msg}`, ...rest);
HooksOn.on("getTokenPlaceableContextOptions", (...args) => {
  if (!game.user?.isGM) return;
  dlog("getTokenPlaceableContextOptions fired");
  const options = args[1];
  const resolveTokenActor = (target) => {
    if (target instanceof HTMLElement) {
      const el = target.closest("[data-token-id], [data-object-id], [data-entry-id]") ?? target;
      const ds = el.dataset;
      const id = ds.tokenId ?? ds.objectId ?? ds.entryId;
      const tok = id ? canvas?.tokens?.get(id) : null;
      if (tok?.actor) return tok.actor;
    } else if (target && typeof target === "object") {
      const t = target;
      if (t.actor) return t.actor;
      if (t.document?.actor) return t.document.actor;
    }
    const layer = canvas?.tokens;
    return layer?.hover?.actor ?? layer?.controlled[0]?.actor ?? null;
  };
  const openForTarget = (t) => {
    const actor = resolveTokenActor(t);
    if (actor) openVoiceAssignDialogForActor(actor);
    else ui.notifications?.warn("Within Earshot: could not resolve the token\u2019s actor for this menu.");
  };
  options.push({
    // v13 reads name/condition/callback; v14 prefers label/visible/onClick (old fields warn).
    name: "Assign Voice",
    label: "Assign Voice",
    icon: '<i class="fas fa-microphone-alt"></i>',
    // Always visible for the GM: a failing resolver must not silently hide the entry.
    condition: () => true,
    visible: () => {
      dlog("Assign Voice entry evaluated in token placeable menu (menu opened)");
      return true;
    },
    callback: openForTarget,
    onClick: (_event, t) => openForTarget(t)
  });
});
HooksOn.on("renderTokenHUD", (...args) => {
  if (!game.user?.isGM) return;
  const app = args[0];
  const el = args[1];
  const root = el instanceof HTMLElement ? el : el?.[0] ?? null;
  const actor = app.object?.actor ?? app.document?.actor ?? null;
  dlog("renderTokenHUD fired", { hasRoot: !!root, hasActor: !!actor });
  if (!root || !actor) return;
  if (root.querySelector("[data-withinearshot-assign-voice]")) return;
  const col = root.querySelector(".col.right") ?? root.querySelector(".col.left") ?? root;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "control-icon";
  btn.setAttribute("data-withinearshot-assign-voice", "");
  btn.title = "Assign Voice (Within Earshot)";
  btn.innerHTML = '<i class="fas fa-microphone-alt"></i>';
  btn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    openVoiceAssignDialogForActor(actor);
  });
  col.appendChild(btn);
});
var injectTokenConfigVoiceSection = (...args) => {
  if (!game.user?.isGM) return;
  const app = args[0];
  const el = args[1];
  const root = el instanceof HTMLElement ? el : el?.[0] ?? null;
  if (!root || root.querySelector("[data-withinearshot-assign-voice]")) return;
  const actor = app.actor ?? app.token?.actor ?? app.token?.parent ?? app.document?.actor ?? app.document?.parent ?? null;
  const tab = root.querySelector('.tab[data-tab="identity"]') ?? root.querySelector('[data-tab="identity"]');
  dlog("renderTokenConfig fired", { hasActor: !!actor, hasIdentityTab: !!tab });
  if (!actor) return;
  const host = tab ?? root.querySelector(".window-content") ?? root;
  const fs = document.createElement("fieldset");
  fs.setAttribute("data-withinearshot-assign-voice", "");
  const legend = document.createElement("legend");
  legend.textContent = "Within Earshot";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.innerHTML = '<i class="fas fa-microphone-alt"></i> Assign Voice';
  btn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    openVoiceAssignDialogForActor(actor);
  });
  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = "Voice profile is saved on the actor and applies to all tokens of this actor.";
  fs.append(legend, btn, hint);
  host.appendChild(fs);
};
HooksOn.on("renderTokenConfig", injectTokenConfigVoiceSection);
HooksOn.on("renderPrototypeTokenConfig", injectTokenConfigVoiceSection);
HooksOn.on("getActorContextOptions", (...args) => {
  if (!game.user?.isGM) return;
  dlog("getActorContextOptions fired");
  const options = args[1];
  const resolveActor = (li) => {
    const raw = li instanceof HTMLElement ? li : li?.[0] ?? null;
    const entry = raw?.closest?.("[data-entry-id], [data-document-id], [data-actor-id]") ?? raw;
    const ds = entry?.dataset;
    const id = ds?.entryId ?? ds?.documentId ?? ds?.actorId;
    return id ? game.actors?.get(id) ?? null : null;
  };
  const openForEntry = (li) => {
    const actor = resolveActor(li);
    if (actor) openVoiceAssignDialogForActor(actor);
    else ui.notifications?.warn("Within Earshot: could not resolve the actor for this menu entry.");
  };
  options.push({
    // v13 reads name/condition/callback; v14 prefers label/visible/onClick (old fields warn).
    name: "Assign Voice",
    label: "Assign Voice",
    icon: '<i class="fas fa-microphone-alt"></i>',
    // Always visible for the GM: a failing resolver must not silently hide the entry.
    condition: () => true,
    visible: () => {
      dlog("Assign Voice entry evaluated in actor directory menu (menu opened)");
      return true;
    },
    callback: openForEntry,
    onClick: (_event, li) => openForEntry(li)
  });
});
Hooks.once("i18nInit", registerModuleSettings);
Hooks.once("ready", async () => {
  if (game.user?.isGM) {
    const version = game.modules?.get(MODULE_ID)?.version ?? "?";
    ui.notifications?.info(
      `Within Earshot (Test) v${version} active`,
      { permanent: true }
    );
  }
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
      if (game.user?.isGM && voiceChangerProcessor.isInitialized()) {
        const pinnedId = getVoiceTokenIdFromUser(game.user);
        if (pinnedId && canvas?.scene?.tokens.get(pinnedId)?.actor?.id === doc.id) {
          void voiceChangerProcessor.applyProfile(getVoiceProfileForActor(doc));
        }
      }
    }
  });
  H.on("clientSettingChanged", (...args) => {
    const [namespace, key] = args;
    if (namespace === MODULE_ID && (key === SETTINGS.GM_VOICE_GLOBAL || key === SETTINGS.MAX_RANGE || key === SETTINGS.THROUGH_WALL_GAIN || key === SETTINGS.MUTE_UNRESOLVED_SPEAKER))
      scheduleProximityRefresh();
    if (namespace === "core" && key === "rtcClientSettings") scheduleProximityRefresh();
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
      openVoiceAssignDialogForActor,
      scheduleProximityRefresh,
      getAvSessionLog: getAvSessionLogSnapshot,
      clearAvSessionLog,
      copyAvSessionLogToClipboard
    };
});
//# sourceMappingURL=withinearshot-0.9.5.13.js.map
