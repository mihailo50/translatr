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

    const connectToRoom = async () => {
      // Avoid reconnecting if a room already exists
      if (roomRef.current) {
        return;
      }

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
        console.log('Token API raw response:', responseText.substring(0, 200));
        
        let responseData;
        try {
          responseData = JSON.parse(responseText);
        } catch (e) {
          console.error('Failed to parse token API response as JSON:', e);
          throw new Error('Invalid JSON response from token API');
        }
        
        console.log('Token API parsed response:', {
          hasToken: 'token' in responseData,
          tokenType: typeof responseData.token,
          responseKeys: Object.keys(responseData),
          tokenIsString: typeof responseData.token === 'string',
          tokenValue: typeof responseData.token === 'string' ? responseData.token.substring(0, 50) + '...' : responseData.token
        });
        
        // Extract token and ensure it's a string
        let token = responseData.token;
        
        // If token is an object, try to extract the string value
        if (typeof token === 'object' && token !== null) {
          console.warn('Token is an object, attempting to extract string value. Object keys:', Object.keys(token));
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
          console.log('LiveKit room connected successfully');
          if (mounted) setIsConnected(true);
        });

        newRoom.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
          console.log('LiveKit room disconnected:', reason ? String(reason) : 'unknown reason');
          if (mounted) setIsConnected(false);
        });

        newRoom.on(RoomEvent.ConnectionQualityChanged, (quality) => {
          console.log('Connection quality changed:', quality);
        });

        newRoom.on(RoomEvent.Reconnecting, () => {
          console.log('LiveKit reconnecting...');
        });

        newRoom.on(RoomEvent.Reconnected, () => {
          console.log('LiveKit reconnected');
        });

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
        
        console.log('Connecting to LiveKit:', {
          url: wsUrl,
          tokenLength: token.length,
          tokenPreview: token.substring(0, 20) + '...',
          roomId,
          identity: userId
        });
        
        try {
          await newRoom.connect(wsUrl, token);
          console.log('LiveKit connect() call completed successfully');
        } catch (connectError) {
          console.error('Error during room.connect():', connectError);
          throw connectError;
        }

      } catch (err) {
        console.error('LiveKit connection error:', err);
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
      console.log('Cleaning up LiveKit connection...', { roomId, userName, userId });
      mounted = false;
      if (roomRef.current) {
        try {
          roomRef.current.disconnect();
          console.log('LiveKit room disconnected in cleanup');
        } catch (cleanupError) {
          console.error('Error during cleanup disconnect:', cleanupError);
        }
        roomRef.current = null;
      }
    };
  }, [roomId, userName, userId]); // omit encryptionKey to prevent reconnect/disconnect loop

  // Load persisted messages from Supabase once the encryption key is available
  useEffect(() => {
    const loadHistory = async () => {
      if (!roomId || !userId || !encryptionKey) {
        console.log('Skipping message load:', { roomId: !!roomId, userId: !!userId, encryptionKey: !!encryptionKey });
        return;
      }
      
      console.log('Loading message history for room:', roomId);
      
      // Prevent multiple loads for the same room
      if (messagesLoadedRef.current) {
        console.log('Messages already loaded for this room, skipping');
        return;
      }
      
      // Skip client-side membership check - server action handles it more efficiently
      // Always use server action for reliability (bypasses RLS issues)
      // This is more reliable than direct client queries which can hit RLS recursion
      try {
        const { getMessages } = await import('../actions/chat');
        const result = await getMessages(roomId);
        
        if (result.success && result.messages) {
          console.log(`Processing ${result.messages.length} messages for room ${roomId}`);
          
          // Process messages in parallel batches for faster decryption
          const BATCH_SIZE = 20; // Process 20 messages at a time
          const history: ChatMessage[] = [];
          
          for (let i = 0; i < result.messages.length; i += BATCH_SIZE) {
            const batch = result.messages.slice(i, i + BATCH_SIZE);
            
            // Process batch in parallel
            const batchPromises = batch.map(async (row) => {
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

              return {
                id: row.id,
                type: 'CHAT_MESSAGE' as const,
                text,
                lang: row.original_language || 'en',
                translations: row.translations || {},
                senderId: row.sender_id,
                senderName: row.sender_id,
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
          console.log(`Setting ${history.length} messages in state`);
          
          // Set messages directly (they're already sorted chronologically from server)
          // This is faster than merging and sorting
          setMessages(history);
          messagesLoadedRef.current = true;
          return;
        } else {
          // No messages or error - log but don't clear existing messages
          console.warn('No messages loaded from server action:', {
            success: result.success,
            error: result.error,
            messageCount: result.messages?.length || 0,
            roomId,
            currentMessagesCount: messages.length
          });
          // Don't clear messages - keep existing ones if any
          // Only set empty if we truly have no messages
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
    await roomRef.current.localParticipant.publishData(data, {
        reliable: true,
    });
    
    // Return encrypted payload data to be used by server persistence if needed
    return {
        id: msgId,
        encryptedText: cipher,
        iv: iv,
        timestamp: payload.timestamp
    };
  }, [isConnected, userId, userName, encryptionKey]);

  return { isConnected, messages, sendRealtimeMessage, error, room, encryptionKey };
};