'use server';

import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '../utils/supabase/server';

export async function initiateCall(roomId: string, userId: string, userName: string, type: 'audio' | 'video') {
  try {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;
    const livekitHost = wsUrl?.replace('wss://', 'https://');

    if (!apiKey || !apiSecret || !wsUrl) {
      console.error('LiveKit credentials missing. Set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, NEXT_PUBLIC_LIVEKIT_URL.');
      return { success: false, error: 'LiveKit is not configured on the server' };
    }

    // 1. Generate Token for the caller
    const at = new AccessToken(apiKey, apiSecret, {
      identity: userId,
      name: userName,
      ttl: '1h',
    });

    at.addGrant({
      roomJoin: true,
      room: roomId,
      canPublish: true,
      canSubscribe: true,
    });

    // Handle both sync and async toJwt() (some SDK versions return Promise)
    const jwtResult = at.toJwt();
    const token = (jwtResult && typeof jwtResult.then === 'function') 
      ? await jwtResult 
      : jwtResult;

    const callId = `call_${Date.now()}`;

    // 2. Create call notification in database for recipient(s)
    // This ensures users receive call notifications even when not in the chat room
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      if (supabaseUrl && supabaseUrl !== 'https://placeholder.supabase.co') {
        // Prefer service role when available; otherwise fall back to authenticated server client.
        // RLS allows inserts (WITH CHECK true) and recipients can SELECT their own notifications.
        const supabaseDb =
          supabaseServiceKey && supabaseServiceKey !== 'placeholder-key'
            ? createSupabaseAdminClient(supabaseUrl, supabaseServiceKey)
            : await createServerClient();
        
        // Get recipient(s) from room_members (for direct rooms, extract from room ID)
        let recipientIds: string[] = [];
        
        console.log(`📞 Initiating call - roomId: ${roomId}, userId: ${userId}, type: ${type}`);
        
        if (roomId.startsWith('direct_')) {
          // Extract user IDs from direct room ID format: direct_userId1_userId2
          // UUIDs use hyphens (-), room ID uses underscores (_) as separators
          // So we need to split carefully - take everything after "direct_" and before the last underscore-UUID
          const withoutPrefix = roomId.substring('direct_'.length);
          
          // UUIDs are 36 characters (with hyphens). Split by _ and reconstruct
          const parts = withoutPrefix.split('_');
          
          if (parts.length >= 2) {
            // Handle case where UUIDs might have been split - reconstruct them
            // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (36 chars)
            const userId1 = parts[0];
            const userId2 = parts.slice(1).join('_'); // In case userId2 had underscores (shouldn't happen but be safe)
            
            console.log(`📞 Parsed direct room - userId1: ${userId1}, userId2: ${userId2}`);
            recipientIds = [userId1, userId2].filter(id => id !== userId && id.length > 0);
            console.log(`📞 Recipient IDs after filtering caller: ${JSON.stringify(recipientIds)}`);
          } else {
            console.error(`📞 Failed to parse direct room ID: ${roomId}, parts: ${JSON.stringify(parts)}`);
          }
          
          // Fallback: If parsing failed, query room_members
          if (recipientIds.length === 0) {
            console.log('📞 Fallback: querying room_members for direct room');
            const { data: members, error: membersError } = await supabaseDb
              .from('room_members')
              .select('profile_id')
              .eq('room_id', roomId);
            
            if (membersError) {
              console.error('📞 Failed to fetch room members:', membersError);
            } else if (members) {
              recipientIds = members.map(m => m.profile_id).filter(id => id !== userId);
              console.log(`📞 Got recipients from room_members: ${JSON.stringify(recipientIds)}`);
            }
          }
        } else {
          // For group rooms, get all members except the caller
          const { data: members, error: membersError } = await supabaseDb
            .from('room_members')
            .select('profile_id')
            .eq('room_id', roomId);
          
          if (membersError) {
            console.error('Failed to fetch room members for call notifications:', membersError);
          }
          if (members) {
            recipientIds = members
              .map(m => m.profile_id)
              .filter(id => id !== userId);
          }
        }
        
        console.log(`📞 Final recipient IDs: ${JSON.stringify(recipientIds)}`);
        
        // Create notifications for all recipients
        if (recipientIds.length > 0) {
          const notifications = recipientIds.map(recipientId => ({
            recipient_id: recipientId,
            type: 'call' as const,
            content: {
              sender_name: userName,
              call_type: type,
              call_id: callId,
              room_id: roomId,
            },
            related_id: roomId,
          }));
          
          const { error: insertError } = await supabaseDb
            .from('notifications')
            .insert(notifications);
          
          if (insertError) {
            console.error('Failed to insert call notifications:', insertError);
          } else {
            console.log(`✅ Created ${notifications.length} call notification(s) for room ${roomId}, recipients: ${JSON.stringify(recipientIds)}`);
          }
        } else {
          console.warn(`📞 No recipients found for call in room ${roomId}. Notification not created.`);
        }
      } else {
        console.error('Missing NEXT_PUBLIC_SUPABASE_URL; cannot create call notifications.');
      }
    } catch (notifError) {
      console.error('Failed to create call notifications:', notifError);
      // Continue - LiveKit data channel will still work for users in the room
    }

    // 3. Broadcast 'call_started' system message via LiveKit Data Channel
    // This allows other users in the chat to see an "Incoming Call" modal
    try {
        const roomService = new RoomServiceClient(livekitHost!, apiKey, apiSecret);
        
        const dataPacket = JSON.stringify({
            type: 'call_invite',
            callId: callId,
            roomId: roomId,
            senderId: userId,
            senderName: userName,
            callType: type,
            timestamp: Date.now()
        });
        
        const encoder = new TextEncoder();
        await roomService.sendData(
            roomId,
            encoder.encode(dataPacket),
            [],
            { reliable: true }
        );
    } catch (e) {
        console.error("Failed to broadcast call invite:", e);
        // Continue, as the caller can still join the room
    }

    return { success: true, token, serverUrl: wsUrl, callId };

  } catch (error) {
    console.error('Initiate Call Error:', error);
    return { success: false, error: 'Failed to start call' };
  }
}