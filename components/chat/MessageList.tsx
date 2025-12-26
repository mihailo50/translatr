import React, { useRef, useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import MessageBubble from './MessageBubble';
import { ChatMessage } from '../../hooks/useLiveKitChat';

interface MessageListProps {
  messages: ChatMessage[];
  userPreferredLanguage: string;
  isTranslationEnabled: boolean;
  isNotificationsOpen?: boolean;
}

const MessageList: React.FC<MessageListProps> = ({ messages, userPreferredLanguage, isTranslationEnabled, isNotificationsOpen = false }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div 
      className={`flex-1 overflow-y-auto px-4 pt-6 pb-24 scrollbar-none relative transition-all duration-300 ${
        isNotificationsOpen ? 'scale-[0.98] blur-[2px]' : 'scale-100 blur-0'
      }`}
    >
        {/* NO MORE SPACERS NEEDED: Sticky header handles the offset */}
        
        <div className="space-y-6 max-w-4xl mx-auto">
            {/* System Message: End-to-End Encryption Banner - Only render after mount to avoid hydration mismatch */}
            {isMounted && (
                <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-lg p-3 max-w-sm mx-auto mb-8 flex items-center gap-2 text-center">
                    <Lock size={14} className="text-indigo-400 shrink-0" />
                    <p className="text-xs text-white/70 leading-relaxed">
                        Messages and calls are end-to-end encrypted. Translatr cannot read or listen to them.
                    </p>
                </div>
            )}

            {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center text-center py-16 min-h-[50vh]">
                    <p className="text-white/40 text-lg font-medium tracking-tight">
                        No messages yet.
                    </p>
                </div>
            )}

            {messages.map((msg) => (
               <MessageBubble 
                  key={msg.id}
                  message={{
                      ...msg,
                      original_language: msg.lang
                  }}
                  userPreferredLanguage={userPreferredLanguage}
                  isTranslationEnabled={isTranslationEnabled}
               />
            ))}
            <div ref={messagesEndRef} />
        </div>
    </div>
  );
};

export default MessageList;