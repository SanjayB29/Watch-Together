'use client';

import React from 'react';
import Link from 'next/link';
import { Film, Shield, Sparkles, PlusCircle, ArrowRight } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col relative overflow-hidden">
      {/* Top Navigation */}
      <nav className="w-full max-w-7xl mx-auto px-6 h-20 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 ring-1 ring-white/20">
            <Film className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-extrabold tracking-wider text-white drop-shadow-md">CINELINK</span>
        </div>
        <div className="flex items-center gap-6 text-sm text-slate-200">
          <Link href="/faq" className="hover:text-white transition font-medium drop-shadow-sm">
            FAQ
          </Link>
          <Link
            href="/join"
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white transition font-semibold text-xs backdrop-blur-md shadow-lg"
          >
            Enter Code
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="flex-1 flex flex-col items-center justify-center text-center px-4 max-w-4xl mx-auto my-12 z-10">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/40 border border-white/15 text-xs font-semibold text-indigo-300 mb-8 backdrop-blur-xl shadow-lg">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span>Browser-first peer-to-peer watch parties</span>
        </div>

        <h1 className="text-5xl sm:text-7xl font-black tracking-tight text-white mb-6 leading-tight drop-shadow-2xl">
          Movies are better <br />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 via-purple-200 to-amber-200 drop-shadow">
            together.
          </span>
        </h1>

        <p className="text-lg sm:text-xl text-slate-200 max-w-2xl mb-10 leading-relaxed font-normal drop-shadow-md">
          Host a movie directly from your device and stream it synchronously to friends in real time. No cloud uploads, no account registration.
        </p>

        {/* Primary Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full justify-center max-w-md mb-12">
          <Link
            href="/create"
            className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold flex items-center justify-center gap-3 shadow-xl shadow-indigo-600/35 ring-1 ring-white/20 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 backdrop-blur-sm"
          >
            <PlusCircle className="w-5 h-5" />
            <span>Create a Room</span>
          </Link>

          <Link
            href="/join"
            className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-black/40 hover:bg-black/60 border border-white/20 hover:border-white/40 text-white font-bold flex items-center justify-center gap-3 backdrop-blur-xl shadow-xl transition-all duration-200"
          >
            <span>Join a Room</span>
            <ArrowRight className="w-4 h-4 text-slate-300" />
          </Link>
        </div>

        <div className="flex items-center gap-2 text-xs font-medium text-slate-300 mb-8 bg-black/30 border border-white/10 px-4 py-2 rounded-full backdrop-blur-md">
          <Shield className="w-3.5 h-3.5 text-indigo-400" />
          <span>No account needed • Direct P2P stream • Your media stays on your device</span>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full border-t border-white/10 py-6 text-center text-xs text-slate-400 backdrop-blur-md bg-black/20 z-10">
        <p>CineLink • Peer-to-peer private synchronized cinema player</p>
      </footer>
    </main>
  );
}
