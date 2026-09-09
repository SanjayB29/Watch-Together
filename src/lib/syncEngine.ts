import { PlaybackState } from '@/types';

/**
 * Playback Sync Engine
 * Enforces authoritative host timing on viewer players:
 * - < 150ms drift: ignored (imperceptible)
 * - 150ms - 1500ms drift: gentle playbackRate micro-adjustments (0.95x - 1.05x)
 * - > 1500ms drift: hard seek jump to resync immediately
 */
export class PlaybackSyncEngine {
  private isHost: boolean;
  private videoElement: HTMLVideoElement | null = null;
  private onDriftCorrection?: (driftMs: number, action: 'none' | 'rate' | 'seek') => void;

  constructor(isHost: boolean, onDriftCorrection?: (driftMs: number, action: 'none' | 'rate' | 'seek') => void) {
    this.isHost = isHost;
    this.onDriftCorrection = onDriftCorrection;
  }

  public attachVideoElement(video: HTMLVideoElement) {
    this.videoElement = video;
  }

  public detach() {
    this.videoElement = null;
  }

  /**
   * Applies authoritative state received from host or signaling server
   */
  public applySyncState(state: PlaybackState) {
    if (!this.videoElement || this.isHost) return;

    const now = Date.now();
    const elapsedSinceReport = (now - state.timestamp) / 1000;
    const estimatedAuthoritativePos = state.playing ? state.position + elapsedSinceReport * (state.playbackRate || 1.0) : state.position;

    const currentPos = this.videoElement.currentTime;
    const driftSec = estimatedAuthoritativePos - currentPos;
    const driftMs = Math.abs(driftSec * 1000);

    // Sync play/pause state
    if (state.playing && this.videoElement.paused) {
      this.videoElement.play().catch((e) => {
        if (this.videoElement) {
          this.videoElement.muted = true;
          this.videoElement.play().catch(console.warn);
        }
      });
    } else if (!state.playing && !this.videoElement.paused) {
      this.videoElement.pause();
    }

    // Drift correction algorithm
    if (driftMs < 150) {
      // Imperceptible - reset rate to normal
      this.videoElement.playbackRate = 1.0;
      this.onDriftCorrection?.(driftMs, 'none');
    } else if (driftMs <= 1500) {
      // Moderate drift: micro-adjust playback rate to catch up / slow down smoothly
      if (driftSec > 0) {
        this.videoElement.playbackRate = 1.05; // Viewer is lagging, speed up slightly
      } else {
        this.videoElement.playbackRate = 0.95; // Viewer is ahead, slow down slightly
      }
      this.onDriftCorrection?.(driftMs, 'rate');
    } else {
      // Severe drift: hard seek
      this.videoElement.currentTime = estimatedAuthoritativePos;
      this.videoElement.playbackRate = 1.0;
      this.onDriftCorrection?.(driftMs, 'seek');
    }
  }

  public handlePlay(position: number, timestamp: number) {
    if (!this.videoElement || this.isHost) return;
    const elapsed = (Date.now() - timestamp) / 1000;
    const targetPos = position + Math.max(0, elapsed);

    if (Math.abs(this.videoElement.currentTime - targetPos) > 0.5) {
      this.videoElement.currentTime = targetPos;
    }
    this.videoElement.play().catch(() => {
      if (this.videoElement) {
        this.videoElement.muted = true;
        this.videoElement.play().catch(console.warn);
      }
    });
  }

  public handlePause(position: number) {
    if (!this.videoElement || this.isHost) return;
    this.videoElement.pause();
    this.videoElement.currentTime = position;
  }

  public handleSeek(position: number) {
    if (!this.videoElement || this.isHost) return;
    this.videoElement.currentTime = position;
  }
}
