import { NextResponse } from "next/server";

/**
 * Health check endpoint for monitoring and load balancers
 */
export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
    },
    { status: 200 }
  );
}
