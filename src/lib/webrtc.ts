import { WSClientMessage } from '@/types';

export const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ],
  iceCandidatePoolSize: 10,
};

export class HostWebRTCManager {
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private pendingCandidates: Map<string, RTCIceCandidateInit[]> = new Map();
  private localStream: MediaStream | null = null;
  private roomCode: string;
  private sendSignal: (msg: WSClientMessage) => void;

  /**
   * Viewers that joined before the host had a stream.
   * We set up their RTCPeerConnection immediately but defer the offer
   * until setLocalStream() is first called.
   */
  private pendingOfferPeers: Set<string> = new Set();

  /**
   * Viewers whose renegotiation must wait for signaling state to reach 'stable'.
   * Populated when setLocalStream() wants to renegotiate but state is not yet stable.
   */
  private pendingRenegotiation: Set<string> = new Set();

  constructor(roomCode: string, sendSignal: (msg: WSClientMessage) => void) {
    this.roomCode = roomCode;
    this.sendSignal = sendSignal;
  }

  // ─── Stream management ───────────────────────────────────────────────────

  /**
   * Called once when the host captures a stream from their <video> element,
   * and again if the host changes their file (new captureStream call from caller).
   * Sub-Task 1: callers are responsible for caching the stream — this method
   * should receive the same MediaStream reference as long as the same file is loaded.
   */
  public async setLocalStream(stream: MediaStream) {
    console.log('[HostWebRTC] setLocalStream tracks:', stream.getTracks().map(t => `${t.kind}:${t.readyState}`).join(','), 'pendingOffers:', Array.from(this.pendingOfferPeers));
    this.localStream = stream;

    for (const [viewerId, pc] of Array.from(this.peerConnections.entries())) {
      console.log(
        `[HostWebRTC] Updating tracks for viewer ${viewerId}, PC state: ${pc.signalingState}/${pc.connectionState}`
      );
      const senders = pc.getSenders();

      stream.getTracks().forEach((track) => {
        const existingSender = senders.find((s) => s.track?.kind === track.kind);
        if (existingSender) {
          console.log(`[HostWebRTC] Replacing ${track.kind} track for ${viewerId}`);
          existingSender.replaceTrack(track).catch((err) =>
            console.warn('[HostWebRTC] replaceTrack err:', err)
          );
        } else {
          console.log(`[HostWebRTC] Adding ${track.kind} track to PC for ${viewerId}`);
          try {
            pc.addTrack(track, stream);
          } catch (err) {
            console.warn('[HostWebRTC] addTrack err:', err);
          }
        }
      });

      // Sub-Task 2: if this viewer was waiting for the first stream, send the
      // deferred initial offer now.
      if (this.pendingOfferPeers.has(viewerId)) {
        this.pendingOfferPeers.delete(viewerId);
        await this._sendOffer(viewerId, pc);
        continue;
      }

      // Sub-Task 3: renegotiation glare fix — only send a new offer from 'stable'.
      // If we're mid-negotiation, queue it; the onsignalingstatechange handler will
      // flush it once the state settles back to stable.
      if (pc.signalingState === 'stable') {
        await this._sendOffer(viewerId, pc);
      } else {
        console.log(
          `[HostWebRTC] State is '${pc.signalingState}' for ${viewerId}, queuing renegotiation`
        );
        this.pendingRenegotiation.add(viewerId);
      }
    }
  }

  // ─── Peer lifecycle ───────────────────────────────────────────────────────

