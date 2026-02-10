"use server";

import OpenAI from "openai";
import { RoomServiceClient, DataPacket_Kind } from "livekit-server-sdk";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "../utils/supabase/server";
import { randomUUID } from "crypto";

interface AttachmentData {
  url: string;
  type: "image" | "file" | "voice";
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

    if (!supabaseUrl || supabaseUrl === "https://placeholder.supabase.co") {
      return { success: false, error: "Server configuration error: Supabase URL not configured" };
    }

    if (!supabaseServiceKey || supabaseServiceKey === "placeholder-key") {
      return {
        success: false,
        error: "Server configuration error: Supabase service role key not configured",
      };
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "placeholder-key",
      dangerouslyAllowBrowser: true,
    });

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const livekitHost = process.env.NEXT_PUBLIC_LIVEKIT_URL || "wss://placeholder.livekit.cloud";
    const livekitKey = process.env.LIVEKIT_API_KEY || "placeholder";
    const livekitSecret = process.env.LIVEKIT_API_SECRET || "placeholder";
    const roomService = new RoomServiceClient(livekitHost, livekitKey, livekitSecret);

    let original_language = "en";
    let translations: Record<string, string> = {};

    // Only attempt translation if NOT encrypted
    if (text && text.trim().length > 0 && !options?.isEncrypted) {
      const { data: members, error: memberError } = await supabase
        .from("room_members")
        .select("profile_id, profiles(preferred_language)")
        .eq("room_id", roomId);

      if (!memberError && members) {
        const targetLanguages = Array.from(
          new Set(
            members.map((m) => {
              const profiles = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
              return profiles?.preferred_language || "en";
            })
          )
        );

        try {
          const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `Translate to: ${targetLanguages.join(", ")}. Return JSON: { "original_language": "code", "translations": { "code": "text" } }.`,
              },
              { role: "user", content: text },
            ],
            response_format: { type: "json_object" },
          });

          const aiResult = JSON.parse(completion.choices[0].message.content || "{}");
          original_language = aiResult.original_language || "en";
          translations = aiResult.translations || {};
        } catch (_e) {
          // AI translation failed, continue with original language
        }
      }
    } else {
      original_language = "encrypted";
    }

    // Save to DB (Persistence)
    // If encrypted, 'text' is ciphertext.
    const { data: messageData, error: dbError } = await supabase
      .from("messages")
      .insert({
        id: options?.messageId, // Use consistent ID if provided by client
        room_id: roomId,
        sender_id: senderId,
        original_text: text,
        original_language: original_language,
        translations: translations,
        metadata: options?.isEncrypted
          ? { iv: options.iv, encrypted: true, attachment_meta: attachment }
          : { attachment_meta: attachment },
      })
      .select()
      .single();

    if (dbError || !messageData) {
      return { success: false, error: dbError?.message || "Failed to save message to database" };
    }

    // Broadcast to LiveKit Room (Server-Side)
    // Only broadcast if client requested it (e.g. for reliability fallback)
    // or if encryption was done server-side (not the case here).
    if (!options?.skipBroadcast && messageData) {
      const dataPacket = JSON.stringify({
        type: "CHAT_MESSAGE",
        id: messageData.id,
        text: text,
        iv: options?.iv,
        isEncrypted: options?.isEncrypted,
        original_language: original_language,
        translations: translations,
        senderId: senderId,
        senderName: senderName,
        timestamp: new Date().getTime(),
        attachment: attachment,
      });

      const encoder = new TextEncoder();
      await roomService.sendData(roomId, encoder.encode(dataPacket), DataPacket_Kind.RELIABLE);
    }

    // Ensure all message participants are room members and create notifications
    if (messageData) {
      try {
        // Get all room members
        const { data: members, error: _membersError } = await supabase
          .from("room_members")
          .select("profile_id")
          .eq("room_id", roomId);

        // Also get all users who have sent/received messages in this room
        const { data: messageParticipants } = await supabase
          .from("messages")
          .select("sender_id")
          .eq("room_id", roomId)
          .limit(100); // Reasonable limit

        const participantIds = messageParticipants
          ? Array.from(new Set(messageParticipants.map((m) => m.sender_id)))
          : [];

        // For direct message rooms, also extract the other user from the room ID
        // Room ID format: direct_{userId1}_{userId2} (sorted)
        let otherUserId: string | null = null;
        if (roomId.startsWith("direct_")) {
          const parts = roomId.split("_");
          if (parts.length === 3) {
            const userId1 = parts[1];
            const userId2 = parts[2];
            // Find the other user (not the sender)
            otherUserId = userId1 === senderId ? userId2 : userId2 === senderId ? userId1 : null;
            if (otherUserId && !participantIds.includes(otherUserId)) {
              participantIds.push(otherUserId);
            }
          }
        }

        // Ensure all participants are room members (use service role to bypass RLS)
        if (!supabaseUrl || !supabaseServiceKey) {
          // Continue without adding members - message was already saved
        } else {
          const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

          const existingMemberIds = members?.map((m) => m.profile_id) || [];
          const missingMembers = participantIds.filter((id) => !existingMemberIds.includes(id));

          if (missingMembers.length > 0) {
            // Add missing members using service role
            await supabaseService
              .from("room_members")
              .insert(missingMembers.map((profile_id) => ({ room_id: roomId, profile_id })))
              .select();
          }

          // Get updated member list for notifications
          const { data: allMembers } = await supabaseService
            .from("room_members")
            .select("profile_id")
            .eq("room_id", roomId);

          if (allMembers) {
            // Get sender's profile for name and avatar
            const { data: senderProfile } = await supabase
              .from("profiles")
              .select("display_name, avatar_url")
              .eq("id", senderId)
              .single();

            // Create preview text
            let previewText = "";
            let hasContent = false;
            if (attachment) {
              hasContent = true;
              if (attachment.type === "image") {
                previewText = attachment.viewOnce ? "📸 View once photo" : "📷 Photo";
              } else {
                previewText = `📎 ${attachment.name || "File"}`;
              }
            } else if (options?.isEncrypted) {
              // For encrypted messages, assume there's content (ciphertext is present)
              hasContent = true;
              previewText = "🔒 Encrypted message";
            } else if (text && text.trim().length > 0) {
              hasContent = true;
              // Truncate long messages to ~100 characters
              previewText = text.length > 100 ? text.substring(0, 100) + "..." : text;
            } else {
              // No content (no text, no attachment) - skip notifications
              hasContent = false;
              previewText = "New message";
            }

            // Only create notifications if there's actual message content
            // This prevents "New message" notifications when no actual message was sent
            if (!hasContent) {
              return { success: true, messageId: messageData.id };
            }

            // Create notifications for each recipient (excluding sender)
            // Only create one notification per recipient per message
            const recipients = allMembers.filter((m) => m.profile_id !== senderId);
            if (recipients.length > 0) {
              // Quick check for existing unread notifications for this room/message to avoid duplicates
              // Reduced time window to 2 seconds for faster processing
              const { data: existingNotifications } = await supabaseService
                .from("notifications")
                .select("recipient_id")
                .eq("related_id", roomId)
                .eq("type", "message")
                .eq("is_read", false)
                .gte("created_at", new Date(Date.now() - 2000).toISOString()) // Within last 2 seconds
                .limit(recipients.length); // Only fetch what we need

              const existingRecipientIds = new Set(
                existingNotifications?.map((n) => n.recipient_id) || []
              );

              // Only create notifications for recipients who don't already have one
              const recipientsToNotify = recipients.filter(
                (r) => !existingRecipientIds.has(r.profile_id)
              );

              if (recipientsToNotify.length > 0) {
                const notifications = recipientsToNotify.map((recipient) => ({
                  recipient_id: recipient.profile_id,
                  type: "message" as const,
                  content: {
                    sender_name: senderName,
                    preview: previewText,
                    avatar_url: senderProfile?.avatar_url || undefined,
                  },
                  related_id: roomId,
                }));

                // Insert notifications immediately without waiting for response
                const insertPromise = Promise.resolve(
                  supabaseService.from("notifications").insert(notifications).select()
                );

                // Insert notifications asynchronously to not block
                insertPromise.catch(() => {
                  // Silently handle notification insertion errors
                });
              }
            }
          }
        }
      } catch (_notifError) {
        // Don't fail message send if notification creation fails
      }
    }

    return { success: true, messageId: messageData.id };
  } catch (_error) {
    return { success: false, error: "Failed to process message" };
  }
}

