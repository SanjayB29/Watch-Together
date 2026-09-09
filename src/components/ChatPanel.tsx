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
    <div className="flex flex-col h-full bg-cinema-card border-l border-cinema-border">
      {/* Header Tabs */}
      <div className="flex items-center border-b border-cinema-border p-2 gap-1 bg-surface/30">
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition ${
            activeTab === 'chat'
              ? 'bg-surface-light text-white shadow-sm'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Chat</span>
          {messages.length > 0 && (
            <span className="px-1.5 py-0.2 bg-primary/20 text-primary-purple text-[10px] rounded-full">
              {messages.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('participants')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition ${
            activeTab === 'participants'
              ? 'bg-surface-light text-white shadow-sm'
              : 'text-gray-400 hover:text-gray-200'
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
            <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 text-xs">
              <MessageSquare className="w-8 h-8 mb-2 opacity-30" />
              <p>No messages yet.</p>
              <p>Say hello to the watch party!</p>
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
                  <div className="flex items-center gap-1.5 mb-1 text-[11px] text-gray-400">
                    <span className="font-semibold text-gray-300">
                      {m.senderName} {isSelf && '(You)'}
                    </span>
                    {m.isHost && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 font-medium">
                        HOST
                      </span>
                    )}
                    <span className="text-gray-600">• {formattedTime}</span>
                  </div>
                  <div
                    className={`px-3 py-2 rounded-2xl text-xs max-w-[85%] break-words leading-relaxed ${
                      isSelf
                        ? 'bg-primary text-white rounded-br-xs'
                        : 'bg-surface border border-surface-border text-gray-200 rounded-bl-xs'
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
                  className="p-3 rounded-xl bg-surface/50 border border-surface-border/60 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-2 h-2 rounded-full bg-emerald-400" />
                    <div>
                      <p className="text-xs font-semibold text-white">
                        {p.displayName} {isSelf && <span className="text-gray-400 font-normal">(You)</span>}
                      </p>
                      <p className="text-[10px] text-gray-500">
                        Joined {new Date(p.joinedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>

                  {p.role === 'host' ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300">
                      HOST 👑
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-400">Viewer</span>
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
        <form onSubmit={handleSubmit} className="p-3 border-t border-cinema-border bg-surface/40 flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type a message..."
            maxLength={400}
            className="flex-1 px-3 py-2 rounded-lg bg-surface border border-surface-border text-xs text-white placeholder-gray-500 focus:outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="p-2 rounded-lg bg-primary hover:bg-primary-hover text-white disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      )}
    </div>
  );
}
