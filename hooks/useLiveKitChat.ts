import { useEffect, useState, useRef, useCallback } from 'react';
import { Room, RoomEvent, DataPacket_Kind, RemoteParticipant, LocalParticipant, DisconnectReason } from 'livekit-client';
import { createClient } from '../utils/supabase/client';
import { deriveKey, encryptData, decryptData } from '../utils/encryption';

export interface ChatMessage {
  id: string;
  type: 'CHAT_MESSAGE';
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
    type: 'image' | 'file';
    name?: string;
    viewOnce?: boolean;
  };
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
    const originalConsoleError = console.error;

    const connectToRoom = async () => {
      // Avoid reconnecting if a room already exists or connection is in progress
      if (roomRef.current || connectingRef.current) {
        return;
      }
      
      connectingRef.current = true;

      try {
        const response = await fetch('/api/livekit/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room_id: roomId, user_id: userId, username: userName }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage = errorData.error || 'Failed to fetch token';
          console.error('Token API error:', response.status, errorMessage);
          throw new Error(errorMessage);
        }
        
        const responseText = await response.text();
        
        let responseData;
        try {
          responseData = JSON.parse(responseText);
        } catch (e) {
          console.error('Failed to parse token API response as JSON:', e);
          throw new Error('Invalid JSON response from token API');
        }
        
        // Extract token and ensure it's a string
        let token = responseData.token;
        
        // If token is an object, try to extract the string value
        if (typeof token === 'object' && token !== null) {
          // Try common object properties that might contain the token
          if ('token' in token && typeof token.token === 'string') {
            token = token.token;
          } else if ('value' in token && typeof token.value === 'string') {
            token = token.value;
          } else if ('access_token' in token && typeof token.access_token === 'string') {
            token = token.access_token;
          } else {
            // Last resort: try to stringify and parse
            const tokenStr = JSON.stringify(token);
            console.error('Could not extract token string from object. Full object:', tokenStr.substring(0, 200));
            throw new Error('Token is an object and could not be converted to string');
          }
        }
        
        // Final validation - ensure it's a string
        if (typeof token !== 'string') {
          console.error('Token is still not a string after extraction:', typeof token, token);
          throw new Error('Token must be a string');
        }
        
        // Validate token is a string
        if (!token || typeof token !== 'string') {
          console.error('Invalid token received:', {
            type: typeof token,
            value: token,
            responseData: responseData
          });
          throw new Error('Invalid token format received from server');
        }

        if (!mounted) return;

        const newRoom = new Room({
          adaptiveStream: true,
          dynacast: true,
          publishDefaults: {
            simulcast: true,
            dtx: true, // Discontinuous Transmission for audio efficiency
            red: true, // Redundant encoding for audio packet loss protection
          }
        });
        
        roomRef.current = newRoom;
        setRoom(newRoom);

        newRoom.on(RoomEvent.Connected, () => {
          if (mounted) setIsConnected(true);
        });

        newRoom.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
          if (mounted) setIsConnected(false);
        });

        newRoom.on(RoomEvent.ConnectionQualityChanged, (quality) => {
          // Connection quality changed
        });

        newRoom.on(RoomEvent.Reconnecting, () => {
          // LiveKit reconnecting
        });

        newRoom.on(RoomEvent.Reconnected, () => {
          // LiveKit reconnected
        });
        
        // Suppress non-critical DataChannel errors and empty notification cleanup errors
        const filterDataChannelErrors = (...args: any[]) => {
          // Check for empty object as first or second argument (common pattern for empty errors)
          const hasEmptyObjectArg = args.some(arg => 
            arg && typeof arg === 'object' && !Array.isArray(arg) && Object.keys(arg).length === 0
          );
          
          const message = args.map(a => typeof a === 'string' ? a : '').join(' ');
          
          // Filter out known non-critical DataChannel warnings
          if (message.includes('Unknown DataChannel error on lossy') || 
              message.includes('Unknown DataChannel error on reliable')) {
            // Silently ignore these transient warnings
            return;
          }
          
          // Filter out empty notification cleanup errors (any variation)
          if (message.includes('Error cleaning up old notifications')) {
            // If the error object is empty or has no meaningful content, skip logging
            if (hasEmptyObjectArg) {
              return;
            }
            // Check if the second arg (error object) has meaningful properties
            if (args.length > 1 && typeof args[1] === 'object' && args[1] !== null) {
              const errObj = args[1];
              const hasMeaningful = errObj.message || errObj.code || errObj.details || errObj.hint;
              if (!hasMeaningful) {
                return;
              }
            }
          }
          
          // Log all other errors normally
          originalConsoleError.apply(console, args);
        };
        console.error = filterDataChannelErrors;

        newRoom.on(RoomEvent.DataReceived, async (payload: Uint8Array, participant?: RemoteParticipant | LocalParticipant) => {
          const decoder = new TextDecoder();
          const strData = decoder.decode(payload);
          
          try {
            const data = JSON.parse(strData);
            
            if (data.type === 'CHAT_MESSAGE') {
               const language = data.lang || data.original_language || 'en';
               const senderId = data.senderId || participant?.identity || 'unknown';
               const senderName = data.senderName || participant?.name || participant?.identity || 'Unknown';

               let contentText = data.text;
               
               // Decrypt if necessary
               if (data.isEncrypted && data.iv) {
                   // We need the key to be ready
                   const keyToUse = encryptionKey || await deriveKey(roomId);
                   if (keyToUse) {
                       contentText = await decryptData(data.text, data.iv, keyToUse);
                   }
               }

               const newMessage: ChatMessage = {
                 id: data.id || crypto.randomUUID(),
                 type: 'CHAT_MESSAGE',
                 text: contentText,
                 lang: language,
                 translations: data.translations,
                 senderId: senderId,
                 senderName: senderName,
                 timestamp: data.timestamp || Date.now(),
                 isMe: senderId === userId,
                 isEncrypted: data.isEncrypted,
                 attachment: data.attachment
               };

               setMessages((prev) => {
                 if (prev.some(m => m.id === newMessage.id)) return prev;
                 return [...prev, newMessage];
               });
            }
          } catch (e) {
            console.error('Failed to parse incoming data message', e);
          }
        });

        const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;
        if (!wsUrl) throw new Error("NEXT_PUBLIC_LIVEKIT_URL is not defined");
        
        // Ensure token is a string before connecting
        if (typeof token !== 'string') {
          console.error('Token is not a string before connect:', typeof token, token);
          throw new Error('Token must be a string');
        }
        
        // Validate token format (JWT tokens are base64 encoded strings with dots)
        if (!token.includes('.')) {
          console.error('Token does not appear to be a valid JWT (missing dots):', token.substring(0, 50));
          throw new Error('Invalid JWT token format');
        }
        
        // Connecting to LiveKit with timeout and retry logic
        
        try {
          // Add connection timeout (30 seconds)
          const connectPromise = newRoom.connect(wsUrl, token);
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Connection timeout after 30 seconds')), 30000)
          );
          
          await Promise.race([connectPromise, timeoutPromise]);
          // LiveKit connected
          connectingRef.current = false;
        } catch (connectError: any) {
          console.error('Error during room.connect():', connectError);
          
          // Clean up the room if connection failed
          if (roomRef.current) {
            try {
              roomRef.current.disconnect();
            } catch (disconnectError) {
              console.error('Error cleaning up after failed connection:', disconnectError);
            }
            roomRef.current = null;
            setRoom(null);
          }
          
          connectingRef.current = false;
          
          // Provide user-friendly error message
          const errorMsg = connectError?.message || 'Unknown connection error';
          if (errorMsg.includes('signal connection') || errorMsg.includes('Abort handler')) {
            console.warn('Signal connection failed. This may be due to network issues or firewall restrictions.');
          }
          
          throw connectError;
        }

      } catch (err) {
        console.error('LiveKit connection error:', err);
        connectingRef.current = false;
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        if (mounted) {
          setError(errorMessage);
          // If it's a server misconfiguration error, show a helpful message
          if (errorMessage.includes('Server misconfigured') || errorMessage.includes('Failed to fetch token')) {
            console.warn('LiveKit is not configured. Chat will work but real-time features may be limited.');
          }
        }
      }
    };

    if (roomId && userName && !roomRef.current) {
      connectToRoom();
    }

    return () => {
      // Cleaning up LiveKit connection
      mounted = false;
      connectingRef.current = false;
      
      // Restore original console.error
      console.error = originalConsoleError;
      
      if (roomRef.current) {
        try {
          // Remove all event listeners before disconnecting
          roomRef.current.removeAllListeners();
          roomRef.current.disconnect();
          // Room disconnected
        } catch (cleanupError) {
          console.error('Error during cleanup disconnect:', cleanupError);
        }
        roomRef.current = null;
      }
      setRoom(null);
      setIsConnected(false);
    };
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
        const { getMessages } = await import('../actions/chat');
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
            const batchPromises = batch.map(async (row: any) => {
              const isEncrypted = row.metadata?.encrypted;
              const iv = row.metadata?.iv;
              const attachment = row.metadata?.attachment_meta;

              let text = row.original_text as string;
              if (isEncrypted && iv) {
                try {
                  text = await decryptData(row.original_text as string, iv, encryptionKey);
                } catch (e) {
                  console.error('Failed to decrypt history message', row.id, e);
                  text = '[Encrypted message - decryption failed]';
                }
              }

              // Get sender name from joined profile data, fallback to sender_id
              const senderName = row.sender?.display_name || row.sender_id;
              const senderAvatar = row.sender?.avatar_url;

              return {
                id: row.id,
                type: 'CHAT_MESSAGE' as const,
                text,
                lang: row.original_language || 'en',
                translations: row.translations || {},
                senderId: row.sender_id,
                senderName,
                senderAvatar,
                timestamp: new Date(row.created_at).getTime(),
                isMe: row.sender_id === userId,
                isEncrypted: !!isEncrypted,
                iv,
                attachment
              };
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
      } catch (fallbackError) {
        console.error('Failed to load messages via server action:', fallbackError);
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
  }, [roomId, userId, encryptionKey, supabase]);

  // Fast Client-Side Messaging
  const sendRealtimeMessage = useCallback(async (text: string, lang: string = 'en', attachment?: ChatMessage['attachment']) => {
    if (!roomRef.current || !isConnected || !encryptionKey) return null;

    const msgId = crypto.randomUUID();
    
    // Encrypt content
    const { cipher, iv } = await encryptData(text, encryptionKey);

    const payload = {
      type: 'CHAT_MESSAGE',
      text: cipher, // Send ciphertext
      iv: iv,
      isEncrypted: true,
      lang,
      id: msgId,
      senderId: userId,
      senderName: userName,
      timestamp: Date.now(),
      attachment
    };

    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(payload));

    // Optimistic UI update (using clear text)
    const myMessage: ChatMessage = {
      id: msgId,
      type: 'CHAT_MESSAGE',
      text: text,
      lang,
      senderId: userId,
      senderName: userName,
      timestamp: payload.timestamp,
      isMe: true,
      isEncrypted: true,
      attachment
    } as ChatMessage;
    
    setMessages((prev) => [...prev, myMessage]);

    // Publish to LiveKit (Fast P2P/SFU path)
    try {
    await roomRef.current.localParticipant.publishData(data, {
        reliable: true,
    });
    } catch (publishError: any) {
      // DataChannel errors are often transient and non-critical
      // Message still saved to DB, so it will sync eventually
      if (publishError?.message?.includes('DataChannel')) {
        console.warn('⚠️ DataChannel publish warning (non-critical):', publishError.message);
      } else {
        console.error('❌ Failed to publish message via LiveKit:', publishError);
      }
      // Don't throw - message is still persisted to DB
    }
    
    // Return encrypted payload data to be used by server persistence if needed
    return {
        id: msgId,
        encryptedText: cipher,
        iv: iv,
        timestamp: payload.timestamp
    };
  }, [isConnected, userId, userName, encryptionKey]);

  // Function to reload messages (useful after clearing chat)
  const reloadMessages = useCallback(async () => {
    if (!roomId || !userId || !encryptionKey) return;
    
    // Reset the loaded flag to allow reloading
    messagesLoadedRef.current = false;
    
    // Clear current messages
    setMessages([]);
    
    // Trigger reload by calling loadHistory logic
    const { getMessages } = await import('../actions/chat');
    const result = await getMessages(roomId);
    
    if (result.success && result.messages) {
      // Reloading messages
      
      // Process messages in parallel batches
      const BATCH_SIZE = 20;
      const history: ChatMessage[] = [];
      
      for (let i = 0; i < result.messages.length; i += BATCH_SIZE) {
        const batch = result.messages.slice(i, i + BATCH_SIZE);
        
        const batchPromises = batch.map(async (row: any) => {
          const isEncrypted = row.metadata?.encrypted;
          const iv = row.metadata?.iv;
          const attachment = row.metadata?.attachment_meta;

          let text = row.original_text as string;
          if (isEncrypted && iv) {
            try {
              text = await decryptData(row.original_text as string, iv, encryptionKey);
            } catch (e) {
              console.error('Failed to decrypt history message', row.id, e);
              text = '[Encrypted message - decryption failed]';
            }
          }

          // Get sender name from joined profile data, fallback to sender_id
          const senderName = row.sender?.display_name || row.sender_id;
          const senderAvatar = row.sender?.avatar_url;

          return {
            id: row.id,
            type: 'CHAT_MESSAGE' as const,
            text,
            lang: row.original_language || 'en',
            translations: row.translations || {},
            senderId: row.sender_id,
            senderName,
            senderAvatar,
            timestamp: new Date(row.created_at).getTime(),
            isMe: row.sender_id === userId,
            isEncrypted: !!isEncrypted,
            iv,
            attachment
          };
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