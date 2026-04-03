import { VOICE_INDICATOR_LAYER } from './constants.js';
import { getVoiceSourceTokenForDisplay } from './voiceToken.js';

let rafId = 0;

/**
 * Never parent to `canvas.tokens.objects` — on dnd5e, that container only accepts Token5e
 * and Foundry sorts by `document.elevation`; a PIXI.Graphics breaks the layer.
 * Sibling Graphics on `canvas.tokens` with positions converted from token world space.
 */
function ensureGraphics(layer: NonNullable<Canvas['tokens']>): PIXI.Graphics {
  let g = layer.getChildByName(VOICE_INDICATOR_LAYER) as PIXI.Graphics | undefined;
  if (!g) {
    g = new PIXI.Graphics();
    g.name = VOICE_INDICATOR_LAYER;
    g.eventMode = 'none';
    if (!layer.sortableChildren) layer.sortableChildren = true;
    g.zIndex = 999999;
    layer.addChild(g);
  }
  return g;
}

function positionOnTokenLayer(layer: NonNullable<Canvas['tokens']>, g: PIXI.Graphics, token: Token): void {
  const pt = new PIXI.Point();
  token.getGlobalPosition(pt);
  layer.toLocal(pt, undefined, pt);
  g.position.copyFrom(pt);
  g.rotation = token.rotation;
}

/**
 * One shared Graphics on the token layer (not under token mesh; not inside `objects`).
 */
export function redrawVoiceIndicator(): void {
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
  const rx = ((token.document.width * cellPx) / 2) * 0.92;
  const ry = ((token.document.height * cellPx) / 2) * 0.92;
  const lw = Math.max(4, cellPx * 0.12);

  const gfx = g as PIXI.Graphics & Record<string, unknown>;
  if (typeof gfx.ellipse === 'function' && typeof gfx.stroke === 'function') {
    const v8 = gfx as unknown as {
      ellipse: (x: number, y: number, rx: number, ry: number) => void;
      stroke: (o: { width: number; color: number; alpha: number }) => void;
    };
    v8.ellipse(0, 0, rx, ry);
    v8.stroke({ width: lw, color: 0x33ffcc, alpha: 1 });
  } else if (typeof gfx.lineStyle === 'function' && typeof gfx.drawEllipse === 'function') {
    const leg = gfx as {
      lineStyle: (w: number, c: number, a?: number) => void;
      drawEllipse: (x: number, y: number, xr: number, yr: number) => void;
    };
    leg.lineStyle(lw, 0x33ffcc, 1);
    leg.drawEllipse(0, 0, rx, ry);
  } else {
    const anyG = gfx as {
      lineStyle?: (w: number, c: number, a?: number) => void;
      drawCircle?: (x: number, y: number, r: number) => void;
    };
    if (typeof anyG.lineStyle === 'function' && typeof anyG.drawCircle === 'function') {
      anyG.lineStyle(lw, 0x33ffcc, 1);
      anyG.drawCircle(0, 0, Math.max(rx, ry));
    }
  }
}

export function scheduleVoiceIndicatorRedraw(): void {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    redrawVoiceIndicator();
  });
}

export function destroyVoiceIndicatorLayer(): void {
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
