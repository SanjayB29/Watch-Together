'use client';

import React, { useRef, useState, useEffect } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
  RotateCw,
  Subtitles,
  Settings,
  Sparkles,
  Lock,
  Monitor,
  AlertTriangle,
} from 'lucide-react';
import { MovieMetadata, RoomMediaMode } from '@/types';

interface CinemaPlayerProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  isHost: boolean;
  canControl: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (pos: number) => void;
  movieMetadata?: MovieMetadata;
  selectedSubtitle?: string;
  onSelectSubtitle?: (subId: string) => void;
  selectedAudio?: string;
  onSelectAudio?: (audioId: string) => void;
  subtitleCueText?: string;
  onReattachFile?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Sub-Task 6: false while the viewer is waiting for the host's stream to arrive */
  streamReady?: boolean;
  /** Controls which controls are rendered and what labels to show */
  mediaMode?: RoomMediaMode;
  /** Non-fatal warning to display when system audio was not captured */
  screenShareWarning?: string | null;
}

export function CinemaPlayer({
  videoRef,
  isHost,
  canControl,
  isPlaying,
  currentTime,
  duration,
  onPlay,
  onPause,
  onSeek,
  movieMetadata,
  selectedSubtitle,
  onSelectSubtitle,
  selectedAudio,
  onSelectAudio,
  subtitleCueText,
  onReattachFile,
  streamReady = true,
  mediaMode = 'movie',
  screenShareWarning,
}: CinemaPlayerProps) {
  const isScreenMode = mediaMode === 'screen';
  const filePickerRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showControls = () => {
    setControlsVisible(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setControlsVisible(false);
    }, 3500);
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Sub-Task 4: sync isMuted / volume from the actual video element state.
  // Browsers can mute the element externally (e.g. autoplay policy bypass), so
  // we read the element directly and keep React state in sync via 'volumechange'.
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    // Initialise from the element's current state
    setIsMuted(videoEl.muted);
    setVolume(videoEl.volume);

    const syncMuteState = () => {
      setIsMuted(videoEl.muted);
      setVolume(videoEl.volume);
    };

    videoEl.addEventListener('volumechange', syncMuteState);
    return () => videoEl.removeEventListener('volumechange', syncMuteState);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoRef.current]); // intentional: re-run when the underlying DOM element changes

  const togglePlayPause = () => {
    if (!canControl) return;
    if (isPlaying) {
      onPause();
    } else {
      onPlay();
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    if (isMuted) {
      videoRef.current.muted = false;
      videoRef.current.volume = volume || 0.5;
      setIsMuted(false);
    } else {
      videoRef.current.muted = true;
      setIsMuted(true);
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(console.error);
    } else {
      document.exitFullscreen().catch(console.error);
    }
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canControl) return;
    const target = parseFloat(e.target.value);
    onSeek(target);
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) {
      return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={showControls}
      onClick={showControls}
      className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden select-none group"
    >
      {/* HTML5 Video Element — muted state is managed programmatically via
          the volumechange listener above; do not set the muted JSX attribute
          here as it conflicts with the browser's own muted state tracking. */}
      <video
        ref={videoRef}
        playsInline
        autoPlay
        controls={false}
        className="w-full h-full object-contain cursor-pointer"
        onClick={togglePlayPause}
      />

      {/* Sub-Task 6: Viewer "waiting for stream" overlay — shown until the host's
          WebRTC stream has arrived and been assigned to the video element. */}
      {!isHost && !streamReady && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-black/70 backdrop-blur-sm pointer-events-none">
          <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          <p className="text-sm text-gray-300 font-medium">
            {isScreenMode
              ? 'Waiting for host to start screen sharing…'
              : 'Waiting for host to start streaming…'}
          </p>
        </div>
      )}

      {/* Screen-share audio warning banner */}
      {isScreenMode && screenShareWarning && (
        <div className="absolute top-14 inset-x-4 z-30 flex items-start gap-2 bg-amber-500/20 border border-amber-500/40 rounded-lg px-3 py-2 pointer-events-none">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300 leading-relaxed">{screenShareWarning}</p>
        </div>
      )}

      {/* Viewer Unmute / Tap-to-Watch Banner if muted */}
      {!isHost && streamReady && isMuted && (
        <div className="absolute top-16 z-30 pointer-events-auto">
          <button
            onClick={toggleMute}
            className="px-4 py-2 rounded-full bg-primary hover:bg-primary-hover text-white text-xs font-semibold shadow-xl shadow-primary/30 flex items-center gap-2 transition animate-bounce"
          >
            <VolumeX className="w-4 h-4" />
            <span>Click to Unmute Audio 🔊</span>
          </button>
        </div>
      )}

      {/* Hidden file input for host to pick/re-select local file if needed */}
      {isHost && onReattachFile && (
        <input
          ref={filePickerRef}
          type="file"
          accept="video/*,.mkv,.mp4,.webm,.mov"
          onChange={onReattachFile}
          className="hidden"
        />
      )}

      {/* Embedded / Relay Subtitle Overlay */}
      {subtitleCueText && (
        <div className="absolute bottom-20 inset-x-0 flex justify-center pointer-events-none px-6 z-20">
          <div className="bg-black/80 backdrop-blur-sm border border-white/10 px-4 py-1.5 rounded-lg text-white font-medium text-sm sm:text-base text-center shadow-2xl max-w-2xl leading-relaxed">
            {subtitleCueText}
          </div>
        </div>
      )}

      {/* Control Overlay */}
      <div
        className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 flex flex-col justify-between p-4 sm:p-6 transition-opacity duration-300 z-10 ${
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Top Info Bar */}
        <div className="flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            {isScreenMode ? (
              <div className="flex items-center gap-2">
                <Monitor className="w-4 h-4 text-indigo-400" />
                <h2 className="text-sm sm:text-base font-semibold truncate max-w-xs sm:max-w-md">
                  Screen Share
                </h2>
              </div>
            ) : (
              <>
                <h2 className="text-sm sm:text-base font-semibold truncate max-w-xs sm:max-w-md">
                  {movieMetadata?.name || 'Watch Party Stream'}
                </h2>
                {movieMetadata?.videoCodec && (
                  <span className="hidden sm:inline-block px-2 py-0.5 rounded bg-white/10 text-[10px] uppercase font-mono tracking-wider text-gray-300">
                    {movieMetadata.videoCodec}
                  </span>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!canControl && !isScreenMode && (
              <span className="flex items-center gap-1 text-xs text-indigo-300 bg-indigo-500/20 px-2.5 py-1 rounded-full border border-indigo-500/30">
                <Lock className="w-3 h-3" /> Host controls playback
              </span>
            )}
            <span className="text-xs text-gray-400 bg-black/40 px-2 py-1 rounded backdrop-blur">
              {isHost
                ? isScreenMode
                  ? 'Host Sharing 🖥'
                  : 'Host Streaming 👑'
                : isScreenMode
                ? 'Live Screen 🟢'
                : 'Synchronized Viewer 🟢'}
            </span>
          </div>
        </div>

        {/* Bottom Playback Controls */}
        <div className="space-y-2">
          {/* Progress / Seek bar — hidden in screen mode (live stream, no timeline) */}
          {!isScreenMode && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-300 font-mono w-10 text-right">{formatTime(currentTime)}</span>
              <div className="flex-1 relative flex items-center">
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  step={0.1}
                  value={currentTime}
                  disabled={!canControl}
                  onChange={handleSeekChange}
                  className={`w-full h-1.5 bg-gray-700/60 rounded-lg appearance-none cursor-pointer transition ${
                    canControl ? 'hover:h-2 accent-primary' : 'opacity-60 cursor-not-allowed'
                  }`}
                />
              </div>
              <span className="text-xs text-gray-400 font-mono w-10">{formatTime(duration)}</span>
            </div>
          )}

          {/* Action Buttons Row */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-4">
              {/* Play / Pause — hidden in screen mode (controlled by native share UI) */}
              {!isScreenMode && (
                <button
                  onClick={togglePlayPause}
                  disabled={!canControl}
                  className="w-9 h-9 rounded-full bg-white text-black hover:bg-gray-200 flex items-center justify-center transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPlaying ? <Pause className="w-4 h-4 fill-black" /> : <Play className="w-4 h-4 fill-black ml-0.5" />}
                </button>
              )}

              {/* Skip back / forward — hidden in screen mode */}
              {!isScreenMode && canControl && (
                <button
                  onClick={() => onSeek(Math.max(0, currentTime - 10))}
                  className="text-gray-300 hover:text-white transition p-1.5"
                  title="Rewind 10s"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}

              {!isScreenMode && canControl && (
                <button
                  onClick={() => onSeek(Math.min(duration, currentTime + 10))}
                  className="text-gray-300 hover:text-white transition p-1.5"
                  title="Forward 10s"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
              )}

              {/* Volume — shown in all modes */}
              <div className="flex items-center gap-2 group/volume">
                <button onClick={toggleMute} className="text-gray-300 hover:text-white transition p-1.5">
                  {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-16 sm:w-20 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-white"
                />
              </div>
            </div>

            {/* Right-side Utilities */}
            <div className="flex items-center gap-3">
              {/* Host Select/Reattach File Button — movie mode only */}
              {!isScreenMode && isHost && onReattachFile && (
                <button
                  onClick={() => filePickerRef.current?.click()}
                  className="px-2.5 py-1 text-xs rounded bg-surface border border-surface-border text-gray-300 hover:text-white transition"
                  title="Choose / Change Local Movie"
                >
                  Select File
                </button>
              )}

              {/* Audio & Subtitles dropdown — movie mode only */}
              {!isScreenMode && (
                <div className="relative">
                  <button
                    onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                    className={`p-2 rounded-lg transition ${
                      showSettingsMenu ? 'bg-white/20 text-white' : 'text-gray-300 hover:text-white'
                    }`}
                    title="Audio & Subtitle Settings"
                  >
                    <Subtitles className="w-4 h-4" />
                  </button>

                  {showSettingsMenu && (
                    <div className="absolute bottom-10 right-0 w-64 bg-surface border border-surface-border rounded-xl p-3 shadow-2xl space-y-3 z-30">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Tracks & Audio</h4>

                      {/* Subtitle list */}
                      <div>
                        <span className="text-xs text-gray-300 block mb-1">Subtitles:</span>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          <button
                            onClick={() => {
                              onSelectSubtitle?.('off');
                              setShowSettingsMenu(false);
                            }}
                            className={`w-full text-left text-xs px-2.5 py-1.5 rounded-lg transition ${
                              !selectedSubtitle || selectedSubtitle === 'off'
                                ? 'bg-primary text-white font-semibold'
                                : 'text-gray-400 hover:bg-surface-light'
                            }`}
                          >
                            Off
                          </button>
                          {movieMetadata?.subtitles?.map((sub) => (
                            <button
                              key={sub.id}
                              onClick={() => {
                                onSelectSubtitle?.(sub.id);
                                setShowSettingsMenu(false);
                              }}
                              className={`w-full text-left text-xs px-2.5 py-1.5 rounded-lg transition ${
                                selectedSubtitle === sub.id
                                  ? 'bg-primary text-white font-semibold'
                                  : 'text-gray-400 hover:bg-surface-light'
                              }`}
                            >
                              {sub.label || `Track (${sub.language})`}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Fullscreen Toggle — shown in all modes */}
              <button onClick={toggleFullscreen} className="text-gray-300 hover:text-white transition p-2">
                {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
