'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Room, Participant, ChatMessage, PlaybackState } from '@/types';
import { WaitingRoom } from '@/components/WaitingRoom';
import { CinemaPlayer } from '@/components/CinemaPlayer';
import { ChatPanel } from '@/components/ChatPanel';
import { HostWebRTCManager, ViewerWebRTCManager } from '@/lib/webrtc';
import { PlaybackSyncEngine } from '@/lib/syncEngine';
import { getActiveHostFile, loadHostFile, setActiveHostFile } from '@/lib/fileStore';
import { getPusherClient, roomChannel } from '@/lib/pusher';
import { Loader2, AlertTriangle, Copy, Check, MessageSquare } from 'lucide-react';
import type { Channel } from 'pusher-js';

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = (params.roomCode as string)?.toUpperCase();

  const [loading, setLoading] = useState(true);
  const [room, setRoom] = useState<Room | null>(null);
  const [selfParticipant, setSelfParticipant] = useState<Participant | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [streamReady, setStreamReady] = useState(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pusherChannelRef = useRef<Channel | null>(null);
  const hostWebRTCRef = useRef<HostWebRTCManager | null>(null);
  const viewerWebRTCRef = useRef<ViewerWebRTCManager | null>(null);
  const syncEngineRef = useRef<PlaybackSyncEngine | null>(null);
  const capturedStreamRef = useRef<MediaStream | null>(null);
  const pendingRemoteStreamRef = useRef<MediaStream | null>(null);
  const pendingHostFileRef = useRef<File | null>(null);
  // Store latest selfParticipantId in a ref to avoid stale closures in Pusher callbacks
  const selfIdRef = useRef<string | null>(null);
  const isHostRef = useRef(false);

  const isHost = selfParticipant?.role === 'host';
  const canControl = isHost || !room?.settings.hostOnlyControl;

  // ── Signal helper: POST to /api/signal instead of ws.send ─────────────────
  const sendSignal = useCallback(
    async (msg: object) => {
      try {
        await fetch('/api/signal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(msg),
        });
      } catch (e) {
        console.error('[sendSignal] fetch error:', e);
      }
    },
    []
  );

  // ── captureStream helper ──────────────────────────────────────────────────
  const getCapturedStream = (videoEl: HTMLVideoElement): MediaStream | null => {
    if (capturedStreamRef.current) return capturedStreamRef.current;
    try {
      const hasCaptureStream = typeof (videoEl as any).captureStream === 'function';
      const hasMozCaptureStream = typeof (videoEl as any).mozCaptureStream === 'function';
      if (!hasCaptureStream && !hasMozCaptureStream) {
        setError('Your browser does not support video streaming (captureStream). Please use Chrome or Firefox as the host.');
        return null;
      }
      const stream: MediaStream = hasCaptureStream
        ? (videoEl as any).captureStream()
        : (videoEl as any).mozCaptureStream();
      if (stream) {
        capturedStreamRef.current = stream;
        console.log('[RoomPage] captureStream() captured:', stream.getTracks().map((t: MediaStreamTrack) => `${t.kind}:${t.readyState}`));
      }
      return stream ?? null;
    } catch (e: any) {
      console.warn('[RoomPage] captureStream error:', e);
      setError(`captureStream failed: ${e?.message}. Please use Chrome or Firefox.`);
      return null;
    }
  };

  // ── Join room on mount ────────────────────────────────────────────────────
  useEffect(() => {
    if (!roomCode) return;

    const isHostSession = localStorage.getItem(`cinelink_role_${roomCode}`) === 'host';
    const storedName = localStorage.getItem(`cinelink_name_${roomCode}`) || (isHostSession ? 'Host' : 'Guest');
    const storedPasscode = localStorage.getItem(`cinelink_passcode_${roomCode}`) || undefined;
    const storedHostId = localStorage.getItem(`cinelink_hostId_${roomCode}`);
    const participantId = isHostSession
      ? (storedHostId || `user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`)
      : `user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    selfIdRef.current = participantId;
    isHostRef.current = isHostSession;

    // POST join to REST API
    fetch('/api/signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'ROOM_JOIN',
        roomCode,
        participantId,
        displayName: storedName,
        passcode: storedPasscode,
        isHost: isHostSession,
        hostId: isHostSession ? (storedHostId || participantId) : undefined,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) {
          setError(data.error || 'Failed to join room');
          setLoading(false);
          return;
        }

        const resolvedRoom: Room = data.room;
        const self: Participant = resolvedRoom.participants[data.selfId] || {
          id: data.selfId,
          displayName: storedName,
          role: data.role,
          connected: true,
          joinedAt: Date.now(),
        };

        setRoom(resolvedRoom);
        setSelfParticipant(self);
        setLoading(false);

        // Init sync engine
        const syncEngine = new PlaybackSyncEngine(self.role === 'host');
        syncEngineRef.current = syncEngine;
        if (videoRef.current) syncEngine.attachVideoElement(videoRef.current);

        if (self.role === 'host') {
          isHostRef.current = true;
          const hostManager = new HostWebRTCManager(roomCode, (msg) =>
            sendSignal({ ...msg, senderPeerId: self.id })
          );
          hostWebRTCRef.current = hostManager;

          // Connect already-present peers
          Object.values(resolvedRoom.participants || {}).forEach((p) => {
            if (p.id !== self.id && p.connected) {
              hostManager.handlePeerJoined(p.id);
            }
          });

          if (resolvedRoom.status === 'playing') {
            loadHostFile().then((file) => {
              if (file) pendingHostFileRef.current = file;
            });
          }
        } else {
          setStreamReady(false);
          const viewerManager = new ViewerWebRTCManager(
            roomCode,
            (msg) => sendSignal({ ...msg, senderPeerId: self.id }),
            (remoteStream) => {
              pendingRemoteStreamRef.current = remoteStream;
              if (videoRef.current) {
                const videoEl = videoRef.current;
                if (videoEl.srcObject !== remoteStream) videoEl.srcObject = remoteStream;
                videoEl.muted = true;
                videoEl.play()
                  .then(() => setStreamReady(true))
                  .catch(() => setStreamReady(true));
              }
            },
            (state) => console.log('[ViewerWebRTC] Connection state:', state)
          );
          viewerWebRTCRef.current = viewerManager;
        }

        // Subscribe to Pusher presence channel — pass participantId so the auth
        // endpoint can look up the participant without a session cookie.
        const pusher = getPusherClient(self.id);
        const channel = pusher.subscribe(roomChannel(roomCode));
        pusherChannelRef.current = channel;

        // ── Pusher event handlers ──────────────────────────────────────────
        channel.bind('PEER_JOINED', (d: { participant: Participant }) => {
          setRoom((prev) => {
            if (!prev) return prev;
            return { ...prev, participants: { ...prev.participants, [d.participant.id]: d.participant } };
          });
          if (isHostRef.current && hostWebRTCRef.current && d.participant.id !== selfIdRef.current) {
            hostWebRTCRef.current.handlePeerJoined(d.participant.id);
          }
        });

        channel.bind('PEER_LEFT', (d: { participantId: string }) => {
          setRoom((prev) => {
            if (!prev) return prev;
            const next = { ...prev.participants };
            delete next[d.participantId];
            return { ...prev, participants: next };
          });
          if (isHostRef.current && hostWebRTCRef.current) {
            hostWebRTCRef.current.handlePeerLeft(d.participantId);
          }
        });

        channel.bind('ROOM_UPDATED', (d: { room: Partial<Room> }) => {
          setRoom((prev) => (prev ? { ...prev, ...d.room } : prev));
        });

        channel.bind('START_WATCHING', () => {
          setRoom((prev) => (prev ? { ...prev, status: 'playing' } : prev));
        });

        // WebRTC Signals — each viewer only receives events addressed to them
        channel.bind(`SIGNAL_OFFER_${self.id}`, (d: { senderPeerId: string; sdp: any }) => {
          if (!isHostRef.current && viewerWebRTCRef.current) {
            viewerWebRTCRef.current.handleSignalOffer(d.senderPeerId, d.sdp);
          }
        });

        channel.bind(`SIGNAL_ANSWER_${self.id}`, (d: { senderPeerId: string; sdp: any }) => {
          if (isHostRef.current && hostWebRTCRef.current) {
            hostWebRTCRef.current.handleSignalAnswer(d.senderPeerId, d.sdp);
          }
        });

        channel.bind(`SIGNAL_ICE_${self.id}`, (d: { senderPeerId: string; candidate: any }) => {
          if (isHostRef.current && hostWebRTCRef.current) {
            hostWebRTCRef.current.handleSignalIce(d.senderPeerId, d.candidate);
          } else if (!isHostRef.current && viewerWebRTCRef.current) {
            viewerWebRTCRef.current.handleSignalIce(d.candidate);
          }
        });

        channel.bind('PLAY', (d: { position: number; timestamp: number; senderId: string }) => {
          setIsPlaying(true);
          if (!isHostRef.current && syncEngineRef.current) {
            syncEngineRef.current.handlePlay(d.position, d.timestamp);
          }
        });

        channel.bind('PAUSE', (d: { position: number; senderId: string }) => {
          setIsPlaying(false);
          if (!isHostRef.current && syncEngineRef.current) {
            syncEngineRef.current.handlePause(d.position);
          }
        });

        channel.bind('SEEK', (d: { position: number; senderId: string }) => {
          setCurrentTime(d.position);
          if (!isHostRef.current && syncEngineRef.current) {
            syncEngineRef.current.handleSeek(d.position);
          }
        });

        channel.bind('SYNC_STATE', (d: { playback: PlaybackState }) => {
          setIsPlaying(d.playback.playing);
          if (!isHostRef.current && syncEngineRef.current) {
            syncEngineRef.current.applySyncState(d.playback);
          }
        });

        channel.bind('CHAT_MESSAGE', (d: { message: ChatMessage }) => {
          setMessages((prev) => [...prev, d.message]);
        });

        channel.bind('HOST_DISCONNECTED', () => {
          setStreamReady(false);
          setError('The host disconnected from the watch party.');
        });
      })
      .catch((e) => {
        setError('Failed to connect to room. Please try again.');
        setLoading(false);
        console.error('[RoomPage] join error:', e);
      });

    return () => {
      // Notify server of leave
      navigator.sendBeacon(
        '/api/signal',
        JSON.stringify({ type: 'ROOM_LEAVE', roomCode, participantId })
      );
      const pusher = getPusherClient();
      pusher.unsubscribe(roomChannel(roomCode));
      hostWebRTCRef.current?.closeAll();
      viewerWebRTCRef.current?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode]);

  // ── Host file attachment ──────────────────────────────────────────────────
  const attachFileToHostPlayer = (file: File) => {
    if (!videoRef.current) return;
    const isMkv = file.name.toLowerCase().endsWith('.mkv');
    const mimeType = isMkv ? 'video/mp4' : (file.type || 'video/mp4');
    const fileUrl = URL.createObjectURL(new Blob([file], { type: mimeType }));

    capturedStreamRef.current = null;

    let pushed = false;
    const pushStream = () => {
      if (!videoRef.current) return;
      if (videoRef.current.duration) setDuration(videoRef.current.duration);
      if (pushed) return;
      const stream = getCapturedStream(videoRef.current);
      if (stream) {
        pushed = true;
        hostWebRTCRef.current?.setLocalStream(stream);
      }
    };

    const videoEl = videoRef.current;
    const onCanPlay = () => pushStream();
    const onLoadedData = () => pushStream();
    videoEl.removeEventListener('canplay', (videoEl as any).__onCanPlay);
    videoEl.removeEventListener('loadeddata', (videoEl as any).__onLoadedData);
    (videoEl as any).__onCanPlay = onCanPlay;
    (videoEl as any).__onLoadedData = onLoadedData;
    videoEl.addEventListener('canplay', onCanPlay);
    videoEl.addEventListener('loadeddata', onLoadedData);
    videoEl.onerror = () => console.error('[RoomPage] Host video playback error:', videoEl.error);
    videoEl.src = fileUrl;
    videoEl.load();
    if (videoEl.readyState >= 2) pushStream();
  };

  useEffect(() => {
    const isCurrentHost = (selfParticipant?.role || localStorage.getItem(`cinelink_role_${roomCode}`)) === 'host';
    if (room?.status === 'playing' && isCurrentHost) {
      loadHostFile().then((file) => {
        if (file) pendingHostFileRef.current = file;
      });
    }
  }, [room?.status, selfParticipant?.role, roomCode]);

  // Attach pending file / stream once <video> mounts
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    if (isHost && pendingHostFileRef.current) {
      const file = pendingHostFileRef.current;
      pendingHostFileRef.current = null;
      attachFileToHostPlayer(file);
      return;
    }
    if (!isHost) {
      const stream = pendingRemoteStreamRef.current;
      if (!stream || videoEl.srcObject === stream) return;
      videoEl.srcObject = stream;
      videoEl.muted = true;
      videoEl.play()
        .then(() => setStreamReady(true))
        .catch(() => setStreamReady(true));
    }
  });

  // ── Playback controls ─────────────────────────────────────────────────────
  const handlePlay = () => {
    if (!videoRef.current || !canControl) return;
    if (!videoRef.current.src) {
      const activeFile = getActiveHostFile();
      if (activeFile) attachFileToHostPlayer(activeFile);
    }
    videoRef.current.play().then(() => {
      setIsPlaying(true);
      if (isHost && hostWebRTCRef.current && videoRef.current) {
        const stream = getCapturedStream(videoRef.current);
        if (stream) hostWebRTCRef.current.setLocalStream(stream);
      }
    }).catch((err) => console.error('Play error:', err));
    sendSignal({ type: 'PLAY', roomCode, participantId: selfIdRef.current, position: videoRef.current.currentTime, timestamp: Date.now() });
  };

  const handlePause = () => {
    if (!videoRef.current || !canControl) return;
    videoRef.current.pause();
    setIsPlaying(false);
    sendSignal({ type: 'PAUSE', roomCode, participantId: selfIdRef.current, position: videoRef.current.currentTime });
  };

  const handleSeek = (pos: number) => {
    if (!videoRef.current || !canControl) return;
    videoRef.current.currentTime = pos;
    setCurrentTime(pos);
    sendSignal({ type: 'SEEK', roomCode, participantId: selfIdRef.current, position: pos });
  };

  const handleStartWatching = () => {
    sendSignal({ type: 'START_WATCHING', roomCode, participantId: selfIdRef.current });
  };

  const handleSendMessage = (text: string) => {
    sendSignal({ type: 'CHAT_MESSAGE', roomCode, participantId: selfIdRef.current, text });
  };

  const handleHostReattachFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setActiveHostFile(file);
      attachFileToHostPlayer(file);
    }
  };

  // Periodic currentTime update + host sync heartbeat
  useEffect(() => {
    const interval = setInterval(() => {
      if (videoRef.current) {
        setCurrentTime(videoRef.current.currentTime);
        if (videoRef.current.duration && !isNaN(videoRef.current.duration)) {
          setDuration(videoRef.current.duration);
        }
        if (isHost && !videoRef.current.paused) {
          sendSignal({
            type: 'SYNC_STATE',
            roomCode,
            participantId: selfIdRef.current,
            playback: {
              playing: !videoRef.current.paused,
              position: videoRef.current.currentTime,
              timestamp: Date.now(),
              playbackRate: videoRef.current.playbackRate,
            },
          });
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isHost, roomCode, sendSignal]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center text-center p-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
        <h2 className="text-xl font-bold text-white mb-1">Connecting to CineLink Room...</h2>
        <p className="text-xs text-gray-400">Negotiating peer-to-peer connection &amp; synchronization</p>
      </div>
    );
  }

  if (error || !room || !selfParticipant) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center text-center p-6">
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 max-w-md space-y-4">
          <AlertTriangle className="w-10 h-10 mx-auto text-red-400" />
          <h2 className="text-lg font-bold text-white">{error || 'Room Error'}</h2>
          <button
            onClick={() => router.push('/')}
            className="w-full py-2.5 rounded-xl bg-surface hover:bg-surface-light border border-surface-border text-white text-xs font-semibold transition"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  if (room.status === 'waiting') {
    return (
      <WaitingRoom
        room={room}
        selfParticipant={selfParticipant}
        isHost={isHost}
        onStartWatching={handleStartWatching}
      />
    );
  }

  return (
    <div className="h-screen w-screen bg-black flex flex-col overflow-hidden">
      {/* Top compact cinema bar */}
      <div className="h-12 bg-cinema-card border-b border-cinema-border px-4 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <span className="text-xs font-black tracking-widest text-indigo-400">CINELINK</span>
          <span className="text-xs text-gray-400 font-mono">#{room.roomCode}</span>
          <span className="hidden sm:inline-block text-xs font-medium text-gray-300 truncate max-w-xs">
            {room.roomName}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              navigator.clipboard.writeText(window.location.href);
              setCopiedLink(true);
              setTimeout(() => setCopiedLink(false), 2000);
            }}
            className="px-2.5 py-1 rounded bg-surface hover:bg-surface-light border border-surface-border text-white text-xs flex items-center gap-1.5 transition"
          >
            {copiedLink ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copiedLink ? 'Copied' : 'Invite'}</span>
          </button>

          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`p-1.5 rounded transition ${sidebarOpen ? 'bg-primary text-white' : 'bg-surface text-gray-300'}`}
            title="Toggle Chat & Participants"
          >
            <MessageSquare className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Theatre Body */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 h-full bg-black relative">
          <CinemaPlayer
            videoRef={videoRef}
            isHost={isHost}
            canControl={canControl}
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration}
            onPlay={handlePlay}
            onPause={handlePause}
            onSeek={handleSeek}
            movieMetadata={room.movieMetadata}
            onReattachFile={handleHostReattachFile}
            streamReady={isHost || streamReady}
          />
        </div>

        {sidebarOpen && (
          <div className="w-80 sm:w-96 h-full flex-shrink-0">
            <ChatPanel
              messages={messages}
              participants={room.participants}
              selfId={selfParticipant.id}
              onSendMessage={handleSendMessage}
            />
          </div>
        )}
      </div>
    </div>
  );
}
