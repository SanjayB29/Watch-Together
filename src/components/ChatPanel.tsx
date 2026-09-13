'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Users, MessageSquare, Shield, Smile } from 'lucide-react';
import { ChatMessage, Participant } from '@/types';

interface ChatPanelProps {
  messages: ChatMessage[];
  participants: Record<string, Participant>;
  selfId: string;
  onSendMessage: (text: string) => void;
  isOpen?: boolean;
}

export function ChatPanel({ messages, participants, selfId, onSendMessage }: ChatPanelProps) {
  const [inputText, setInputText] = useState('');
  const [activeTab, setActiveTab] = useState<'chat' | 'participants'>('chat');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  const participantList = Object.values(participants);

  return (
    <div className="flex flex-col h-full glass-panel border-l border-white/10">
      {/* Header Tabs */}
      <div className="flex items-center border-b border-white/10 p-2 gap-1.5 bg-black/30 backdrop-blur-md">
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition ${
            activeTab === 'chat'
              ? 'bg-white/15 text-white shadow-md border border-white/15'
              : 'text-slate-300 hover:text-white hover:bg-white/5'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Chat</span>
          {messages.length > 0 && (
            <span className="px-1.5 py-0.2 bg-indigo-500/30 text-indigo-300 text-[10px] font-bold rounded-full border border-indigo-400/30">
              {messages.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('participants')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition ${
            activeTab === 'participants'
              ? 'bg-white/15 text-white shadow-md border border-white/15'
              : 'text-slate-300 hover:text-white hover:bg-white/5'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>People ({participantList.length})</span>
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {activeTab === 'chat' ? (
          messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 text-xs font-medium">
              <MessageSquare className="w-8 h-8 mb-2 opacity-40 text-indigo-400" />
              <p className="text-slate-300">No messages yet.</p>
              <p className="text-slate-400">Say hello to the watch party!</p>
            </div>
          ) : (
            messages.map((m) => {
              const isSelf = m.senderId === selfId;
              const formattedTime = new Date(m.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div key={m.id} className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-center gap-1.5 mb-1 text-[11px] text-slate-300 font-medium">
                    <span className="font-bold text-white">
                      {m.senderName} {isSelf && '(You)'}
                    </span>
                    {m.isHost && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-200 font-bold border border-amber-400/30">
                        HOST
                      </span>
                    )}
                    <span className="text-slate-400">• {formattedTime}</span>
                  </div>
                  <div
                    className={`px-3.5 py-2.5 rounded-2xl text-xs max-w-[85%] break-words leading-relaxed font-normal shadow-md ${
                      isSelf
                        ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-br-xs border border-white/20'
                        : 'bg-black/50 border border-white/15 text-slate-100 rounded-bl-xs backdrop-blur-md'
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              );
            })
          )
        ) : (
          <div className="space-y-2">
            {participantList.map((p) => {
              const isSelf = p.id === selfId;
              return (
                <div
                  key={p.id}
                  className="p-3 rounded-2xl bg-black/30 border border-white/10 flex items-center justify-between backdrop-blur-md"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
                    <div>
                      <p className="text-xs font-bold text-white">
                        {p.displayName} {isSelf && <span className="text-slate-400 font-normal">(You)</span>}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        Joined {new Date(p.joinedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>

                  {p.role === 'host' ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/30 text-amber-200">
                      HOST 👑
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-300 font-medium">Viewer</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input Footer */}
      {activeTab === 'chat' && (
        <form onSubmit={handleSubmit} className="p-3 border-t border-white/10 bg-black/40 flex items-center gap-2 backdrop-blur-md">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type a message..."
            maxLength={400}
            className="flex-1 px-3.5 py-2.5 rounded-xl glass-input text-xs placeholder-slate-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition shadow-md shadow-indigo-600/30 ring-1 ring-white/20"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      )}
    </div>
  );
}
