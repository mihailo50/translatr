import React, { useRef, useEffect } from 'react';
import MessageBubble from './MessageBubble';
import { ChatMessage } from '../../hooks/useLiveKitChat';

interface MessageListProps {
  messages: ChatMessage[];
  userPreferredLanguage: string;
  isTranslationEnabled: boolean;
}

const MessageList: React.FC<MessageListProps> = ({ messages, userPreferredLanguage, isTranslationEnabled }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto px-4 pt-28 pb-28 scrollbar-thin">
        <div className="space-y-6 max-w-4xl mx-auto">
            {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center text-center py-16 min-h-[50vh]">
                    <p className="text-white/60 text-lg md:text-xl font-normal tracking-tight">
                        No messages here yet.
                    </p>
                </div>
            )}

            {messages.map((msg) => (
               <MessageBubble 
                  key={msg.id}
                  message={{
                      ...msg,
                      translations: msg.translations,
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