import { AccessToken } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { room_id, user_id, username } = await req.json();

    if (!room_id || !user_id) {
      return NextResponse.json({ error: "Missing room_id or user_id" }, { status: 400 });
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;

    if (!apiKey || !apiSecret || !wsUrl) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    // Validate URL format
    if (!wsUrl.startsWith("wss://") && !wsUrl.startsWith("ws://")) {
      return NextResponse.json(
        { error: "Invalid LiveKit URL format. Must use wss:// or ws://" },
        { status: 500 }
      );
    }

    // Use user_id as identity for uniqueness, fallback to username if not provided
    // Identity must be a string and should be unique per user
    const identity = String(user_id || username || "anonymous");

    try {
      // Verify AccessToken constructor: new AccessToken(apiKey, apiSecret, options)
      // The order is: apiKey first, then apiSecret, then options object
      const at = new AccessToken(apiKey, apiSecret, {
        identity: identity,
        name: username || identity,
        ttl: "10m",
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
      let token: string | Promise<string> | null | undefined;
      try {
        const jwtResult = at.toJwt();

        // Check if it's a Promise and await it if necessary
        if (jwtResult && typeof jwtResult.then === "function") {
          token = await jwtResult;
        } else {
          token = jwtResult;
        }
      } catch (jwtError) {
        return NextResponse.json(
          {
            error: "Failed to generate JWT",
            details: jwtError instanceof Error ? jwtError.message : "Unknown error",
          },
          { status: 500 }
        );
      }

      // Validate token was generated and is a string
      if (!token) {
        return NextResponse.json({ error: "Failed to generate token" }, { status: 500 });
      }

      // Ensure token is a string
      let tokenString: string;
      if (typeof token === "string") {
        tokenString = token;
      } else {
        // Try to convert to string
        try {
          tokenString = String(token);
        } catch (_stringError) {
          return NextResponse.json(
            { error: "Token generation returned invalid type" },
            { status: 500 }
          );
        }
      }

      if (tokenString.length === 0) {
        return NextResponse.json({ error: "Failed to generate token" }, { status: 500 });
      }

      // Return token as a plain string in JSON
      return NextResponse.json(
        { token: tokenString },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    } catch (tokenError) {
      return NextResponse.json(
        {
          error: "Could not generate token",
          details: tokenError instanceof Error ? tokenError.message : "Unknown error",
        },
        { status: 500 }
      );
    }
  } catch (_error) {
    return NextResponse.json({ error: "Could not generate token" }, { status: 500 });
  }
}
