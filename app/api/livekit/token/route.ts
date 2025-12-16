import { AccessToken } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { room_id, username } = await req.json();

    if (!room_id || !username) {
      return NextResponse.json(
        { error: 'Missing room_id or username' },
        { status: 400 }
      );
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;

    if (!apiKey || !apiSecret || !wsUrl) {
      console.error("LiveKit misconfiguration: Missing API Key, Secret, or WS URL.");
      return NextResponse.json(
        { error: 'Server misconfigured' },
        { status: 500 }
      );
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity: username,
      ttl: '10m',
    });

    at.addGrant({
      roomJoin: true,
      room: room_id,
      canPublish: true,
      canSubscribe: true,
    });

    return NextResponse.json({ token: at.toJwt() });
  } catch (error) {
    console.error('Error generating token', error);
    return NextResponse.json(
      { error: 'Could not generate token' },
      { status: 500 }
    );
  }
}