  /**
   * Called when a new viewer joins the room.
   * Sub-Task 2: if localStream is not yet available, set up the PeerConnection
   * but defer the offer — it will be sent when setLocalStream() is first called.
   */
  public async handlePeerJoined(viewerId: string) {
    console.log(`[HostWebRTC] Setting up peer connection for viewer ${viewerId}`);
    const existing = this.peerConnections.get(viewerId);
    if (existing) {
      existing.close();
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.peerConnections.set(viewerId, pc);

    // Add existing stream tracks if we already have a stream
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        console.log(
          `[HostWebRTC] Adding ${track.kind} track (${track.label}) to viewer ${viewerId}`
        );
        pc.addTrack(track, this.localStream!);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal({
          type: 'SIGNAL_ICE',
          roomCode: this.roomCode,
          targetPeerId: viewerId,
          candidate: event.candidate,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[HostWebRTC] Connection with ${viewerId}: ${pc.connectionState}`);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.peerConnections.delete(viewerId);
        this.pendingOfferPeers.delete(viewerId);
        this.pendingRenegotiation.delete(viewerId);
      }
    };

    // Sub-Task 3: flush any queued renegotiation when state returns to stable
    pc.onsignalingstatechange = () => {
      if (pc.signalingState === 'stable' && this.pendingRenegotiation.has(viewerId)) {
        console.log(
          `[HostWebRTC] State settled to stable for ${viewerId}, sending deferred renegotiation offer`
        );
        this.pendingRenegotiation.delete(viewerId);
        this._sendOffer(viewerId, pc).catch(console.error);
      }
    };

    // Sub-Task 2: only send the initial offer if we already have a stream.
    // Otherwise, mark as pending and wait for setLocalStream().
    if (this.localStream) {
      await this._sendOffer(viewerId, pc);
    } else {
      console.log(`[HostWebRTC] No stream yet for ${viewerId}, deferring offer until setLocalStream()`);
      this.pendingOfferPeers.add(viewerId);
    }
  }

  public async handleSignalAnswer(
    senderPeerId: string,
    sdp: RTCSessionDescriptionInit
  ) {
    const pc = this.peerConnections.get(senderPeerId);
    if (!pc) {
      console.warn(`[HostWebRTC] No peer connection for answer from ${senderPeerId}`);
      return;
    }
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      // Flush any ICE candidates that arrived before the answer
      const queued = this.pendingCandidates.get(senderPeerId);
      if (queued) {
        for (const cand of queued) {
          await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(console.warn);
        }
        this.pendingCandidates.delete(senderPeerId);
      }
    } catch (err) {
      console.error(
        `[HostWebRTC] Error setting remote description for ${senderPeerId}:`,
        err
      );
    }
  }

  public async handleSignalIce(
    senderPeerId: string,
    candidate: RTCIceCandidateInit
  ) {
    const pc = this.peerConnections.get(senderPeerId);
    if (!pc) return;
    try {
      if (!pc.remoteDescription || !pc.remoteDescription.type) {
        const list = this.pendingCandidates.get(senderPeerId) || [];
        list.push(candidate);
        this.pendingCandidates.set(senderPeerId, list);
      } else {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (err) {
      console.error(`[HostWebRTC] Error adding ICE candidate from ${senderPeerId}:`, err);
    }
  }

  public handlePeerLeft(viewerId: string) {
    const pc = this.peerConnections.get(viewerId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(viewerId);
    }
    this.pendingOfferPeers.delete(viewerId);
    this.pendingRenegotiation.delete(viewerId);
  }

  public closeAll() {
    this.peerConnections.forEach((pc) => pc.close());
    this.peerConnections.clear();
    this.pendingOfferPeers.clear();
    this.pendingRenegotiation.clear();
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  private async _sendOffer(viewerId: string, pc: RTCPeerConnection) {
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log(`[HostWebRTC] Sending SDP offer to ${viewerId}`);
      this.sendSignal({
        type: 'SIGNAL_OFFER',
        roomCode: this.roomCode,
        targetPeerId: viewerId,
        sdp: offer,
      });
    } catch (err) {
      console.error(`[HostWebRTC] Error creating/sending offer for ${viewerId}:`, err);
    }
  }
}

export class ViewerWebRTCManager {
  private pc: RTCPeerConnection | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private roomCode: string;
  private sendSignal: (msg: WSClientMessage) => void;
  private onRemoteStream: (stream: MediaStream) => void;
  private onConnectionStateChange?: (state: RTCPeerConnectionState) => void;

  constructor(
    roomCode: string,
    sendSignal: (msg: WSClientMessage) => void,
    onRemoteStream: (stream: MediaStream) => void,
    onConnectionStateChange?: (state: RTCPeerConnectionState) => void
  ) {
    this.roomCode = roomCode;
    this.sendSignal = sendSignal;
    this.onRemoteStream = onRemoteStream;
    this.onConnectionStateChange = onConnectionStateChange;
  }

  public async handleSignalOffer(
    hostPeerId: string,
    sdp: RTCSessionDescriptionInit
  ) {
    console.log(
      `[ViewerWebRTC] Received offer from host ${hostPeerId}, pc existing: ${!!this.pc}`
    );

    if (!this.pc) {
      this.pc = new RTCPeerConnection(ICE_SERVERS);

      this.pc.ontrack = (event) => {
        console.log(
          `[ViewerWebRTC] ontrack:`,
          event.track.kind,
          event.track.id,
          'streams:',
          event.streams.length
        );
        const stream =
          event.streams && event.streams[0]
            ? event.streams[0]
            : new MediaStream([event.track]);
        console.log(
          `[ViewerWebRTC] Passing stream with tracks:`,
          stream.getTracks().map((t) => `${t.kind}:${t.readyState}`)
        );
        this.onRemoteStream(stream);
      };

      this.pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log(`[ViewerWebRTC] Sending ICE candidate to host`);
          this.sendSignal({
            type: 'SIGNAL_ICE',
            roomCode: this.roomCode,
            targetPeerId: hostPeerId,
            candidate: event.candidate,
          });
        }
      };

      this.pc.onconnectionstatechange = () => {
        console.log(
          `[ViewerWebRTC] Connection state: ${this.pc?.connectionState}, ICE: ${this.pc?.iceConnectionState}`
        );
        if (this.onConnectionStateChange && this.pc) {
          this.onConnectionStateChange(this.pc.connectionState);
        }
      };
    }

    try {
      await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);

      this.sendSignal({
        type: 'SIGNAL_ANSWER',
        roomCode: this.roomCode,
        targetPeerId: hostPeerId,
        sdp: answer,
      });

      // Flush any ICE candidates that arrived before the offer was processed
      for (const cand of this.pendingCandidates) {
        await this.pc.addIceCandidate(new RTCIceCandidate(cand)).catch(console.warn);
      }
      this.pendingCandidates = [];
    } catch (err) {
      console.error(`[ViewerWebRTC] Error responding to offer:`, err);
    }
  }

  public async handleSignalIce(candidate: RTCIceCandidateInit) {
    if (!this.pc) return;
    try {
      if (!this.pc.remoteDescription || !this.pc.remoteDescription.type) {
        this.pendingCandidates.push(candidate);
      } else {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (err) {
      console.error(`[ViewerWebRTC] Error adding ICE candidate:`, err);
    }
  }

  public close() {
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
  }
}