export async function getMessages(roomId: string) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    // Use service role client to bypass RLS recursion
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || supabaseUrl === "https://placeholder.supabase.co") {
      return { success: false, error: "Server configuration error: Supabase URL not configured" };
    }

    if (!supabaseServiceKey || supabaseServiceKey === "placeholder-key") {
      return {
        success: false,
        error: "Server configuration error: Supabase service role key not configured",
      };
    }

    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Ensure user is a member (ignore duplicate errors)
    await serviceSupabase
      .from("room_members")
      .insert({ room_id: roomId, profile_id: user.id })
      .select()
      .single();

    // Ignore duplicate errors (user is already a member)
    // Non-duplicate errors are ignored silently

    // Fast access check: For direct message rooms, check room ID format first (no DB query needed)
    let canAccess = false;

    if (roomId.startsWith("direct_")) {
      const parts = roomId.split("_");
      if (parts.length === 3 && (parts[1] === user.id || parts[2] === user.id)) {
        canAccess = true;
      }
    }

    // For non-direct rooms or if direct check failed, do parallel access checks
    if (!canAccess) {
      const [membersResult, userMessagesResult] = await Promise.all([
        serviceSupabase
          .from("room_members")
          .select("profile_id")
          .eq("room_id", roomId)
          .eq("profile_id", user.id)
          .limit(1)
          .maybeSingle(),
        serviceSupabase
          .from("messages")
          .select("sender_id")
          .eq("room_id", roomId)
          .eq("sender_id", user.id)
          .limit(1)
          .maybeSingle(),
      ]);

      canAccess = !!(membersResult.data || userMessagesResult.data);
    }

    if (!canAccess) {
      return { success: false, error: "Not a member of this room" };
    }

    // Load messages directly (removed unnecessary count query)
    // Order by created_at descending and limit to 500 for performance
    // We'll reverse the array client-side if needed
    // Join with profiles to get sender display names
    const { data, error } = await serviceSupabase
      .from("messages")
      .select(
        "id, sender_id, original_text, original_language, translations, metadata, created_at, sender:profiles!messages_sender_id_fkey(display_name, avatar_url)"
      )
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      return { success: false, error: error.message || "Unknown error" };
    }

    // Reverse to get chronological order (oldest first)
    const messages = data ? [...data].reverse() : [];

    // Filter out messages hidden for this user
    let hiddenMessageIds: string[] = [];
    try {
      const { data: hiddenData, error: hiddenError } = await serviceSupabase
        .from("hidden_messages")
        .select("message_id")
        .eq("room_id", roomId)
        .eq("user_id", user.id);

      if (hiddenError) {
        // If table doesn't exist, that's okay - no messages are hidden yet
        // Silently ignore other errors
      } else if (hiddenData) {
        hiddenMessageIds = hiddenData.map((h: { message_id: string }) => h.message_id);
      }
    } catch (_hiddenError) {
      // Table might not exist yet, that's okay
    }

    // Filter out hidden messages
    const visibleMessages = messages.filter((msg) => !hiddenMessageIds.includes(msg.id));

    // Also fetch call records for this room
    const { data: callRecordsData } = await serviceSupabase
      .from("call_records")
      .select(
        "id, caller_id, receiver_id, call_type, status, started_at, ended_at, duration_seconds, created_at, caller:profiles!call_records_caller_id_fkey(display_name, email), receiver:profiles!call_records_receiver_id_fkey(display_name, email)"
      )
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(100);

    const callRecords = callRecordsData || [];

    return { success: true, messages: visibleMessages, callRecords };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to load messages";
    return { success: false, error: errorMessage };
  }
}

