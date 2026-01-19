'use server';

import OpenAI from 'openai';
import { RoomServiceClient, DataPacket_Kind } from 'livekit-server-sdk';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '../utils/supabase/server';

interface AttachmentData {
  url: string;
  type: 'image' | 'file' | 'voice';
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
    // Validate required environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || supabaseUrl === 'https://placeholder.supabase.co') {
      console.error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
      return { success: false, error: 'Server configuration error: Supabase URL not configured' };
    }
    
    if (!supabaseServiceKey || supabaseServiceKey === 'placeholder-key') {
      console.error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
      return { success: false, error: 'Server configuration error: Supabase service role key not configured' };
    }

    const openai = new OpenAI({ 
        apiKey: process.env.OPENAI_API_KEY || 'placeholder-key',
        dangerouslyAllowBrowser: true
    });

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

    if (dbError || !messageData) {
        // Log the full error object as string so we can read it in console
        console.error("DB Error", JSON.stringify(dbError, null, 2));
        return { success: false, error: dbError?.message || 'Failed to save message to database' };
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
            DataPacket_Kind.RELIABLE
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
            if (!supabaseUrl || !supabaseServiceKey) {
              console.error('Cannot ensure room membership: Supabase credentials missing');
              // Continue without adding members - message was already saved
            } else {
              const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

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
                // Get sender's profile for name and avatar
                const { data: senderProfile } = await supabase
                    .from('profiles')
                    .select('display_name, avatar_url')
                    .eq('id', senderId)
                    .single();

                // Create preview text
                let previewText = '';
                let hasContent = false;
                if (attachment) {
                    hasContent = true;
                    if (attachment.type === 'image') {
                        previewText = attachment.viewOnce ? '📸 View once photo' : '📷 Photo';
                    } else {
                        previewText = `📎 ${attachment.name || 'File'}`;
                    }
                } else if (options?.isEncrypted) {
                    // For encrypted messages, assume there's content (ciphertext is present)
                    hasContent = true;
                    previewText = '🔒 Encrypted message';
                } else if (text && text.trim().length > 0) {
                    hasContent = true;
                    // Truncate long messages to ~100 characters
                    previewText = text.length > 100 ? text.substring(0, 100) + '...' : text;
                } else {
                    // No content (no text, no attachment) - skip notifications
                    hasContent = false;
                    previewText = 'New message';
                }

                // Only create notifications if there's actual message content
                // This prevents "New message" notifications when no actual message was sent
                if (!hasContent) {
                    console.log('Skipping notification creation - no message content (empty text and no attachment)');
                    return { success: true, messageId: messageData.id };
                }

                // Create notifications for each recipient (excluding sender)
                // Only create one notification per recipient per message
                const recipients = allMembers.filter(m => m.profile_id !== senderId);
                if (recipients.length > 0) {
                    // Quick check for existing unread notifications for this room/message to avoid duplicates
                    // Reduced time window to 2 seconds for faster processing
                    const { data: existingNotifications } = await supabaseService
                        .from('notifications')
                        .select('recipient_id')
                        .eq('related_id', roomId)
                        .eq('type', 'message')
                        .eq('is_read', false)
                        .gte('created_at', new Date(Date.now() - 2000).toISOString()) // Within last 2 seconds
                        .limit(recipients.length); // Only fetch what we need
                    
                    const existingRecipientIds = new Set(
                        existingNotifications?.map(n => n.recipient_id) || []
                    );
                    
                    // Only create notifications for recipients who don't already have one
                    const recipientsToNotify = recipients.filter(r => !existingRecipientIds.has(r.profile_id));
                    
                    if (recipientsToNotify.length > 0) {
                        const notifications = recipientsToNotify.map(recipient => ({
                            recipient_id: recipient.profile_id,
                            type: 'message' as const,
                            content: {
                                sender_name: senderName,
                                preview: previewText,
                                avatar_url: senderProfile?.avatar_url || undefined,
                            },
                            related_id: roomId
                        }));

                        // Insert notifications immediately without waiting for response
                        const insertPromise = supabaseService
                            .from('notifications')
                            .insert(notifications)
                            .select();

                        // Log result asynchronously to not block
                        insertPromise.then(({ data: insertedNotifications, error: notifInsertError }) => {
                            if (notifInsertError) {
                                console.error('Failed to insert notifications:', notifInsertError);
                            } else {
                                console.log(`✅ Created ${insertedNotifications?.length || 0} notifications for room ${roomId}`);
                            }
                        }).catch(err => {
                            console.error('Notification insertion error:', err);
                        });
                    }
                }
              }
            }
        } catch (notifError) {
            // Don't fail message send if notification creation fails
            console.error('Failed to create notifications:', notifError);
        }
    }

    return { success: true, messageId: messageData.id };

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
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || supabaseUrl === 'https://placeholder.supabase.co') {
      console.error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
      return { success: false, error: 'Server configuration error: Supabase URL not configured' };
    }
    
    if (!supabaseServiceKey || supabaseServiceKey === 'placeholder-key') {
      console.error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
      return { success: false, error: 'Server configuration error: Supabase service role key not configured' };
    }
    
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

    // Fast access check: For direct message rooms, check room ID format first (no DB query needed)
    let canAccess = false;
    
    if (roomId.startsWith('direct_')) {
      const parts = roomId.split('_');
      if (parts.length === 3 && (parts[1] === user.id || parts[2] === user.id)) {
        canAccess = true;
      }
    }
    
    // For non-direct rooms or if direct check failed, do parallel access checks
    if (!canAccess) {
      const [membersResult, userMessagesResult] = await Promise.all([
        serviceSupabase
          .from('room_members')
          .select('profile_id')
          .eq('room_id', roomId)
          .eq('profile_id', user.id)
          .limit(1)
          .maybeSingle(),
        serviceSupabase
          .from('messages')
          .select('sender_id')
          .eq('room_id', roomId)
          .eq('sender_id', user.id)
          .limit(1)
          .maybeSingle()
      ]);

      canAccess = !!(membersResult.data || userMessagesResult.data);
    }

    if (!canAccess) {
      return { success: false, error: 'Not a member of this room' };
    }

    // Load messages directly (removed unnecessary count query)
    // Order by created_at descending and limit to 500 for performance
    // We'll reverse the array client-side if needed
    // Join with profiles to get sender display names
    const { data, error } = await serviceSupabase
      .from('messages')
      .select('id, sender_id, original_text, original_language, translations, metadata, created_at, sender:profiles!messages_sender_id_fkey(display_name, avatar_url)')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      console.error('Failed to load messages:', error);
      return { success: false, error: error.message || 'Unknown error' };
    }

    // Reverse to get chronological order (oldest first)
    const messages = data ? [...data].reverse() : [];
    
    console.log(`Loaded ${messages.length} messages for room ${roomId}`);
    
    // Filter out messages hidden for this user
    let hiddenMessageIds: string[] = [];
    try {
      const { data: hiddenData, error: hiddenError } = await serviceSupabase
        .from('hidden_messages')
        .select('message_id')
        .eq('room_id', roomId)
        .eq('user_id', user.id);
      
      if (hiddenError) {
        // If table doesn't exist, that's okay - no messages are hidden yet
        if (hiddenError.code === '42P01' || hiddenError.message?.includes('does not exist')) {
          console.log('hidden_messages table does not exist yet - no messages hidden');
        } else {
          console.warn('Error checking hidden messages:', hiddenError);
        }
      } else if (hiddenData) {
        hiddenMessageIds = hiddenData.map((h: any) => h.message_id);
      }
    } catch (hiddenError: any) {
      // Table might not exist yet, that's okay
      console.log('Could not check hidden messages (table may not exist):', hiddenError.message);
    }
    
    // Filter out hidden messages
    const visibleMessages = messages.filter(msg => !hiddenMessageIds.includes(msg.id));
    
    // Also fetch call records for this room
    const { data: callRecordsData, error: callRecordsError } = await serviceSupabase
      .from('call_records')
      .select('id, caller_id, receiver_id, call_type, status, started_at, ended_at, duration_seconds, created_at, caller:profiles!call_records_caller_id_fkey(display_name, email), receiver:profiles!call_records_receiver_id_fkey(display_name, email)')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (callRecordsError) {
      console.warn('Failed to load call records:', callRecordsError);
    }
    
    const callRecords = callRecordsData || [];
    
    return { success: true, messages: visibleMessages, callRecords };
  } catch (error) {
    console.error('GetMessages Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to load messages';
    return { success: false, error: errorMessage };
  }
}

