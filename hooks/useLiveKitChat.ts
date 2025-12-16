import { useEffect, useState, useRef, useCallback } from 'react';
import { Room, RoomEvent, DataPacket_Kind, RemoteParticipant, LocalParticipant } from 'livekit-client';
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

  // Initialize Encryption Key
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
      try {
        const response = await fetch('/app/api/livekit/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room_id: roomId, username: userName }),
        });

        if (!response.ok) throw new Error('Failed to fetch token');
        const { token } = await response.json();

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

        newRoom.on(RoomEvent.Disconnected, () => {
          if (mounted) setIsConnected(false);
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
        
        await newRoom.connect(wsUrl, token);

      } catch (err) {
        console.error(err);
        if (mounted) setError(err instanceof Error ? err.message : 'Unknown error');
      }
    };

    if (roomId && userName) {
      connectToRoom();
    }

    return () => {
      mounted = false;
      if (roomRef.current) {
        roomRef.current.disconnect();
      }
    };
  }, [roomId, userName, userId, encryptionKey]);

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