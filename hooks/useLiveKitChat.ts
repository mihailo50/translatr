import { useEffect, useState, useRef, useCallback } from "react";
import {
  Room,
  RoomEvent,
  RemoteParticipant,
  LocalParticipant,
  DisconnectReason,
} from "livekit-client";
import { createClient } from "../utils/supabase/client";
import { deriveKey, encryptData, decryptData } from "../utils/encryption";

export interface ChatMessage {
  id: string;
  type: "CHAT_MESSAGE";
  text: string;
  lang: string;
  translations?: Record<string, string>;
  senderId: string;
  senderName: string;
  senderAvatar?: string; // Optional avatar URL for group chats
  timestamp: number;
  isMe: boolean;
  isEncrypted?: boolean;
  iv?: string; // Initialization Vector for encryption
  attachment?: {
    url: string;
    type: "image" | "file" | "voice";
    name?: string;
    viewOnce?: boolean;
  };
}

interface MessageRow {
  id: string;
  original_text: string;
  metadata?: {
    encrypted?: boolean;
    iv?: string;
    attachment_meta?: {
      url: string;
      type: "image" | "file" | "voice";
      name?: string;
      viewOnce?: boolean;
    };
  };
  sender_id: string;
  created_at: string;
  sender?: {
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
  original_language?: string | null;
  translations?: Record<string, string> | null;
}

export const useLiveKitChat = (roomId: string, userId: string, userName: string) => {
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);

  const roomRef = useRef<Room | null>(null);
  const messagesLoadedRef = useRef(false);
  const connectingRef = useRef(false);
  const supabase = createClient();

  // Initialize Encryption Key (once per room)
  useEffect(() => {
    const initKey = async () => {
      if (!roomId) return;
      const key = await deriveKey(roomId);
      setEncryptionKey(key);
    };
    initKey();
  }, [roomId]);

