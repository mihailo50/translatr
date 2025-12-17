'use server';

import OpenAI from 'openai';
import { RoomServiceClient } from 'livekit-server-sdk';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '../utils/supabase/server';

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

    // Ensure all message participants are room members and create notifications
    if (messageData) {
        try {
            // Get all room members
            const { data: members, error: membersError } = await supabase
                .from('room_members')
                .select('profile_id')
                .eq('room_id', roomId);

            // Also get all users who have sent/received messages in this room
            const { data: messageParticipants } = await supabase
                .from('messages')
                .select('sender_id')
                .eq('room_id', roomId)
                .limit(100); // Reasonable limit

            const participantIds = messageParticipants 
                ? Array.from(new Set(messageParticipants.map(m => m.sender_id)))
                : [];

            // For direct message rooms, also extract the other user from the room ID
            // Room ID format: direct_{userId1}_{userId2} (sorted)
            let otherUserId: string | null = null;
            if (roomId.startsWith('direct_')) {
                const parts = roomId.split('_');
                if (parts.length === 3) {
                    const userId1 = parts[1];
                    const userId2 = parts[2];
                    // Find the other user (not the sender)
                    otherUserId = userId1 === senderId ? userId2 : (userId2 === senderId ? userId1 : null);
                    if (otherUserId && !participantIds.includes(otherUserId)) {
                        participantIds.push(otherUserId);
                    }
                }
            }

            // Ensure all participants are room members (use service role to bypass RLS)
            const supabaseService = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
                process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key'
            );

            const existingMemberIds = members?.map(m => m.profile_id) || [];
            const missingMembers = participantIds.filter(id => !existingMemberIds.includes(id));

            if (missingMembers.length > 0) {
                // Add missing members using service role
                await supabaseService
                    .from('room_members')
                    .insert(missingMembers.map(profile_id => ({ room_id: roomId, profile_id })))
                    .select();
            }

            // Get updated member list for notifications
            const { data: allMembers } = await supabaseService
                .from('room_members')
                .select('profile_id')
                .eq('room_id', roomId);

            if (allMembers) {
                // Get sender's profile for avatar
                const { data: senderProfile } = await supabase
                    .from('profiles')
                    .select('avatar_url')
                    .eq('id', senderId)
                    .single();

                // Create preview text
                let previewText = '';
                if (attachment) {
                    if (attachment.type === 'image') {
                        previewText = attachment.viewOnce ? '📸 View once photo' : '📷 Photo';
                    } else {
                        previewText = `📎 ${attachment.name || 'File'}`;
                    }
                } else if (options?.isEncrypted) {
                    previewText = '🔒 Encrypted message';
                } else if (text && text.trim().length > 0) {
                    // Truncate long messages to ~100 characters
                    previewText = text.length > 100 ? text.substring(0, 100) + '...' : text;
                } else {
                    previewText = 'New message';
                }

                // Create notifications for each recipient (excluding sender)
                const recipients = allMembers.filter(m => m.profile_id !== senderId);
                if (recipients.length > 0) {
                    const notifications = recipients.map(recipient => ({
                        recipient_id: recipient.profile_id,
                        type: 'message' as const,
                        content: {
                            sender_name: senderName,
                            preview: previewText,
                            avatar_url: senderProfile?.avatar_url || null
                        },
                        related_id: roomId
                    }));

                    await supabase
                        .from('notifications')
                        .insert(notifications);
                }
            }
        } catch (notifError) {
            // Don't fail message send if notification creation fails
            console.error('Failed to create notifications:', notifError);
        }
    }

    return { success: true, messageId: messageData?.id };

  } catch (error) {
    console.error('SendMessageAction Error:', error);
    return { success: false, error: 'Failed to process message' };
  }
}

export async function getMessages(roomId: string) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    // Use service role client to bypass RLS recursion
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key';
    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Ensure user is a member (ignore duplicate errors)
    const { error: memberError } = await serviceSupabase
      .from('room_members')
      .insert({ room_id: roomId, profile_id: user.id })
      .select()
      .single();

    // Ignore duplicate errors (user is already a member)
    const isDuplicateError = memberError && (
      memberError.code === '23505' || 
      memberError.message?.includes('duplicate') ||
      memberError.message?.includes('unique')
    );

    if (memberError && !isDuplicateError) {
      console.warn('Could not ensure room membership in getMessages:', memberError);
    }

    // For direct message rooms, check if room ID contains user ID first
    // This allows users to see messages even if they haven't sent any yet
    let canAccess = false;
    
    if (roomId.startsWith('direct_')) {
      const parts = roomId.split('_');
      if (parts.length === 3 && (parts[1] === user.id || parts[2] === user.id)) {
        // User is part of this direct room, they can access it
        canAccess = true;
      }
    }
    
    // Also check if user is a member or has sent messages
    if (!canAccess) {
      const { data: members } = await serviceSupabase
        .from('room_members')
        .select('profile_id')
        .eq('room_id', roomId)
        .eq('profile_id', user.id);

      const { data: userMessages } = await serviceSupabase
        .from('messages')
        .select('sender_id')
        .eq('room_id', roomId)
        .eq('sender_id', user.id)
        .limit(1);

      if ((members && members.length > 0) || (userMessages && userMessages.length > 0)) {
        canAccess = true;
      }
    }

    if (!canAccess) {
      return { success: false, error: 'Not a member of this room' };
    }

    // Load messages using service role (bypasses RLS)
    // First, verify messages exist in this room
    const { count } = await serviceSupabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', roomId);
    
    console.log(`Room ${roomId} has ${count || 0} messages total`);

    const { data, error } = await serviceSupabase
      .from('messages')
      .select('id, sender_id, original_text, original_language, translations, metadata, created_at')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })
      .limit(500);

    if (error) {
      console.error('Failed to load messages:', error);
      return { success: false, error: error.message || 'Unknown error' };
    }

    console.log(`Loaded ${data?.length || 0} messages for room ${roomId}`, {
      roomId,
      messageCount: data?.length || 0,
      firstMessage: data?.[0] ? { id: data[0].id, sender: data[0].sender_id } : null
    });
    
    return { success: true, messages: data || [] };
  } catch (error) {
    console.error('GetMessages Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to load messages';
    return { success: false, error: errorMessage };
  }
}