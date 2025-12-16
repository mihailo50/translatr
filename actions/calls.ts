'use server';

import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

export async function initiateCall(roomId: string, userId: string, userName: string, type: 'audio' | 'video') {
  try {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;
    const livekitHost = wsUrl?.replace('wss://', 'https://');

    if (!apiKey || !apiSecret || !wsUrl) {
      // Mock for demo if envs missing
      console.warn("LiveKit credentials missing, returning mock success for UI demo");
      return { 
          success: true, 
          token: "mock-token", 
          callId: `call_${Date.now()}`,
          serverUrl: wsUrl || "wss://demo.livekit.cloud"
      };
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

    // 2. Broadcast 'call_started' system message via LiveKit Data Channel
    // This allows other users in the chat to see an "Incoming Call" modal
    try {
        const roomService = new RoomServiceClient(livekitHost!, apiKey, apiSecret);
        
        const dataPacket = JSON.stringify({
            type: 'call_invite',
            callId: `call_${Date.now()}`,
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

    return { success: true, token, serverUrl: wsUrl };

  } catch (error) {
    console.error('Initiate Call Error:', error);
    return { success: false, error: 'Failed to start call' };
  }
}