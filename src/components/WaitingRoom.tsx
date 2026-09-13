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
    <div className="min-h-screen bg-background bg-hero-glow flex flex-col items-center justify-center p-4">
      <div className="max-w-xl w-full bg-surface/90 border border-surface-border rounded-3xl p-6 sm:p-10 backdrop-blur-2xl shadow-2xl text-center space-y-8">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary-purple mb-4">
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
          <h1 className="text-3xl font-extrabold text-white mb-2">{room.roomName}</h1>
          <p className="text-sm text-gray-400">
            Share the link or code with your friends before starting
          </p>
        </div>

        {/* Room Code Showcase Box */}
        <div className="p-6 rounded-2xl bg-cinema-card border border-cinema-border flex flex-col items-center justify-center space-y-4">
          <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            Room Code
          </span>
          <div className="text-4xl sm:text-5xl font-mono font-black tracking-[0.25em] text-white">
            {room.roomCode}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleCopyLink}
              className="px-4 py-2 rounded-xl bg-surface-light hover:bg-surface border border-surface-border text-white text-xs font-medium flex items-center gap-2 transition"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied Link!' : 'Copy Invite Link'}</span>
            </button>
          </div>
        </div>

        {/* Participant List */}
        <div className="space-y-3 text-left">
          <div className="flex items-center justify-between text-xs font-semibold text-gray-400">
            <span>People in room</span>
            <span className="flex items-center gap-1 text-emerald-400">
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
                  className="flex items-center justify-between p-3 rounded-xl bg-surface/50 border border-surface-border/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
                    <span className="text-sm font-medium text-white">
                      {p.displayName}{' '}
                      {isSelf && <span className="text-xs text-gray-400 font-normal">(You)</span>}
                    </span>
                  </div>
                  {isPartyHost ? (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300">
                      HOST 👑
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">Connected</span>
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
                className="w-full py-4 rounded-xl bg-gradient-to-r from-primary to-primary-purple hover:from-primary-hover hover:to-primary text-white font-bold text-base flex items-center justify-center gap-2 shadow-xl shadow-primary/30 transition transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
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
                className="w-full py-4 rounded-xl bg-gradient-to-r from-primary to-primary-purple hover:from-primary-hover hover:to-primary text-white font-bold text-base flex items-center justify-center gap-2 shadow-xl shadow-primary/30 transition transform hover:scale-[1.02] active:scale-[0.98]"
              >
                <Play className="w-5 h-5 fill-white" />
                <span>Start Watching Movie</span>
              </button>
            )
          ) : (
            <div className="p-4 rounded-xl bg-surface/40 border border-surface-border flex items-center justify-center gap-3 text-sm text-gray-300">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
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
