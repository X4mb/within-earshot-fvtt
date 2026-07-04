import { PITCH_SHIFT_WORKLET_CODE } from './pitchShiftWorklet.js';
import { buildVoiceChain, teardownVoiceChain } from './voiceChain.js';
import type { VoiceChainNodes } from './voiceChain.js';
import type { VoiceProfile } from './voiceProfile.js';

/**
 * GM self-monitor for the Assign Voice dialog: separate mic capture and AudioContext with the
 * chain output wired to the speakers, fully independent of the live RTC path so previewing can
 * never disturb what peers receive.
 */
class VoicePreviewer {
  private ctx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private chain: VoiceChainNodes | null = null;
  private workletReady = false;
  private starting = false;

  isActive(): boolean {
    return this.ctx !== null;
  }

  async start(profile: VoiceProfile): Promise<void> {
    if (this.starting || this.ctx) return;
    this.starting = true;
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext({ sampleRate: 48000 });
      // Started from the preview button click, so a user gesture is active and resume cannot hang.
      await ctx.resume();
      try {
        const blobUrl = URL.createObjectURL(
          new Blob([PITCH_SHIFT_WORKLET_CODE], { type: 'application/javascript' }),
        );
        try {
          await ctx.audioWorklet.addModule(blobUrl);
          this.workletReady = true;
        } finally {
          URL.revokeObjectURL(blobUrl);
        }
      } catch {
        this.workletReady = false; // EQ-only preview, same degradation as the live chain
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
  update(profile: VoiceProfile): void {
    if (!this.ctx || !this.source) return;
    teardownVoiceChain(this.chain, this.source);
    this.chain = buildVoiceChain(this.ctx, this.source, this.ctx.destination, profile, this.workletReady);
  }

  stop(): void {
    teardownVoiceChain(this.chain, this.source);
    this.chain = null;
    try { this.source?.disconnect(); } catch { /* */ }
    this.source = null;
    for (const t of this.micStream?.getTracks() ?? []) t.stop();
    this.micStream = null;
    try { void this.ctx?.close(); } catch { /* */ }
    this.ctx = null;
    this.workletReady = false;
  }
}

export const voicePreviewer = new VoicePreviewer();
