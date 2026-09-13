'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Users, Lock, LogIn, Loader2, Sparkles } from 'lucide-react';

import { Suspense } from 'react';

function JoinRoomForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [roomCode, setRoomCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-fill code from query param if available (?code=XXXXXX)
  useEffect(() => {
    const code = searchParams.get('code');
    if (code) {
      setRoomCode(code.toUpperCase().trim());
      fetchPreview(code.toUpperCase().trim());
    }
  }, [searchParams]);

  const fetchPreview = async (code: string) => {
    if (!code || code.length < 4) return;
    setLoadingPreview(true);
    setError(null);

    try {
      const res = await fetch(`/api/rooms/${code}`);
      const data = await res.json();
      if (data.success) {
        setPreview(data.room);
      } else {
        setPreview(null);
        setError(data.error || 'Room not found');
      }
    } catch (e) {
      setPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleCodeChange = (val: string) => {
    const clean = val.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    setRoomCode(clean);
    if (clean.length >= 4) {
      fetchPreview(clean);
    } else {
      setPreview(null);
    }
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCode || roomCode.length < 4) {
      setError('Please enter a valid 6-character room code.');
      return;
    }

    if (preview && preview.isFull) {
      setError('This watch party is already full (max 5 participants).');
      return;
    }

    setJoining(true);

    if (typeof window !== 'undefined') {
      localStorage.setItem(`cinelink_name_${roomCode}`, displayName.trim() || 'Guest');
      if (passcode) {
        localStorage.setItem(`cinelink_passcode_${roomCode}`, passcode);
      }
    }

    router.push(`/r/${roomCode}`);
  };

  return (
    <main className="min-h-screen bg-background bg-hero-glow py-10 px-4 flex flex-col justify-center">
      <div className="max-w-md mx-auto w-full">
        <div className="flex items-center justify-between mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Home</span>
          </Link>
        </div>

        <div className="bg-surface/80 border border-surface-border rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
          <div className="text-center mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Join a Room</h1>
            <p className="text-sm text-gray-400">Enter the room code shared by your friend to join their watch party.</p>
          </div>

          <form onSubmit={handleJoin} className="space-y-5">
            {/* Room Code */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                Room Code
              </label>
              <input
                type="text"
                maxLength={6}
                value={roomCode}
                onChange={(e) => handleCodeChange(e.target.value)}
                placeholder="e.g. 8F4K2P"
                className="w-full text-center tracking-[0.3em] font-mono font-bold text-2xl py-3 rounded-xl bg-surface border border-surface-border text-white placeholder-gray-600 focus:outline-none focus:border-primary uppercase"
                autoFocus
              />
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Your Name (Optional)</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Jeff, Charan, Harshini"
                className="w-full px-4 py-2.5 rounded-lg bg-surface border border-surface-border text-white placeholder-gray-500 focus:outline-none focus:border-primary text-sm"
              />
            </div>

            {/* Room Preview Card if found */}
            {loadingPreview ? (
              <div className="p-4 rounded-xl bg-surface/40 border border-surface-border flex items-center justify-center gap-2 text-xs text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span>Locating room...</span>
              </div>
            ) : preview ? (
              <div className="p-4 rounded-xl bg-cinema-card border border-cinema-border space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">{preview.roomName}</h3>
                  <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    <Users className="w-3 h-3" />
                    {preview.participantCount}/{preview.maxParticipants}
                  </span>
                </div>

                {preview.mediaMode === 'screen' ? (
                  <p className="text-xs text-indigo-300 flex items-center gap-1.5">
                    🖥 <span>Screen Share Room</span>
                  </p>
                ) : preview.movieMetadata ? (
                  <p className="text-xs text-gray-400 truncate">
                    Streaming: <span className="text-gray-200">{preview.movieMetadata.name}</span>
                  </p>
                ) : null}

                {preview.requiresPasscode && (
                  <div className="pt-2">
                    <label className="block text-xs font-semibold text-amber-400 mb-1 flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Room Passcode Required
                    </label>
                    <input
                      type="password"
                      value={passcode}
                      onChange={(e) => setPasscode(e.target.value)}
                      placeholder="Enter room password"
                      className="w-full px-3 py-1.5 rounded-lg bg-surface border border-amber-500/30 text-white placeholder-gray-500 text-xs focus:outline-none focus:border-amber-400"
                    />
                  </div>
                )}
              </div>
            ) : null}

            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                {error}
              </div>
            )}

            {/* Join CTA */}
            <button
              type="submit"
              disabled={joining || roomCode.length < 4}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-primary to-primary-purple hover:from-primary-hover hover:to-primary text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-primary/25 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {joining ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Connecting to Party...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Join Watch Room</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

export default function JoinRoomPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center text-gray-400">Loading...</div>}>
      <JoinRoomForm />
    </Suspense>
  );
}
