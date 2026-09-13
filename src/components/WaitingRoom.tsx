'use client';

import React, { useState, useEffect } from 'react';
import { Room, Participant } from '@/types';
import { Copy, Check, Users, Shield, Play, Loader2, Sparkles, Monitor } from 'lucide-react';

interface WaitingRoomProps {
  room: Room;
  selfParticipant: Participant;
  isHost: boolean;
  onStartWatching: () => void;
  /** Called when the host clicks "Start Sharing Screen" — async so the caller
   *  can run getDisplayMedia() and handle success/cancel. */
  onStartScreenShare?: () => Promise<void>;
}

export function WaitingRoom({
  room,
  selfParticipant,
  isHost,
  onStartWatching,
  onStartScreenShare,
}: WaitingRoomProps) {
  const [copied, setCopied] = useState(false);
  const [tunnelOrigin, setTunnelOrigin] = useState<string | null>(null);
  const [sharingLoading, setSharingLoading] = useState(false);

  useEffect(() => {
    fetch('/api/tunnel-url')
      .then((r) => r.json())
      .then((data) => { if (data.url) setTunnelOrigin(data.url); })
      .catch(() => {});
  }, []);

  const participantsList = Object.values(room.participants || {});
  const origin = tunnelOrigin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const joinUrl = origin ? `${origin}/r/${room.roomCode}` : '';

  const handleCopyLink = () => {
    if (!joinUrl) return;
    navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const isScreenMode = room.mediaMode === 'screen';

  const handleScreenShareClick = async () => {
    if (!onStartScreenShare) return;
    setSharingLoading(true);
    try {
      await onStartScreenShare();
    } finally {
      setSharingLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="max-w-xl w-full glass-panel rounded-3xl p-6 sm:p-10 text-center space-y-8">
        <div>
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-xs font-semibold text-indigo-300 mb-4 backdrop-blur-md">
            {isScreenMode ? (
              <>
                <Monitor className="w-3.5 h-3.5" />
                <span>Screen Share Room</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Room Ready & Waiting</span>
              </>
            )}
          </div>
          <h1 className="text-3xl font-black text-white mb-2 drop-shadow-md">{room.roomName}</h1>
          <p className="text-sm text-slate-300">
            Share the link or code with your friends before starting
          </p>
        </div>

        {/* Room Code Showcase Box */}
        <div className="p-6 rounded-2xl bg-black/40 border border-white/15 flex flex-col items-center justify-center space-y-4 backdrop-blur-md">
          <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
            Room Code
          </span>
          <div className="text-4xl sm:text-5xl font-mono font-black tracking-[0.25em] text-white drop-shadow-lg">
            {room.roomCode}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleCopyLink}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-semibold flex items-center gap-2 transition backdrop-blur-md shadow-md"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied Link!' : 'Copy Invite Link'}</span>
            </button>
          </div>
        </div>

        {/* Participant List */}
        <div className="space-y-3 text-left">
          <div className="flex items-center justify-between text-xs font-bold text-slate-300">
            <span>People in room</span>
            <span className="flex items-center gap-1 text-emerald-300 font-semibold">
              <Users className="w-3.5 h-3.5" />
              {participantsList.length} / {room.settings.maxParticipants}
            </span>
          </div>

          <div className="space-y-2">
            {participantsList.map((p) => {
              const isSelf = p.id === selfParticipant.id;
              const isPartyHost = p.role === 'host';
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-3.5 rounded-2xl bg-black/30 border border-white/10 backdrop-blur-md"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-md shadow-emerald-400/50" />
                    <span className="text-sm font-semibold text-white">
                      {p.displayName}{' '}
                      {isSelf && <span className="text-xs text-slate-400 font-normal">(You)</span>}
                    </span>
                  </div>
                  {isPartyHost ? (
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-200">
                      HOST 👑
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400 font-medium">Connected</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="pt-2">
          {isHost ? (
            isScreenMode ? (
              <button
                onClick={handleScreenShareClick}
                disabled={sharingLoading}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-base flex items-center justify-center gap-2 shadow-xl shadow-indigo-600/30 ring-1 ring-white/20 transition transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {sharingLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Waiting for screen picker…</span>
                  </>
                ) : (
                  <>
                    <Monitor className="w-5 h-5" />
                    <span>Start Sharing Screen</span>
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={onStartWatching}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-base flex items-center justify-center gap-2 shadow-xl shadow-indigo-600/30 ring-1 ring-white/20 transition transform hover:scale-[1.02] active:scale-[0.98]"
              >
                <Play className="w-5 h-5 fill-white" />
                <span>Start Watching Movie</span>
              </button>
            )
          ) : (
            <div className="p-4 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-center gap-3 text-sm text-slate-200 backdrop-blur-md">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
              <span>
                {isScreenMode
                  ? 'Waiting for the host to start screen sharing…'
                  : 'Waiting for host to start playback…'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
