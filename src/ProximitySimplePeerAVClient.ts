import { proximityRouter, scheduleProximityRefresh } from './proximityAudioRouter.js';

const Base = foundry.av.clients.SimplePeerAVClient;

/**
 * Routes each remote MediaStream through Web Audio gain nodes for proximity.
 * Mutes default video-element audio so the same stream is not heard twice.
 */
export class ProximitySimplePeerAVClient extends Base {
  override async initializePeerStream(userId: string): Promise<SimplePeer.Instance> {
    const inst = await super.initializePeerStream(userId);
    await this.#wirePeerWhenReady(userId);
    return inst;
  }

  override async disconnectPeer(userId: string): Promise<void> {
    proximityRouter.detachPeer(userId);
    return super.disconnectPeer(userId);
  }

  override async disconnectAll(): Promise<void[]> {
    proximityRouter.detachAll();
    return super.disconnectAll();
  }

  override async disconnect(): Promise<boolean> {
    proximityRouter.detachAll();
    return super.disconnect();
  }

  override async setUserVideo(userId: string, videoElement: HTMLVideoElement): Promise<void> {
    await super.setUserVideo(userId, videoElement);
    if (userId !== game.user?.id) {
      videoElement.muted = true;
      videoElement.volume = 0;
    }
    scheduleProximityRefresh();
  }

  override async onSettingsChanged(changed: unknown): Promise<void> {
    await super.onSettingsChanged(changed as never);
    scheduleProximityRefresh();
  }

  async #wirePeerWhenReady(userId: string, attempt = 0): Promise<void> {
    const stream = this.remoteStreams.get(userId);
    if (stream && stream.getAudioTracks().length > 0) {
      proximityRouter.attachPeer(userId, stream);
      await proximityRouter.ensureResumed();
      return;
    }
    if (attempt > 30) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    return this.#wirePeerWhenReady(userId, attempt + 1);
  }
}