export async function clearChatForUser(roomId: string) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    // Use service role client to bypass RLS
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || supabaseUrl === "https://placeholder.supabase.co") {
      return { success: false, error: "Server configuration error: Supabase URL not configured" };
    }

    if (!supabaseServiceKey || supabaseServiceKey === "placeholder-key") {
      return {
        success: false,
        error: "Server configuration error: Supabase service role key not configured",
      };
    }

    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all message IDs in this room
    const { data: roomMessages, error: messagesError } = await serviceSupabase
      .from("messages")
      .select("id")
      .eq("room_id", roomId);

    if (messagesError) {
      return { success: false, error: "Failed to fetch messages" };
    }

    if (!roomMessages || roomMessages.length === 0) {
      return { success: true, message: "No messages to hide" };
    }

    // Insert hidden message records for all messages in this room for this user
    const hiddenRecords = roomMessages.map((msg) => ({
      room_id: roomId,
      user_id: user.id,
      message_id: msg.id,
    }));

    // Insert in batches to avoid payload size issues
    const BATCH_SIZE = 100;
    let totalInserted = 0;

    for (let i = 0; i < hiddenRecords.length; i += BATCH_SIZE) {
      const batch = hiddenRecords.slice(i, i + BATCH_SIZE);
      const { error: insertError } = await serviceSupabase
        .from("hidden_messages")
        .upsert(batch, { onConflict: "room_id,user_id,message_id", ignoreDuplicates: true });

      if (insertError) {
        // If table doesn't exist, return helpful error
        if (insertError.code === "42P01" || insertError.message?.includes("does not exist")) {
          return {
            success: false,
            error:
              "Please run the database migration to create hidden_messages table. See supabase_schema.sql for the SQL.",
          };
        }
        return { success: false, error: "Failed to hide messages" };
      }
      totalInserted += batch.length;
    }

    return { success: true, message: `Hidden ${totalInserted} messages for you` };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to clear chat";
    return { success: false, error: errorMessage };
  }
}