  useEffect(() => {
    let mounted = true;
    let connectTimeout: NodeJS.Timeout | null = null;

    const connectToRoom = async () => {
      // Avoid reconnecting if a room already exists or connection is in progress
      if (roomRef.current || connectingRef.current) {
        return;
      }

      connectingRef.current = true;

      try {
        let response: Response;
        try {
          response = await fetch("/api/livekit/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ room_id: roomId, user_id: userId, username: userName }),
          });
        } catch (fetchError: unknown) {
          // Handle network errors (TypeError: Failed to fetch)
          if (fetchError instanceof TypeError && fetchError.message === "Failed to fetch") {
            // Network error - silently handle and don't connect
            connectingRef.current = false;
            return;
          }
          // Re-throw other errors
          throw fetchError;
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage = errorData.error || "Failed to fetch token";
          throw new Error(errorMessage);
        }

        const responseText = await response.text();

        let responseData;
        try {
          responseData = JSON.parse(responseText);
        } catch (_e) {
          throw new Error("Invalid JSON response from token API");
        }

        // Extract token and ensure it's a string
        let token = responseData.token;

        // If token is an object, try to extract the string value
        if (typeof token === "object" && token !== null) {
          // Try common object properties that might contain the token
          if ("token" in token && typeof token.token === "string") {
            token = token.token;
          } else if ("value" in token && typeof token.value === "string") {
            token = token.value;
          } else if ("access_token" in token && typeof token.access_token === "string") {
            token = token.access_token;
          } else {
            // Last resort: try to stringify and parse
            throw new Error("Token is an object and could not be converted to string");
          }
        }

        // Final validation - ensure it's a string
        if (typeof token !== "string") {
          throw new Error("Token must be a string");
        }

        // Validate token is a string
        if (!token || typeof token !== "string") {
          throw new Error("Invalid token format received from server");
        }

        if (!mounted) return;

        const newRoom = new Room({
          adaptiveStream: true,
          dynacast: true,
          publishDefaults: {
            simulcast: true,
            dtx: true, // Discontinuous Transmission for audio efficiency
            red: true, // Redundant encoding for audio packet loss protection
          },
        });

        roomRef.current = newRoom;
        setRoom(newRoom);

        newRoom.on(RoomEvent.Connected, () => {
          if (mounted) setIsConnected(true);
        });

        newRoom.on(RoomEvent.Disconnected, (_reason?: DisconnectReason) => {
          if (mounted) setIsConnected(false);
        });

        newRoom.on(RoomEvent.ConnectionQualityChanged, (_quality) => {
          // Connection quality changed
        });

        newRoom.on(RoomEvent.Reconnecting, () => {
          // LiveKit reconnecting
        });

        newRoom.on(RoomEvent.Reconnected, () => {
          // LiveKit reconnected
        });

        // Suppress non-critical DataChannel errors and empty notification cleanup errors
        // Note: Console error filtering removed - all errors are silently handled

        newRoom.on(
          RoomEvent.DataReceived,
          async (payload: Uint8Array, participant?: RemoteParticipant | LocalParticipant) => {
            const decoder = new TextDecoder();
            const strData = decoder.decode(payload);

            try {
              const data = JSON.parse(strData);

              if (data.type === "CHAT_MESSAGE") {
                const language = data.lang || data.original_language || "en";
                const senderId = data.senderId || participant?.identity || "unknown";
                const senderName =
                  data.senderName || participant?.name || participant?.identity || "Unknown";

                let contentText = data.text;

                // Decrypt if necessary
                if (data.isEncrypted && data.iv) {
                  // We need the key to be ready
                  const keyToUse = encryptionKey || (await deriveKey(roomId));
                  if (keyToUse) {
                    contentText = await decryptData(data.text, data.iv, keyToUse);
                  } else {
                    // Encryption not available - message might be plaintext or we can't decrypt
                    // Try to use the text as-is (might be plaintext if encryption was disabled)
                    contentText = data.text;
                  }
                }

                const newMessage: ChatMessage = {
                  id: data.id || crypto.randomUUID(),
                  type: "CHAT_MESSAGE",
                  text: contentText,
                  lang: language,
                  translations: data.translations,
                  senderId: senderId,
                  senderName: senderName,
                  timestamp: data.timestamp || Date.now(),
                  isMe: senderId === userId,
                  isEncrypted: data.isEncrypted,
                  attachment: data.attachment,
                };

                setMessages((prev) => {
                  if (prev.some((m) => m.id === newMessage.id)) return prev;
                  return [...prev, newMessage];
                });
              }
            } catch (_e) {
              // Failed to parse incoming data message - silently ignore
            }
          }
        );

        const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;
        if (!wsUrl) throw new Error("NEXT_PUBLIC_LIVEKIT_URL is not defined");

        // Ensure token is a string before connecting
        if (typeof token !== "string") {
          throw new Error("Token must be a string");
        }

        // Validate token format (JWT tokens are base64 encoded strings with dots)
        if (!token.includes(".")) {
          throw new Error("Invalid JWT token format");
        }

        // Connecting to LiveKit with timeout and retry logic

        try {
          // Add connection timeout (30 seconds)
          const connectPromise = newRoom.connect(wsUrl, token);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Connection timeout after 30 seconds")), 30000)
          );

          await Promise.race([connectPromise, timeoutPromise]);
          // LiveKit connected
          connectingRef.current = false;
        } catch (connectError: unknown) {
          // Error during room.connect() - silently handle

          // Clean up the room if connection failed
          if (roomRef.current) {
            try {
              roomRef.current.disconnect();
            } catch (_disconnectError) {
              // Error cleaning up after failed connection - silently ignore
            }
            roomRef.current = null;
            setRoom(null);
          }

          connectingRef.current = false;

          // Provide user-friendly error message
          const errorMsg =
            (connectError && typeof connectError === "object" && "message" in connectError
              ? String(connectError.message)
              : null) || "Unknown connection error";
          if (errorMsg.includes("signal connection") || errorMsg.includes("Abort handler")) {
            // Signal connection failed - silently handle
          }

          throw connectError;
        }
      } catch (_err) {
        connectingRef.current = false;

        // Handle network errors gracefully (don't log as errors)
        if (_err instanceof TypeError && _err.message === "Failed to fetch") {
          // Network error - silently handle, don't set error state
          return;
        }

        const errorMessage = _err instanceof Error ? _err.message : "Unknown error";

        if (mounted) {
          // Only set error state for non-network errors
          if (errorMessage !== "Failed to fetch") {
            setError(errorMessage);
          }
        }
      }
    };

