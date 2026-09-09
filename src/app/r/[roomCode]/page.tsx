'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Room, Participant, ChatMessage, WSServerMessage, WSClientMessage, PlaybackState } from '@/types';
import { WaitingRoom } from '@/components/WaitingRoom';
import { CinemaPlayer } from '@/components/CinemaPlayer';
import { ChatPanel } from '@/components/ChatPanel';
import { HostWebRTCManager, ViewerWebRTCManager } from '@/lib/webrtc';
import { PlaybackSyncEngine } from '@/lib/syncEngine';
import { getActiveHostFile, loadHostFile, setActiveHostFile } from '@/lib/fileStore';
import { Loader2, AlertTriangle, Shield, Copy, Check, Users, MessageSquare } from 'lucide-react';

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
  const [tunnelOrigin, setTunnelOrigin] = useState<string | null>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  // Sub-Task 6: true once the viewer's WebRTC stream is live; always true for host.
  const [streamReady, setStreamReady] = useState(false);

  // Video element ref & manager refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const hostWebRTCRef = useRef<HostWebRTCManager | null>(null);
  const viewerWebRTCRef = useRef<ViewerWebRTCManager | null>(null);
  const syncEngineRef = useRef<PlaybackSyncEngine | null>(null);
  // Sub-Task 1: single cached captureStream result — call captureStream() once per
  // video element lifecycle so all callers share the same MediaStream reference.
  const capturedStreamRef = useRef<MediaStream | null>(null);
  // Stale-closure fix: ws.onmessage is set once, so it must call the latest version
  // of handleServerMessage via this ref rather than the captured closure.
  const handleServerMessageRef = useRef<(msg: WSServerMessage) => void>(() => {});
  // Viewer: remote stream may arrive before the <video> element mounts.
  // Store it here so the mount effect can attach it.
  const pendingRemoteStreamRef = useRef<MediaStream | null>(null);
  // Host: file to attach may be loaded before the <video> element mounts
  // (status effect fires during the WaitingRoom→CinemaPlayer transition).
  const pendingHostFileRef = useRef<File | null>(null);

  const isHost = selfParticipant?.role === 'host';
  const canControl = isHost || !room?.settings.hostOnlyControl;

  // Returns a captureStream() from the video element, or null if the browser
  // doesn't support it (Safari). Sets an error state in that case.
  const getCapturedStream = (videoEl: HTMLVideoElement): MediaStream | null => {
    if (capturedStreamRef.current) return capturedStreamRef.current;
    try {
      const hasCaptureStream = typeof (videoEl as any).captureStream === 'function';
      const hasMozCaptureStream = typeof (videoEl as any).mozCaptureStream === 'function';
      if (!hasCaptureStream && !hasMozCaptureStream) {
        setError('Your browser does not support video streaming (captureStream). Please use Chrome or Firefox as the host.');
        return null;
      }
      const stream: MediaStream =
        hasCaptureStream
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

  // Send message helper
  const sendWS = (msg: WSClientMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    } else {
      console.warn(`[sendWS] dropped ${msg.type} — WS not open (state=${wsRef.current?.readyState})`);
    }
  };

  useEffect(() => {
    fetch('/api/tunnel-url')
      .then((r) => r.json())
      .then((data) => { if (data.url) setTunnelOrigin(data.url); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!roomCode) return;

    let isUnmounted = false;
    let ws: WebSocket | null = null;
    let retryTimeout: NodeJS.Timeout | null = null;

    const connectWebSocket = () => {
      if (isUnmounted) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host || 'localhost:3000';
      const wsUrl = `${protocol}//${host}/ws`;
      console.log('[RoomPage] Connecting WebSocket to', wsUrl);

      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const isHostSession = localStorage.getItem(`cinelink_role_${roomCode}`) === 'host';
      const storedName = localStorage.getItem(`cinelink_name_${roomCode}`) || (isHostSession ? 'Host' : 'Guest');
      const storedPasscode = localStorage.getItem(`cinelink_passcode_${roomCode}`) || undefined;
      const storedHostId = localStorage.getItem(`cinelink_hostId_${roomCode}`);

      ws.onopen = () => {
        console.log('[WS] Connected to signaling');
        ws?.send(
          JSON.stringify({
            type: 'ROOM_JOIN',
            roomCode,
            displayName: storedName,
            passcode: storedPasscode,
            isHost: isHostSession,
            hostId: isHostSession ? (storedHostId || undefined) : undefined,
          } satisfies WSClientMessage)
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WSServerMessage;
          // Always call through the ref so we get the latest closure, not the
          // stale one captured when connectWebSocket() first ran.
          handleServerMessageRef.current(msg);
        } catch (err) {
          console.error('[WS] Parse message error:', err);
        }
      };

      ws.onerror = (e) => {
        console.error('[WS] Socket error', e);
      };

      ws.onclose = (e) => {
        console.log('[WS] Closed/Disconnected', e.code);
        if (!isUnmounted) {
          // Reconnect regardless of room state — handles server restarts and
          // brief network drops without leaving the user on a frozen screen.
          retryTimeout = setTimeout(() => {
            if (!isUnmounted) connectWebSocket();
          }, 1000);
        }
      };
    };

    connectWebSocket();

    return () => {
      isUnmounted = true;
      if (retryTimeout) clearTimeout(retryTimeout);
      if (ws) ws.close();
      hostWebRTCRef.current?.closeAll();
      viewerWebRTCRef.current?.close();
    };
  }, [roomCode]);

  // Handle incoming signaling messages.
  // IMPORTANT: keep handleServerMessageRef.current in sync so ws.onmessage always
  // calls the latest version (avoids stale-closure bugs with selfParticipant etc.).
  const handleServerMessage = (msg: WSServerMessage) => {
    switch (msg.type) {
      case 'ROOM_JOINED': {
        setRoom(msg.room);
        const self = msg.room.participants[msg.selfId] || {
          id: msg.selfId,
          displayName: 'Guest',
          role: msg.role,
          connected: true,
          joinedAt: Date.now(),
        };
        setSelfParticipant(self);
        setLoading(false);

        // Initialize sync engine
        const syncEngine = new PlaybackSyncEngine(self.role === 'host');
        syncEngineRef.current = syncEngine;
        if (videoRef.current) syncEngine.attachVideoElement(videoRef.current);

        // Initialize WebRTC managers based on role
        if (self.role === 'host') {
          const hostManager = new HostWebRTCManager(roomCode, sendWS);
          hostWebRTCRef.current = hostManager;

          // If video is already loaded (e.g. host refreshed), grab the cached stream
          if (videoRef.current && videoRef.current.readyState >= 3) {
            const stream = getCapturedStream(videoRef.current);
            if (stream) hostManager.setLocalStream(stream);
          }

          // Connect existing peers who were already in the room.
          // Sub-Task 7: handlePeerJoined() now works even with no stream — it will
          // defer the offer until setLocalStream() is called (Sub-Task 2).
          Object.values(msg.room.participants || {}).forEach((p) => {
            if (p.id !== self.id && p.connected) {
              hostManager.handlePeerJoined(p.id);
            }
          });

          // Sub-Task 7: if the room is already playing (host refreshed mid-session),
          // store the file in pendingHostFileRef — the post-render effect will attach
          // it once the <video> element mounts.
          if (msg.room.status === 'playing') {
            loadHostFile().then((file) => {
              if (file) {
                console.log('[RoomPage] Sub-Task 7: storing host file for attachment after refresh:', file.name);
                pendingHostFileRef.current = file;
              }
            });
          }
        } else {
          // Sub-Task 6: viewer starts with streamReady=false until ontrack fires
          setStreamReady(false);

          // Viewer WebRTC setup
          const viewerManager = new ViewerWebRTCManager(
            roomCode,
            sendWS,
            (remoteStream) => {
              console.log('[RoomPage] Remote stream received:', remoteStream.getTracks().map((t: MediaStreamTrack) => `${t.kind}:${t.readyState}`));
              // Always store — the video element may not be mounted yet.
              pendingRemoteStreamRef.current = remoteStream;

              const attachStream = (videoEl: HTMLVideoElement) => {
                if (videoEl.srcObject !== remoteStream) {
                  videoEl.srcObject = remoteStream;
                }
                videoEl.muted = true;
                videoEl.play().then(() => {
                  setStreamReady(true);
                }).catch((err) => {
                  console.warn('Viewer autoplay error:', err);
                  setStreamReady(true);
                });
              };

              if (videoRef.current) {
                attachStream(videoRef.current);
              }
              // If videoRef.current is null the pending stream will be picked up
              // by the useEffect below once the video element mounts.
            },
            (state) => {
              console.log('[ViewerWebRTC] Connection state:', state);
            }
          );
          viewerWebRTCRef.current = viewerManager;
        }
        break;
      }

      case 'ROOM_ERROR': {
        setError(msg.message);
        setLoading(false);
        break;
      }

      case 'PEER_JOINED': {
        setRoom((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            participants: {
              ...prev.participants,
              [msg.participant.id]: msg.participant,
            },
          };
        });
    
        // If host and the joined peer is not ourselves, initiate WebRTC connection
        const currentIsHost = localStorage.getItem(`cinelink_role_${roomCode}`) === 'host';
        if (currentIsHost && hostWebRTCRef.current && msg.participant.id !== selfParticipant?.id) {
          hostWebRTCRef.current.handlePeerJoined(msg.participant.id);
        }
        break;
      }

      case 'PEER_LEFT': {
        setRoom((prev) => {
          if (!prev) return prev;
          const nextParticipants = { ...prev.participants };
          delete nextParticipants[msg.participantId];
          return { ...prev, participants: nextParticipants };
        });
        if (isHost && hostWebRTCRef.current) {
          hostWebRTCRef.current.handlePeerLeft(msg.participantId);
        }
        break;
      }

      case 'ROOM_UPDATED': {
        setRoom((prev) => (prev ? { ...prev, ...msg.room } : prev));
        break;
      }

      case 'START_WATCHING': {
        setRoom((prev) => (prev ? { ...prev, status: 'playing' } : prev));
        break;
      }

      // WebRTC Signal Relays
      case 'SIGNAL_OFFER': {
        const currentIsHost = (selfParticipant?.role || localStorage.getItem(`cinelink_role_${roomCode}`)) === 'host';
        if (!currentIsHost && viewerWebRTCRef.current) {
          viewerWebRTCRef.current.handleSignalOffer(msg.senderPeerId, msg.sdp);
        }
        break;
      }

      case 'SIGNAL_ANSWER': {
        const currentIsHost = (selfParticipant?.role || localStorage.getItem(`cinelink_role_${roomCode}`)) === 'host';
        if (currentIsHost && hostWebRTCRef.current) {
          hostWebRTCRef.current.handleSignalAnswer(msg.senderPeerId, msg.sdp);
        }
        break;
      }

      case 'SIGNAL_ICE': {
        const currentIsHost = (selfParticipant?.role || localStorage.getItem(`cinelink_role_${roomCode}`)) === 'host';
        if (currentIsHost && hostWebRTCRef.current) {
          hostWebRTCRef.current.handleSignalIce(msg.senderPeerId, msg.candidate);
        } else if (!currentIsHost && viewerWebRTCRef.current) {
          viewerWebRTCRef.current.handleSignalIce(msg.candidate);
        }
        break;
      }

      // Playback Commands
      case 'PLAY': {
        console.log(`[RoomPage] Received PLAY command from ${msg.senderId} at pos ${msg.position}`);
        setIsPlaying(true);
        if (videoRef.current) {
          // If remoteStream is cached on viewer, ensure srcObject is attached
          if (!isHost && (window as any).__remoteStream && !videoRef.current.srcObject) {
            videoRef.current.srcObject = (window as any).__remoteStream;
          }
          if (videoRef.current.paused) {
            videoRef.current.play().catch((err) => {
              console.warn('[RoomPage] Unmuted play failed, falling back to muted autoplay:', err);
              if (videoRef.current) {
                videoRef.current.muted = true;
                videoRef.current.play().catch(console.error);
              }
            });
          }
        }
        if (!isHost && syncEngineRef.current) {
          syncEngineRef.current.handlePlay(msg.position, msg.timestamp);
        }
        break;
      }

      case 'PAUSE': {
        setIsPlaying(false);
        if (videoRef.current && !videoRef.current.paused) {
          videoRef.current.pause();
        }
        if (!isHost && syncEngineRef.current) {
          syncEngineRef.current.handlePause(msg.position);
        }
        break;
      }

      case 'SEEK': {
        setCurrentTime(msg.position);
        if (videoRef.current) {
          videoRef.current.currentTime = msg.position;
        }
        if (!isHost && syncEngineRef.current) {
          syncEngineRef.current.handleSeek(msg.position);
        }
        break;
      }

      case 'SYNC_STATE': {
        setIsPlaying(msg.playback.playing);
        if (videoRef.current) {
          if (!isHost && (window as any).__remoteStream && !videoRef.current.srcObject) {
            videoRef.current.srcObject = (window as any).__remoteStream;
          }
          if (msg.playback.playing && videoRef.current.paused) {
            videoRef.current.play().catch((err) => {
              if (videoRef.current) {
                videoRef.current.muted = true;
                videoRef.current.play().catch(console.error);
              }
            });
          } else if (!msg.playback.playing && !videoRef.current.paused) {
            videoRef.current.pause();
          }
        }
        if (!isHost && syncEngineRef.current) {
          syncEngineRef.current.applySyncState(msg.playback);
        }
        break;
      }

      case 'CHAT_MESSAGE': {
        setMessages((prev) => [...prev, msg.message]);
        break;
      }

      case 'HOST_DISCONNECTED': {
        // Sub-Task 6: hide the video and show the waiting overlay again
        setStreamReady(false);
        setError('The host disconnected from the watch party.');
        break;
      }
    }
  };
  // Keep the ref pointing at the freshest closure on every render
  handleServerMessageRef.current = handleServerMessage;

  // Function to attach video file to host player and initialize streaming
  const attachFileToHostPlayer = (file: File) => {
    if (!videoRef.current) return;
    const isMkv = file.name.toLowerCase().endsWith('.mkv');
    const mimeType = isMkv ? 'video/mp4' : (file.type || 'video/mp4');

    const fileBlob = file.type ? file : new Blob([file], { type: mimeType });
    const fileUrl = URL.createObjectURL(fileBlob);
    console.log('[RoomPage] Setting videoRef.src to object URL:', file.name, 'size:', file.size, 'mime:', mimeType);

    // Reset the cached stream so getCapturedStream() calls captureStream() fresh.
    capturedStreamRef.current = null;

    let pushed = false;
    const pushStream = () => {
      if (!videoRef.current) return;
      if (videoRef.current.duration) setDuration(videoRef.current.duration);
      if (pushed) return;
      const stream = getCapturedStream(videoRef.current);
      if (stream) {
        pushed = true;
        console.log('[RoomPage] pushStream: setLocalStream with', stream.getTracks().length, 'tracks');
        hostWebRTCRef.current?.setLocalStream(stream);
      }
    };

    // Use addEventListener so we can attach the handler before setting src,
    // preventing a missed canplay event if the browser fires it synchronously.
    const videoEl = videoRef.current;
    const onCanPlay = () => { pushStream(); };
    const onLoadedData = () => { pushStream(); };

    // Remove any previous listeners from a prior file load
    videoEl.removeEventListener('canplay', (videoEl as any).__onCanPlay);
    videoEl.removeEventListener('loadeddata', (videoEl as any).__onLoadedData);
    (videoEl as any).__onCanPlay = onCanPlay;
    (videoEl as any).__onLoadedData = onLoadedData;
    videoEl.addEventListener('canplay', onCanPlay);
    videoEl.addEventListener('loadeddata', onLoadedData);

    videoEl.onerror = () => {
      console.error('[RoomPage] Host video playback error:', videoEl.error);
    };

    videoEl.src = fileUrl;
    videoEl.load();

    // If the video is already in a playable state (e.g. same file re-attached),
    // push the stream immediately without waiting for events.
    if (videoEl.readyState >= 2) {
      pushStream();
    }
  };

  // Effect to load the host file when room becomes playing.
  // Stores the file in a ref — the actual attach happens once the <video> mounts.
  useEffect(() => {
    const isCurrentHost = (selfParticipant?.role || localStorage.getItem(`cinelink_role_${roomCode}`)) === 'host';
    if (room?.status === 'playing' && isCurrentHost) {
      loadHostFile().then((file) => {
        if (file) {
          console.log('[RoomPage] Host file loaded, storing for attachment:', file.name);
          pendingHostFileRef.current = file;
        }
      });
    }
  }, [room?.status, selfParticipant?.role, roomCode]);

  // Runs after every render — attaches pending host file or viewer stream as soon
  // as the <video> element is in the DOM. Cheap: guards prevent repeated work.
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    // Host: attach pending file once the video element exists
    if (isHost && pendingHostFileRef.current) {
      const file = pendingHostFileRef.current;
      pendingHostFileRef.current = null; // clear so we don't re-attach
      console.log('[RoomPage] Video element ready — attaching host file:', file.name);
      attachFileToHostPlayer(file);
      return;
    }

    // Viewer: attach pending remote stream once the video element exists
    if (!isHost) {
      const stream = pendingRemoteStreamRef.current;
      if (!stream) return;
      if (videoEl.srcObject === stream) return; // already attached

      console.log('[RoomPage] Video element ready — attaching pending remote stream');
      videoEl.srcObject = stream;
      videoEl.muted = true;
      videoEl.play().then(() => {
        setStreamReady(true);
      }).catch((err) => {
        console.warn('Viewer pending-stream autoplay error:', err);
        setStreamReady(true);
      });
    }
  }); // no deps — runs after every render, guards make it idempotent

  // Fallback file picker if page was refreshed or file was cleared from memory
  const handleHostReattachFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setActiveHostFile(file);
      attachFileToHostPlayer(file);
    }
  };

  // Host playback controls
  const handlePlay = () => {
    if (!videoRef.current || !canControl) return;
    
    // Ensure file is loaded on host video if not already attached
    if (!videoRef.current.src) {
      const activeFile = getActiveHostFile();
      if (activeFile) {
        attachFileToHostPlayer(activeFile);
      }
    }

    videoRef.current.play().then(() => {
      setIsPlaying(true);
      // Sub-Task 1: stream is already captured via oncanplay in attachFileToHostPlayer.
      // If for some reason it hasn't been captured yet (e.g. video was loaded without
      // triggering oncanplay), attempt to get it now using the cached helper.
      if (isHost && hostWebRTCRef.current && videoRef.current) {
        const stream = getCapturedStream(videoRef.current);
        if (stream) hostWebRTCRef.current.setLocalStream(stream);
      }
    }).catch((err) => console.error('Play error:', err));

    sendWS({
      type: 'PLAY',
      roomCode,
      position: videoRef.current.currentTime,
      timestamp: Date.now(),
    });
  };

  const handlePause = () => {
    if (!videoRef.current || !canControl) return;
    videoRef.current.pause();
    setIsPlaying(false);
    sendWS({
      type: 'PAUSE',
      roomCode,
      position: videoRef.current.currentTime,
    });
  };

  const handleSeek = (pos: number) => {
    if (!videoRef.current || !canControl) return;
    videoRef.current.currentTime = pos;
    setCurrentTime(pos);
    sendWS({
      type: 'SEEK',
      roomCode,
      position: pos,
    });
  };

  const handleStartWatching = () => {
    sendWS({
      type: 'START_WATCHING',
      roomCode,
    });
  };

  const handleSendMessage = (text: string) => {
    sendWS({
      type: 'CHAT_MESSAGE',
      roomCode,
      text,
    });
  };

  // Update currentTime periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (videoRef.current) {
        setCurrentTime(videoRef.current.currentTime);
        if (videoRef.current.duration && !isNaN(videoRef.current.duration)) {
          setDuration(videoRef.current.duration);
        }

        // Host periodically syncs playback state to the room
        if (isHost && !videoRef.current.paused) {
          sendWS({
            type: 'SYNC_STATE',
            roomCode,
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
  }, [isHost, roomCode]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center text-center p-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
        <h2 className="text-xl font-bold text-white mb-1">Connecting to CineLink Room...</h2>
        <p className="text-xs text-gray-400">Negotiating peer-to-peer connection & synchronization</p>
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

  // Render Waiting Room state
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

  // Render Cinema Player + Sidebar Layout
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
              const base = tunnelOrigin ?? window.location.origin;
              navigator.clipboard.writeText(`${base}/r/${roomCode}`);
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
            className={`p-1.5 rounded transition ${
              sidebarOpen ? 'bg-primary text-white' : 'bg-surface text-gray-300'
            }`}
            title="Toggle Chat & Participants"
          >
            <MessageSquare className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Theatre Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Video Area */}
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

        {/* Right Chat & Participants Panel */}
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
