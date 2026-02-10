import React, { useRef, useEffect, useState, useMemo } from "react";
import { Lock } from "lucide-react";
import MessageBubble from "./MessageBubble";
import CallRecordBubble from "./CallRecordBubble";
import { ChatMessage } from "../../hooks/useLiveKitChat";

interface CallRecord {
  id: string;
  caller_id: string;
  receiver_id: string | null;
  call_type: "audio" | "video";
  status: "initiated" | "accepted" | "declined" | "missed" | "ended";
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  created_at: string;
  caller?: {
    display_name?: string | null;
    email?: string | null;
  } | null;
  receiver?: {
    display_name?: string | null;
    email?: string | null;
  } | null;
}

interface MessageListProps {
  messages: ChatMessage[];
  callRecords?: CallRecord[];
  currentUserId?: string;
  userPreferredLanguage: string;
  isTranslationEnabled: boolean;
  isNotificationsOpen?: boolean;
  isGroup?: boolean; // Whether this is a group chat
  roomName?: string; // Room name for group calls
  roomParticipants?: Array<{ id: string; name: string }>; // Other participants for group calls
}

const MessageList: React.FC<MessageListProps> = ({
  messages,
  callRecords = [],
  currentUserId = "",
  userPreferredLanguage,
  isTranslationEnabled,
  isNotificationsOpen = false,
  isGroup = false,
  roomName,
  roomParticipants = [],
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Use lazy initializer to avoid setState in useEffect (prevents cascading renders)
  const isMounted = useState(() => {
    if (typeof window !== "undefined") {
      return true;
    }
    return false;
  })[0]; // Only use the value, not the setter

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Merge messages and call records, sort chronologically
  const mergedItems = useMemo(() => {
    const items: Array<{
      type: "message" | "call";
      data: ChatMessage | CallRecord;
      timestamp: number;
    }> = [];

    // Add messages
    messages.forEach((msg) => {
      items.push({
        type: "message",
        data: msg,
        timestamp: msg.timestamp,
      });
    });

    // Add call records
    callRecords.forEach((record) => {
      items.push({
        type: "call",
        data: record,
        timestamp: new Date(record.created_at).getTime(),
      });
    });

    // Sort by timestamp
    return items.sort((a, b) => a.timestamp - b.timestamp);
  }, [messages, callRecords]);

  useEffect(() => {
    scrollToBottom();
  }, [mergedItems]);

  return (
    <div
      className={`flex-1 overflow-y-auto px-4 pt-6 pb-24 scrollbar-none relative transition-all duration-300 ${
        isNotificationsOpen ? "sm:scale-[0.98] sm:blur-[2px]" : "scale-100 blur-0"
      }`}
    >
      {/* NO MORE SPACERS NEEDED: Sticky header handles the offset */}

      <div className="space-y-6 max-w-4xl mx-auto">
        {/* System Message: End-to-End Encryption Banner - Only render after mount to avoid hydration mismatch */}
        {isMounted && (
          <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-lg p-3 max-w-sm mx-auto mb-8 flex items-center gap-2 text-center">
            <Lock size={14} className="text-indigo-400 shrink-0" />
            <p className="text-xs text-white/70 leading-relaxed">
              Messages and calls are end-to-end encrypted. AETHER cannot read or listen to them.
            </p>
          </div>
        )}

        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center py-16 min-h-[50vh]">
            <p className="text-white/40 text-lg font-medium tracking-tight">No messages yet.</p>
          </div>
        )}

        {mergedItems.map((item) => {
          if (item.type === "call") {
            return (
              <CallRecordBubble
                key={`call-${item.data.id}`}
                record={item.data as CallRecord}
                currentUserId={currentUserId}
                isGroup={isGroup}
                roomName={roomName}
                roomParticipants={roomParticipants}
              />
            );
          } else {
            const msg = item.data as ChatMessage;

            // Check if this is a system message
            const msgWithType = msg as ChatMessage & { type?: string };
            const isSystemMessage =
              msg.senderId === "system" ||
              (msgWithType.type && msgWithType.type !== "CHAT_MESSAGE") ||
              (msg.text &&
                (msg.text.toLowerCase().includes("created the group") ||
                  msg.text.toLowerCase().includes("joined the group") ||
                  msg.text.toLowerCase().includes("left the group")));

            if (isSystemMessage) {
              // Render as centered glass pill
              return (
                <div
                  key={msg.id}
                  className="mx-auto my-4 px-3 py-1 rounded-full bg-white/5 border border-white/5 backdrop-blur-md w-fit"
                >
                  <span className="text-[10px] text-white/50 font-medium tracking-wide uppercase">
                    {msg.text}
                  </span>
                </div>
              );
            }

            return (
              <MessageBubble
                key={msg.id}
                message={{
                  ...msg,
                  original_language: msg.lang,
                }}
                userPreferredLanguage={userPreferredLanguage}
                isTranslationEnabled={isTranslationEnabled}
                isGroup={isGroup}
              />
            );
          }
        })}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

export default MessageList;
