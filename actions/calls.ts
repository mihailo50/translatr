'use server';

import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '../utils/supabase/server';
import { callLogger } from '../utils/callLogger';

// Cancel a call and clean up all notifications for all recipients
export async function cancelCall(roomId: string, callerId: string) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;
    const livekitHost = wsUrl?.replace('wss://', 'https://');

    if (!supabaseUrl || supabaseUrl === 'https://placeholder.supabase.co') {
      return { success: false, error: 'Supabase not configured' };
    }

    const supabaseDb = supabaseServiceKey && supabaseServiceKey !== 'placeholder-key'
      ? createSupabaseAdminClient(supabaseUrl, supabaseServiceKey)
      : await createServerClient();

    // Mark all unread call notifications for this room as read
    await supabaseDb
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('related_id', roomId)
      .eq('type', 'call')
      .eq('is_read', false);

    // Send call_ended signal via LiveKit server-side to ensure all users receive it
    if (apiKey && apiSecret && livekitHost) {
      try {
        const roomService = new RoomServiceClient(livekitHost, apiKey, apiSecret);
        
        const dataPacket = JSON.stringify({
          type: 'call_ended',
          callId: `cancel_${Date.now()}`,
          senderId: callerId,
          roomId: roomId,
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
        // Silently continue - notifications are already marked as read
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Error cancelling call:', error);
    return { success: false, error: 'Failed to cancel call' };
  }
}

// Check if there's an active call in a room (for "Join Call" button)
// IMPORTANT: This checks for actual CALLS (with audio/video tracks), not just chat participants
export async function checkActiveCall(roomId: string): Promise<{ hasActiveCall: boolean; callType?: 'audio' | 'video'; participantCount?: number }> {
  try {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;
    const livekitHost = wsUrl?.replace('wss://', 'https://');

    if (!apiKey || !apiSecret || !livekitHost) {
      return { hasActiveCall: false };
    }

    const roomService = new RoomServiceClient(livekitHost, apiKey, apiSecret);
    
    try {
      const rooms = await roomService.listRooms([roomId]);
      if (rooms && rooms.length > 0) {
        const room = rooms[0];
        // Room exists and has participants
        if (room.numParticipants && room.numParticipants > 0) {
          // Get participants and check if ANY of them have AUDIO or VIDEO tracks published
          // Chat-only participants don't publish media tracks, only call participants do
          const participants = await roomService.listParticipants(roomId);
          
          // Check if any participant has audio OR video tracks (indicates a real call)
          const hasAudioTracks = participants.some(p => 
            p.tracks?.some(t => t.type === 0) // AUDIO track type
          );
          const hasVideoTracks = participants.some(p => 
            p.tracks?.some(t => t.type === 1) // VIDEO track type
          );
          
          // Only consider it an active call if someone is publishing audio or video
          if (hasAudioTracks || hasVideoTracks) {
            return { 
              hasActiveCall: true, 
              callType: hasVideoTracks ? 'video' : 'audio',
              participantCount: room.numParticipants
            };
          }
        }
      }
    } catch (e) {
      // Room doesn't exist = no active call
    }

    return { hasActiveCall: false };
  } catch (error) {
    return { hasActiveCall: false };
  }
}

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
    let recipientIds: string[] = []; // Declare outside try-catch for logging

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
            
            recipientIds = [userId1, userId2].filter(id => id !== userId && id.length > 0);
          }
          
          // Fallback: If parsing failed, query room_members
          if (recipientIds.length === 0) {
            const { data: members, error: membersError } = await supabaseDb
              .from('room_members')
              .select('profile_id')
              .eq('room_id', roomId);
            
            if (members && !membersError) {
              recipientIds = members.map(m => m.profile_id).filter(id => id !== userId);
            }
          }
        } else {
          // For group rooms, get all members except the caller
          const { data: members, error: membersError } = await supabaseDb
            .from('room_members')
            .select('profile_id')
            .eq('room_id', roomId);
          
          if (members && !membersError) {
            recipientIds = members
              .map(m => m.profile_id)
              .filter(id => id !== userId);
          }
        }
        
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
          
          await supabaseDb
            .from('notifications')
            .insert(notifications);
        }
      }
    } catch (notifError) {
      // Silently continue - LiveKit data channel will still work
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
        // Silently continue - caller can still join
    }

    // Log successful call initiation
    callLogger.callInitiated({
      callId,
      roomId,
      initiatorId: userId,
      initiatorName: userName,
      receiverId: recipientIds.length > 0 ? recipientIds[0] : undefined,
      callType: type
    });

    return { success: true, token, serverUrl: wsUrl, callId };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to start call';
    callLogger.callError('Call initiation failed', {
      roomId,
      initiatorId: userId,
      initiatorName: userName,
      callType: type,
      reason: errorMessage
    });
    return { success: false, error: errorMessage };
  }
}