export async function createConversation({
  participants,
  groupName,
  initialMessage,
}: {
  participants: string[];
  groupName?: string;
  initialMessage?: string;
}): Promise<{ chatId?: string; error?: string }> {
  "use server";

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized" };
  }

  // Add the current user to the participants list if not already there
  const allParticipantIds = Array.from(new Set([...participants, user.id]));

  if (allParticipantIds.length < 2) {
    return { error: "A conversation requires at least two participants." };
  }

  const isGroup = allParticipantIds.length > 2 || !!groupName;
  let roomId = "";

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
     if (!supabaseUrl || !supabaseServiceKey) {
          throw new Error("Server config error")
        }
    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);

    if (isGroup) {
      // --- Create a new Group Chat ---
      if (!groupName) {
        return { error: "Group name is required for group chats." };
      }
      
      // Generate a unique room ID for the group
      const groupRoomId = `group_${randomUUID()}`;
      
      const { data: newRoom, error: newRoomError } = await serviceSupabase
        .from("rooms")
        .insert({
          id: groupRoomId,
          name: groupName,
          room_type: 'group',
        })
        .select("id")
        .single();

      if (newRoomError) throw newRoomError;
      roomId = newRoom.id;

    } else {
      // --- Create or find a Direct Message chat ---
      const otherUserId = allParticipantIds.find(p => p !== user.id);
      if (!otherUserId) return { error: "Could not determine the other participant." };

      // Create a deterministic room ID for DMs to prevent duplicates
      const sortedIds = [user.id, otherUserId].sort();
      const dmRoomId = `direct_${sortedIds[0]}_${sortedIds[1]}`;
      
      // Check if this room already exists
       const { data: existingRoom, error: checkError } = await serviceSupabase
        .from("rooms")
        .select("id")
        .eq("id", dmRoomId)
        .maybeSingle();

      if(checkError) throw checkError;

      if (existingRoom) {
        roomId = existingRoom.id;
      } else {
        // Create the room if it doesn't exist
        const { data: newDmRoom, error: newDmError } = await serviceSupabase
          .from("rooms")
          .insert({ id: dmRoomId, room_type: 'direct' })
          .select("id")
          .single();
        if (newDmError) throw newDmError;
        roomId = newDmRoom.id;
      }
    }

    if (!roomId) {
        throw new Error("Failed to create or find a room.");
    }

    // --- Add all participants to the room_members table ---
    const memberRecords = allParticipantIds.map(pid => ({ room_id: roomId, profile_id: pid }));
    const { error: memberError } = await serviceSupabase
      .from("room_members")
      .upsert(memberRecords, { onConflict: 'room_id,profile_id' });

    if (memberError) {
      // Don't fail if members already exist, but log other errors
      console.error("Error adding members to room:", memberError.message);
    }
    
    // --- Send initial message if provided ---
    if (initialMessage && initialMessage.trim().length > 0) {
       const { data: senderProfile } = await serviceSupabase.from("profiles").select("display_name").eq("id", user.id).single();
       
       await sendMessageAction(
         initialMessage,
         roomId,
         user.id,
         senderProfile?.display_name || "New User"
       );
    }

    return { chatId: roomId };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    console.error("Create Conversation Error:", errorMessage);
    return { error: `Failed to create conversation: ${errorMessage}` };
  }
}