    if (roomId && userName && !roomRef.current) {
      // Delay connection until after UI paints for better perceived performance
      // Use requestIdleCallback if available, otherwise setTimeout
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        requestIdleCallback(() => {
          connectToRoom();
        }, { timeout: 100 });
      } else {
        // Fallback: delay by one frame (16ms) to allow UI to paint
        connectTimeout = setTimeout(() => {
          connectToRoom();
        }, 16);
      }
    }

    return () => {
      // Cleaning up LiveKit connection
      if (connectTimeout) {
        clearTimeout(connectTimeout);
      }
      mounted = false;
      connectingRef.current = false;

      if (roomRef.current) {
        try {
          // Remove all event listeners before disconnecting
          roomRef.current.removeAllListeners();
          roomRef.current.disconnect();
          // Room disconnected
        } catch (_cleanupError) {
          // Error during cleanup disconnect - silently ignore
        }
        roomRef.current = null;
      }
      setRoom(null);
      setIsConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, userName, userId]); // omit encryptionKey to prevent reconnect/disconnect loop

  // Load persisted messages from Supabase once the encryption key is available
  useEffect(() => {
    const loadHistory = async () => {
      if (!roomId || !userId || !encryptionKey) {
        // Skipping message load
        return;
      }

      // Loading message history

      // Prevent multiple loads for the same room
      if (messagesLoadedRef.current) {
        // Messages already loaded
        return;
      }

      // Skip client-side membership check - server action handles it more efficiently
      // Always use server action for reliability (bypasses RLS issues)
      // This is more reliable than direct client queries which can hit RLS recursion
      try {
        const { getMessages } = await import("../actions/chat");
        const result = await getMessages(roomId);

        // Store call records if available (will be passed to MessageList)
        if (result.success && result.callRecords) {
          // Call records are stored separately and will be merged in MessageList
          // We don't need to do anything here, just log
          // Call records loaded
        }

        if (result.success && result.messages) {
          // Processing messages

          // Process messages in parallel batches for faster decryption
          const BATCH_SIZE = 20; // Process 20 messages at a time
          const history: ChatMessage[] = [];

          for (let i = 0; i < result.messages.length; i += BATCH_SIZE) {
            const batch = result.messages.slice(i, i + BATCH_SIZE);

            // Process batch in parallel
            const batchPromises = batch.map(async (row) => {
              // Handle array case for sender (Supabase foreign key relations)
              const senderRaw = (row as { sender?: unknown }).sender;
              const sender = Array.isArray(senderRaw) ? senderRaw[0] : senderRaw;
              const rowWithSender = {
                ...row,
                sender: sender as MessageRow["sender"],
              } as MessageRow;

              const isEncrypted = rowWithSender.metadata?.encrypted;
              const iv = rowWithSender.metadata?.iv;
              const attachment = rowWithSender.metadata?.attachment_meta;

              let text = rowWithSender.original_text as string;
              if (isEncrypted && iv) {
                try {
                  if (encryptionKey) {
                    text = await decryptData(
                      rowWithSender.original_text as string,
                      iv,
                      encryptionKey
                    );
                  } else {
                    // Encryption not available - try to use as plaintext
                    try {
                      text = atob(rowWithSender.original_text as string);
                    } catch {
                      text = rowWithSender.original_text as string;
                    }
                  }
                } catch (_e) {
                  text = "[Encrypted message - decryption failed]";
                }
              }

              // Get sender name from joined profile data, fallback to sender_id
              const senderName = rowWithSender.sender?.display_name || rowWithSender.sender_id;
              const senderAvatar = rowWithSender.sender?.avatar_url;

              return {
                id: rowWithSender.id,
                type: "CHAT_MESSAGE" as const,
                text,
                lang: rowWithSender.original_language || "en",
                translations: rowWithSender.translations || undefined,
                senderId: rowWithSender.sender_id,
                senderName,
                senderAvatar: senderAvatar || undefined,
                timestamp: new Date(rowWithSender.created_at).getTime(),
                isMe: rowWithSender.sender_id === userId,
                isEncrypted: !!isEncrypted,
                iv,
                attachment,
              } as ChatMessage;
            });

            const batchResults = await Promise.all(batchPromises);
            history.push(...batchResults);
          }
          // Messages loaded

          // Set messages directly (they're already sorted chronologically from server)
          // This is faster than merging and sorting
          setMessages(history);
          messagesLoadedRef.current = true;
          return;
        } else {
          // No messages or error - don't clear existing messages
          if (messages.length === 0) {
            setMessages([]);
          }
          return;
        }
      } catch (_fallbackError) {
        // Set empty messages on error to avoid blocking UI
        setMessages([]);
        return;
      }
    };

    loadHistory();

    // Reset loaded flag when room changes
    return () => {
      messagesLoadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, userId, encryptionKey, supabase]); // messages.length intentionally omitted to prevent re-loading on every message change

  // Fast Client-Side Messaging
  const sendRealtimeMessage = useCallback(
    async (text: string, lang: string = "en", attachment?: ChatMessage["attachment"]) => {
      if (!roomRef.current || !isConnected) return null;

      const msgId = crypto.randomUUID();

      // Encrypt content if encryption is available
      const encryptionResult = await encryptData(text, encryptionKey);
      const isEncrypted = encryptionResult !== null;
      const payload = {
        type: "CHAT_MESSAGE",
        text: encryptionResult?.cipher || text, // Send ciphertext if encrypted, plaintext otherwise
        iv: encryptionResult?.iv || "",
        isEncrypted: isEncrypted,
        lang,
        id: msgId,
        senderId: userId,
        senderName: userName,
        timestamp: Date.now(),
        attachment,
      };

      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify(payload));

      // Optimistic UI update (using clear text)
      const myMessage: ChatMessage = {
        id: msgId,
        type: "CHAT_MESSAGE",
        text: text,
        lang,
        senderId: userId,
        senderName: userName,
        timestamp: payload.timestamp,
        isMe: true,
        isEncrypted: true,
        attachment,
      } as ChatMessage;

      setMessages((prev) => [...prev, myMessage]);

      // Publish to LiveKit (Fast P2P/SFU path)
      try {
        await roomRef.current.localParticipant.publishData(data, {
          reliable: true,
        });
      } catch (_publishError: unknown) {
        // DataChannel errors are often transient and non-critical
        // Message still saved to DB, so it will sync eventually
        // Silently handle publish errors - message will sync via database
        // Don't throw - message is still persisted to DB
      }

      // Return encrypted payload data to be used by server persistence if needed
      return {
        id: msgId,
        encryptedText: payload.text,
        iv: payload.iv,
        timestamp: payload.timestamp,
      };
    },
    [isConnected, userId, userName, encryptionKey]
  );

  // Function to reload messages (useful after clearing chat)
  const reloadMessages = useCallback(async () => {
    if (!roomId || !userId || !encryptionKey) return;

    // Reset the loaded flag to allow reloading
    messagesLoadedRef.current = false;

    // Clear current messages
    setMessages([]);

    // Trigger reload by calling loadHistory logic
    const { getMessages } = await import("../actions/chat");
    const result = await getMessages(roomId);

    if (result.success && result.messages) {
      // Reloading messages

      // Process messages in parallel batches
      const BATCH_SIZE = 20;
      const history: ChatMessage[] = [];

      for (let i = 0; i < result.messages.length; i += BATCH_SIZE) {
        const batch = result.messages.slice(i, i + BATCH_SIZE);

        const batchPromises = batch.map(async (row) => {
          // Handle array case for sender (Supabase foreign key relations)
          const senderRaw = (row as { sender?: unknown }).sender;
          const sender = Array.isArray(senderRaw) ? senderRaw[0] : senderRaw;
          const rowWithSender = {
            ...row,
            sender: sender as MessageRow["sender"],
          } as MessageRow;

          const isEncrypted = rowWithSender.metadata?.encrypted;
          const iv = rowWithSender.metadata?.iv;
          const attachment = rowWithSender.metadata?.attachment_meta;

          let text = rowWithSender.original_text as string;
          if (isEncrypted && iv) {
            try {
              text = await decryptData(rowWithSender.original_text as string, iv, encryptionKey);
            } catch (_e) {
              // Failed to decrypt history message - silently handle
              text = "[Encrypted message - decryption failed]";
            }
          }

          // Get sender name from joined profile data, fallback to sender_id
          const senderName = rowWithSender.sender?.display_name || rowWithSender.sender_id;
          const senderAvatar = rowWithSender.sender?.avatar_url;

          return {
            id: rowWithSender.id,
            type: "CHAT_MESSAGE" as const,
            text,
            lang: rowWithSender.original_language || "en",
            translations: rowWithSender.translations || undefined,
            senderId: rowWithSender.sender_id,
            senderName,
            senderAvatar: senderAvatar || undefined,
            timestamp: new Date(rowWithSender.created_at).getTime(),
            isMe: rowWithSender.sender_id === userId,
            isEncrypted: !!isEncrypted,
            iv,
            attachment,
          } as ChatMessage;
        });

        const batchResults = await Promise.all(batchPromises);
        history.push(...batchResults);
      }

      setMessages(history);
      messagesLoadedRef.current = true;
    }
  }, [roomId, userId, encryptionKey]);

  return { isConnected, messages, sendRealtimeMessage, error, room, encryptionKey, reloadMessages };
};
