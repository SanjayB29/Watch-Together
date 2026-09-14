import React from 'react';
import Link from 'next/link';
import { ArrowLeft, HelpCircle } from 'lucide-react';

export default function FAQPage() {
  const faqs = [
    {
      q: 'How does CineLink stream movies without uploading them to a server?',
      a: 'CineLink uses WebRTC peer-to-peer technology. The movie file stays locally on the host device and is streamed directly to viewers with end-to-end encryption. The cloud servers only handle room codes, chat, and playback synchronization.',
    },
    {
      q: 'What video formats are supported?',
      a: 'CineLink inspects containers and codecs directly in the browser. Common video containers like MKV, MP4, and WebM encoded with H.264/AVC, VP8, VP9, or AV1 and AAC or Opus audio play smoothly.',
    },
    {
      q: 'How many people can join a watch party?',
      a: 'CineLink is optimized for intimate groups of 2 to 5 participants for optimal peer-to-peer streaming bandwidth.',
    },
    {
      q: 'Do guests need to install software or make an account?',
      a: 'No. Guests simply click the room link or enter the 6-character room code on any modern web browser (Chrome, Firefox, Safari, Edge) without registration.',
    },
  ];

  return (
    <main className="min-h-screen py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-200 hover:text-white transition font-medium drop-shadow-sm mb-8">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </Link>

        <h1 className="text-3xl font-extrabold text-white mb-8 flex items-center gap-3 drop-shadow-md">
          <HelpCircle className="w-8 h-8 text-indigo-400" />
          Frequently Asked Questions
        </h1>

        <div className="space-y-4">
          {faqs.map((faq, i) => (
            <div key={i} className="p-6 rounded-3xl glass-panel">
              <h3 className="text-base font-bold text-white mb-2">{faq.q}</h3>
              <p className="text-sm text-slate-300 leading-relaxed font-normal">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
