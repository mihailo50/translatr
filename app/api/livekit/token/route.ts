import { AccessToken } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { room_id, user_id, username } = await req.json();

    if (!room_id || !user_id) {
      return NextResponse.json(
        { error: 'Missing room_id or user_id' },
        { status: 400 }
      );
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;

    if (!apiKey || !apiSecret || !wsUrl) {
      console.error("LiveKit misconfiguration: Missing API Key, Secret, or WS URL.");
      console.error("API Key present:", !!apiKey, apiKey ? `(length: ${apiKey.length})` : '');
      console.error("API Secret present:", !!apiSecret, apiSecret ? `(length: ${apiSecret.length})` : '');
      console.error("WS URL present:", !!wsUrl, wsUrl || '');
      return NextResponse.json(
        { error: 'Server misconfigured' },
        { status: 500 }
      );
    }

    // Validate URL format
    if (!wsUrl.startsWith('wss://') && !wsUrl.startsWith('ws://')) {
      console.error("Invalid LiveKit URL format. Must start with wss:// or ws://");
      console.error("Current URL:", wsUrl);
      return NextResponse.json(
        { error: 'Invalid LiveKit URL format. Must use wss:// or ws://' },
        { status: 500 }
      );
    }

    // Use user_id as identity for uniqueness, fallback to username if not provided
    // Identity must be a string and should be unique per user
    const identity = String(user_id || username || 'anonymous');
    
    try {
      // Verify AccessToken constructor: new AccessToken(apiKey, apiSecret, options)
      // The order is: apiKey first, then apiSecret, then options object
      const at = new AccessToken(apiKey, apiSecret, {
        identity: identity,
        name: username || identity,
        ttl: '10m',
      });

      // Add grant with all required permissions
      // The grant must include roomJoin: true and the room name
      at.addGrant({
        roomJoin: true,
        room: room_id,
        canPublish: true,
        canSubscribe: true,
      });

      // Generate the JWT token
      // Note: toJwt() might return a Promise in some SDK versions, so we handle both cases
      let token: any;
      try {
        const jwtResult = at.toJwt();
        
        // Check if it's a Promise and await it if necessary
        if (jwtResult && typeof jwtResult.then === 'function') {
          console.log('toJwt() returned a Promise, awaiting...');
          token = await jwtResult;
          console.log('Promise resolved, token type:', typeof token);
        } else {
          token = jwtResult;
        }
        
        console.log('toJwt() final result:', {
          type: typeof token,
          isString: typeof token === 'string',
          isNull: token === null,
          isUndefined: token === undefined,
          value: typeof token === 'string' ? token.substring(0, 50) + '...' : String(token),
          constructor: token?.constructor?.name
        });
      } catch (jwtError) {
        console.error('Error calling toJwt():', jwtError);
        return NextResponse.json(
          { error: 'Failed to generate JWT', details: jwtError instanceof Error ? jwtError.message : 'Unknown error' },
          { status: 500 }
        );
      }
      
      // Validate token was generated and is a string
      if (!token) {
        console.error('Failed to generate LiveKit token - token is null/undefined');
        return NextResponse.json(
          { error: 'Failed to generate token' },
          { status: 500 }
        );
      }
      
      // Ensure token is a string
      let tokenString: string;
      if (typeof token === 'string') {
        tokenString = token;
      } else {
        // Try to convert to string
        try {
          tokenString = String(token);
          console.warn('Token was not a string, converted using String():', typeof tokenString);
        } catch (stringError) {
          console.error('Token cannot be converted to string:', {
            type: typeof token,
            value: token,
            error: stringError
          });
          return NextResponse.json(
            { error: 'Token generation returned invalid type' },
            { status: 500 }
          );
        }
      }
      
      if (tokenString.length === 0) {
        console.error('Failed to generate LiveKit token - token is empty string');
        return NextResponse.json(
          { error: 'Failed to generate token' },
          { status: 500 }
        );
      }

      // Log token generation success (without exposing the actual token)
      console.log(`LiveKit token generated successfully for room: ${room_id}, identity: ${identity.substring(0, 8)}..., server: ${wsUrl}, token length: ${tokenString.length}`);
      
      // Return token as a plain string in JSON
      return NextResponse.json({ token: tokenString }, {
        headers: {
          'Content-Type': 'application/json',
        },
      });
    } catch (tokenError) {
      console.error('Error creating LiveKit token:', JSON.stringify({
        error: tokenError instanceof Error ? tokenError.message : 'Unknown error',
        stack: tokenError instanceof Error ? tokenError.stack : undefined,
        room_id,
        identity: String(user_id || username || 'anonymous'),
      }, null, 2));
      return NextResponse.json(
        { error: 'Could not generate token', details: tokenError instanceof Error ? tokenError.message : 'Unknown error' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error generating token', error);
    return NextResponse.json(
      { error: 'Could not generate token' },
      { status: 500 }
    );
  }
}