export async function clearChatForUser(roomId: string) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    // Use service role client to bypass RLS
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || supabaseUrl === 'https://placeholder.supabase.co') {
      console.error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
      return { success: false, error: 'Server configuration error: Supabase URL not configured' };
    }
    
    if (!supabaseServiceKey || supabaseServiceKey === 'placeholder-key') {
      console.error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
      return { success: false, error: 'Server configuration error: Supabase service role key not configured' };
    }
    
    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all message IDs in this room
    const { data: roomMessages, error: messagesError } = await serviceSupabase
      .from('messages')
      .select('id')
      .eq('room_id', roomId);

    if (messagesError) {
      console.error('Error fetching room messages:', messagesError);
      return { success: false, error: 'Failed to fetch messages' };
    }

    if (!roomMessages || roomMessages.length === 0) {
      return { success: true, message: 'No messages to hide' };
    }

    // Insert hidden message records for all messages in this room for this user
    const hiddenRecords = roomMessages.map(msg => ({
      room_id: roomId,
      user_id: user.id,
      message_id: msg.id
    }));

    // Insert in batches to avoid payload size issues
    const BATCH_SIZE = 100;
    let totalInserted = 0;
    
    for (let i = 0; i < hiddenRecords.length; i += BATCH_SIZE) {
      const batch = hiddenRecords.slice(i, i + BATCH_SIZE);
      const { error: insertError } = await serviceSupabase
        .from('hidden_messages')
        .upsert(batch, { onConflict: 'room_id,user_id,message_id', ignoreDuplicates: true });
      
      if (insertError) {
        // If table doesn't exist, return helpful error
        if (insertError.code === '42P01' || insertError.message?.includes('does not exist')) {
          console.error('hidden_messages table does not exist. Creating it...');
          // Try to create the table using raw SQL via service role
          // Note: This requires the table to be created via migration first
          // For now, we'll return an error with instructions
          return { 
            success: false, 
            error: 'Please run the database migration to create hidden_messages table. See supabase_schema.sql for the SQL.' 
          };
        }
        console.error('Error hiding messages:', insertError);
        return { success: false, error: 'Failed to hide messages' };
      }
      totalInserted += batch.length;
    }

    return { success: true, message: `Hidden ${totalInserted} messages for you` };
  } catch (error) {
    console.error('ClearChatForUser Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to clear chat';
    return { success: false, error: errorMessage };
  }
}