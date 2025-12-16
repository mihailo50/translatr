'use server';

import OpenAI from 'openai';
import { RoomServiceClient } from 'livekit-server-sdk';
import { createClient } from '@supabase/supabase-js';

interface AttachmentData {
  url: string;
  type: 'image' | 'file';
  name?: string;
  viewOnce?: boolean;
}

export async function sendMessageAction(
  text: string, 
  roomId: string, 
  senderId: string,
  senderName: string,
  attachment?: AttachmentData,
  options?: {
      isEncrypted?: boolean;
      iv?: string;
      skipBroadcast?: boolean; // If client already sent via P2P
      messageId?: string;
  }
) {
  try {
    const openai = new OpenAI({ 
        apiKey: process.env.OPENAI_API_KEY || 'placeholder-key',
        dangerouslyAllowBrowser: true
    });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const livekitHost = process.env.NEXT_PUBLIC_LIVEKIT_URL || 'wss://placeholder.livekit.cloud';
    const livekitKey = process.env.LIVEKIT_API_KEY || 'placeholder';
    const livekitSecret = process.env.LIVEKIT_API_SECRET || 'placeholder';
    const roomService = new RoomServiceClient(livekitHost, livekitKey, livekitSecret);

    let original_language = 'en';
    let translations: Record<string, string> = {};

    // Only attempt translation if NOT encrypted
    if (text && text.trim().length > 0 && !options?.isEncrypted) {
        const { data: members, error: memberError } = await supabase
          .from('room_members')
          .select('profile_id, profiles(preferred_language)')
          .eq('room_id', roomId);

        if (!memberError) {
            const targetLanguages = Array.from(new Set(
              members?.map((m: any) => m.profiles?.preferred_language || 'en')
            ));

            try {
                const completion = await openai.chat.completions.create({
                  model: "gpt-4o-mini",
                  messages: [
                    {
                      role: "system",
                      content: `Translate to: ${targetLanguages.join(', ')}. Return JSON: { "original_language": "code", "translations": { "code": "text" } }.`
                    },
                    { role: "user", content: text }
                  ],
                  response_format: { type: "json_object" }
                });

                const aiResult = JSON.parse(completion.choices[0].message.content || '{}');
                original_language = aiResult.original_language || 'en';
                translations = aiResult.translations || {};
            } catch (e) {
                console.warn("AI Translation failed:", e);
            }
        }
    } else {
        original_language = 'encrypted';
    }

    // Save to DB (Persistence)
    // If encrypted, 'text' is ciphertext.
    const { data: messageData, error: dbError } = await supabase
      .from('messages')
      .insert({
        id: options?.messageId, // Use consistent ID if provided by client
        room_id: roomId,
        sender_id: senderId,
        original_text: text,
        original_language: original_language,
        translations: translations,
        metadata: options?.isEncrypted ? { iv: options.iv, encrypted: true, attachment_meta: attachment } : { attachment_meta: attachment }
      })
      .select()
      .single();

    if (dbError) {
        // Log the full error object as string so we can read it in console
        console.error("DB Error", JSON.stringify(dbError, null, 2));
    }

    // Broadcast to LiveKit Room (Server-Side)
    // Only broadcast if client requested it (e.g. for reliability fallback)
    // or if encryption was done server-side (not the case here).
    if (!options?.skipBroadcast && messageData) {
        const dataPacket = JSON.stringify({
            type: 'CHAT_MESSAGE',
            id: messageData.id,
            text: text,
            iv: options?.iv,
            isEncrypted: options?.isEncrypted,
            original_language: original_language,
            translations: translations,
            senderId: senderId,
            senderName: senderName,
            timestamp: new Date().getTime(),
            attachment: attachment
        });

        const encoder = new TextEncoder();
        await roomService.sendData(
            roomId,
            encoder.encode(dataPacket),
            [],
            { reliable: true }
        );
    }

    return { success: true, messageId: messageData?.id };

  } catch (error) {
    console.error('SendMessageAction Error:', error);
    return { success: false, error: 'Failed to process message' };
  }
}