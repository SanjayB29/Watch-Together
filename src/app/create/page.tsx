'use client';

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Film, UploadCloud, CheckCircle2, Lock, ShieldCheck, ArrowLeft, Loader2, Play } from 'lucide-react';
import { inspectMediaFile } from '@/lib/mediaInspector';
import { MovieMetadata } from '@/types';

import { setActiveHostFile } from '@/lib/fileStore';

export default function CreateRoomPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [metadata, setMetadata] = useState<MovieMetadata | null>(null);
  const [hostName, setHostName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [hostOnlyControl, setHostOnlyControl] = useState(true);
  const [requirePasscode, setRequirePasscode] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    await processFile(selected);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    if (!dropped) return;
    await processFile(dropped);
  };

  const processFile = async (selectedFile: File) => {
    setFile(selectedFile);
    await setActiveHostFile(selectedFile);
    setAnalyzing(true);
    setError(null);

    try {
      const meta = await inspectMediaFile(selectedFile);
      setMetadata(meta);
      if (!roomName) {
        // Clean name without extension
        const cleanName = selectedFile.name.replace(/\.[^/.]+$/, '');
        setRoomName(`${cleanName} Watch Party`);
      }
    } catch (err: any) {
      console.error(err);
      setError('Could not analyze movie file, but you can still attempt playback.');
    } finally {
      setAnalyzing(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024 * 1024) {
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'Unknown';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a movie file from your device first.');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostName: hostName.trim() || 'Host',
          roomName: roomName.trim() || `${file.name} Party`,
          settings: {
            hostOnlyControl,
            passcode: requirePasscode ? passcode : undefined,
            maxParticipants: 5,
          },
          movieMetadata: metadata || {
            name: file.name,
            size: file.size,
            type: file.type,
          },
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to create room');
      }

      // Store host credentials in localStorage for room session
      if (typeof window !== 'undefined') {
        localStorage.setItem(`cinelink_role_${data.roomCode}`, 'host');
        localStorage.setItem(`cinelink_name_${data.roomCode}`, hostName.trim() || 'Host');
        localStorage.setItem(`cinelink_hostId_${data.roomCode}`, data.hostId);
      }

      router.push(`/r/${data.roomCode}`);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
      setCreating(false);
    }
  };

  return (
    <main className="min-h-screen bg-background bg-hero-glow py-10 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Back header */}
        <div className="flex items-center justify-between mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Home</span>
          </Link>
          <div className="flex items-center gap-2 text-xs text-indigo-400 bg-surface px-3 py-1 rounded-full border border-surface-border">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Local file streaming</span>
          </div>
        </div>

        <div className="bg-surface/80 border border-surface-border rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
          <div className="mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Create a Watch Room</h1>
            <p className="text-sm text-gray-400">
              Select a movie on your computer. Your browser will stream it directly to your guests without uploading to any server.
            </p>
          </div>

          <form onSubmit={handleCreateRoom} className="space-y-6">
            {/* File Dropzone */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                Movie File (MKV, MP4, WebM, MOV)
              </label>

              <input
                ref={fileInputRef}
                type="file"
                accept="video/*,.mkv,.mp4,.webm,.mov"
                onChange={handleFileChange}
                className="hidden"
              />

              {!file ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  className="border-2 border-dashed border-surface-border hover:border-primary/60 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition bg-surface/40 hover:bg-surface-light/40 group text-center"
                >
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-3 group-hover:scale-110 transition-transform">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-medium text-white mb-1">Click to browse or drop movie file here</p>
                  <p className="text-xs text-gray-500">MKV (H.264/AAC direct play), MP4, WebM • Up to 4K</p>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-cinema-card border border-cinema-border flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-primary mt-0.5">
                      <Film className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white truncate max-w-sm sm:max-w-md">{file.name}</p>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400 mt-1">
                        <span>{formatFileSize(file.size)}</span>
                        {analyzing ? (
                          <span className="flex items-center gap-1 text-primary">
                            <Loader2 className="w-3 h-3 animate-spin" /> Analyzing container...
                          </span>
                        ) : metadata ? (
                          <>
                            <span>• {metadata.videoCodec || 'Video'}</span>
                            {metadata.duration && <span>• {formatDuration(metadata.duration)}</span>}
                            {metadata.resolution && <span>• {metadata.resolution.width}x{metadata.resolution.height}</span>}
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      setMetadata(null);
                      setActiveHostFile(null);
                    }}
                    className="text-xs text-gray-400 hover:text-red-400 transition ml-2"
                  >
                    Change
                  </button>
                </div>
              )}
            </div>

            {/* Host Name & Room Title */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Your Display Name</label>
                <input
                  type="text"
                  value={hostName}
                  onChange={(e) => setHostName(e.target.value)}
                  placeholder="e.g. Sanjay (Host)"
                  className="w-full px-4 py-2.5 rounded-lg bg-surface border border-surface-border text-white placeholder-gray-500 focus:outline-none focus:border-primary text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Room Title</label>
                <input
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="e.g. Interstellar Watch Party"
                  className="w-full px-4 py-2.5 rounded-lg bg-surface border border-surface-border text-white placeholder-gray-500 focus:outline-none focus:border-primary text-sm"
                />
              </div>
            </div>

            {/* Permissions & Security Settings */}
            <div className="p-4 rounded-xl bg-surface/50 border border-surface-border space-y-3">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hostOnlyControl}
                  onChange={(e) => setHostOnlyControl(e.target.checked)}
                  className="w-4 h-4 rounded text-primary border-gray-700 bg-surface focus:ring-0"
                />
                <div>
                  <span className="text-sm font-medium text-white block">Only host can control playback</span>
                  <span className="text-xs text-gray-400 block">Prevents guests from pausing or seeking without your input</span>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={requirePasscode}
                  onChange={(e) => setRequirePasscode(e.target.checked)}
                  className="w-4 h-4 rounded text-primary border-gray-700 bg-surface focus:ring-0"
                />
                <div>
                  <span className="text-sm font-medium text-white block">Require room passcode</span>
                  <span className="text-xs text-gray-400 block">Guests must enter a password to join</span>
                </div>
              </label>

              {requirePasscode && (
                <div className="pt-2">
                  <input
                    type="password"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="Enter room password"
                    className="w-full px-4 py-2 rounded-lg bg-surface border border-surface-border text-white placeholder-gray-500 focus:outline-none focus:border-primary text-sm"
                  />
                </div>
              )}
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                {error}
              </div>
            )}

            {/* Create CTA Button */}
            <button
              type="submit"
              disabled={creating || analyzing || !file}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-primary to-primary-purple hover:from-primary-hover hover:to-primary text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-primary/25 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creating Room...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  <span>Create Room & Get Link</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
