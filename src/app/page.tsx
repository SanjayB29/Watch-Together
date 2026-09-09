'use client';

import React from 'react';
import Link from 'next/link';
import { Film, Shield, Users, Sparkles, PlusCircle, ArrowRight, Video } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col bg-background bg-hero-glow relative overflow-hidden">
      {/* Top Navigation */}
      <nav className="w-full max-w-7xl mx-auto px-6 h-20 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary to-primary-purple flex items-center justify-center shadow-lg shadow-primary/20">
            <Film className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-wider text-white">CINELINK</span>
        </div>
        <div className="flex items-center gap-6 text-sm text-gray-400">
          <Link href="/faq" className="hover:text-white transition">
            FAQ
          </Link>
          <Link
            href="/join"
            className="px-4 py-2 rounded-lg bg-surface border border-surface-border text-white hover:border-primary/50 transition font-medium text-xs"
          >
            Enter Code
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="flex-1 flex flex-col items-center justify-center text-center px-4 max-w-4xl mx-auto my-12 z-10">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface/80 border border-surface-border text-xs text-indigo-300 mb-8 backdrop-blur-sm shadow-inner">
          <Sparkles className="w-3.5 h-3.5 text-primary-purple" />
          <span>Browser-first peer-to-peer watch parties</span>
        </div>

        <h1 className="text-5xl sm:text-7xl font-extrabold tracking-tight text-white mb-6 leading-tight">
          Movies are better <br />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-300 to-indigo-200">
            together.
          </span>
        </h1>

        <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mb-10 leading-relaxed">
          Host a movie directly from your device and stream it synchronously to friends in real time. No cloud uploads, no account registration.
        </p>

        {/* Primary Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full justify-center max-w-md mb-12">
          <Link
            href="/create"
            className="w-full sm:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-primary to-primary-purple hover:from-primary-hover hover:to-primary text-white font-semibold flex items-center justify-center gap-3 shadow-xl shadow-primary/25 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
          >
            <PlusCircle className="w-5 h-5" />
            <span>Create a Room</span>
          </Link>

          <Link
            href="/join"
            className="w-full sm:w-auto px-8 py-4 rounded-xl bg-surface/90 hover:bg-surface-light border border-surface-border hover:border-gray-600 text-gray-200 font-semibold flex items-center justify-center gap-3 transition-all duration-200"
          >
            <span>Join a Room</span>
            <ArrowRight className="w-4 h-4 text-gray-400" />
          </Link>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-500 mb-16">
          <Shield className="w-3.5 h-3.5 text-indigo-400" />
          <span>No account needed • Direct P2P stream • Your media stays on your device</span>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full text-left">
          <div className="p-6 rounded-2xl bg-surface/60 border border-surface-border/60 backdrop-blur-md">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-primary mb-4">
              <Video className="w-5 h-5" />
            </div>
            <h3 className="text-white font-semibold mb-2 text-base">MKV & Multi-Codec</h3>
            <p className="text-sm text-gray-400">
              Full container inspection for MKV, MP4 and WebM. Plays compatible H.264/AAC tracks directly in the browser.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-surface/60 border border-surface-border/60 backdrop-blur-md">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-primary-purple mb-4">
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className="text-white font-semibold mb-2 text-base">Real-Time Sync Engine</h3>
            <p className="text-sm text-gray-400">
              Authoritative host timeline with intelligent drift correction keeps all viewers synchronized within milliseconds.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-surface/60 border border-surface-border/60 backdrop-blur-md">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4">
              <Users className="w-5 h-5" />
            </div>
            <h3 className="text-white font-semibold mb-2 text-base">Private 2–5 Rooms</h3>
            <p className="text-sm text-gray-400">
              Optimized peer-to-peer mesh designed specifically for small group cinema parties with low latency and live chat.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full border-t border-surface-border/40 py-6 text-center text-xs text-gray-500 z-10">
        <p>CineLink • Peer-to-peer private synchronized cinema player</p>
      </footer>
    </main>
  );
}
