'use client';

import { useRef, useEffect, useState } from 'react';
import { useMessengerStore } from '@/store/messengerStore';
import { format } from 'date-fns';
import clsx from 'clsx';

interface Props {
  address: string;
}

export function ChatWindow({ address }: Props) {
  const [input, setInput] = useState('');
  const [sending, setSending]  = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const conversation = useMessengerStore((s) => s.conversations[address]);
  const myAddress    = useMessengerStore((s) => s.myAddress);
  const sendMessage  = useMessengerStore((s) => s.sendMessage);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      await sendMessage(conversation?.nickname ?? address, input.trim());
      setInput('');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-800 bg-gray-900">
        <p className="font-semibold text-white">{conversation?.nickname ?? address}</p>
        <p className="text-xs text-gray-500 font-mono truncate">{address}</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {!conversation?.messages.length && (
          <p className="text-center text-gray-600 text-sm mt-8">
            No messages yet — say hello 👋
          </p>
        )}
        {conversation?.messages.map((msg) => {
          const isMine = msg.from === myAddress;
          return (
            <div
              key={msg.id}
              className={clsx('flex', isMine ? 'justify-end' : 'justify-start')}
            >
              <div
                className={clsx(
                  'max-w-sm px-4 py-2.5 rounded-2xl text-sm',
                  isMine
                    ? 'bg-indigo-600 text-white rounded-br-sm'
                    : 'bg-gray-800 text-gray-100 rounded-bl-sm'
                )}
              >
                <p>{msg.plaintext}</p>
                <div className={clsx('flex items-center gap-1 mt-1',
                  isMine ? 'justify-end' : 'justify-start')}>
                  <span className="text-xs opacity-60">
                    {format(msg.timestamp, 'HH:mm')}
                  </span>
                  {isMine && (
                    <span className="text-xs opacity-60">
                      {msg.delivered ? '✓✓' : '✓'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="px-4 py-4 border-t border-gray-800 bg-gray-900">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message (end-to-end encrypted)"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5
                       text-gray-100 placeholder-gray-500 text-sm focus:outline-none
                       focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40
                       text-white px-4 py-2.5 rounded-xl transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-gray-600 mt-1.5 text-center">
          🔒 Messages are encrypted before leaving your device
        </p>
      </form>
    </div>
  );
}
