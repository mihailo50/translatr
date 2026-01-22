"use server";

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "../utils/supabase/server";

export interface CallRecord {
  id: string;
  room_id: string;
  caller_id: string;
  receiver_id: string | null;
  call_type: "audio" | "video";
  status: "initiated" | "accepted" | "declined" | "missed" | "ended";
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  call_id: string | null;
  created_at: string;
  caller?: {
    display_name?: string | null;
    email?: string | null;
  } | null;
  receiver?: {
    display_name?: string | null;
    email?: string | null;
  } | null;
}

/**
 * Create a call record when a call is initiated
 */
export async function createCallRecord(
  roomId: string,
  callerId: string,
  receiverId: string | null,
  callType: "audio" | "video",
  callId?: string
): Promise<{ success: boolean; recordId?: string; error?: string }> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || supabaseUrl === "https://placeholder.supabase.co") {
      return { success: false, error: "Server configuration error" };
    }

    if (!supabaseServiceKey || supabaseServiceKey === "placeholder-key") {
      return { success: false, error: "Server configuration error" };
    }

    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabaseService
      .from("call_records")
      .insert({
        room_id: roomId,
        caller_id: callerId,
        receiver_id: receiverId,
        call_type: callType,
        status: "initiated",
        call_id: callId || null,
      })
      .select("id")
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, recordId: data.id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to create call record";
    return { success: false, error: errorMessage };
  }
}

/**
 * Update call record when call is accepted, declined, or ended
 */
export async function updateCallRecord(
  recordId: string,
  status: "accepted" | "declined" | "missed" | "ended",
  durationSeconds?: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || supabaseUrl === "https://placeholder.supabase.co") {
      return { success: false, error: "Server configuration error" };
    }

    if (!supabaseServiceKey || supabaseServiceKey === "placeholder-key") {
      return { success: false, error: "Server configuration error" };
    }

    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    const updateData: { status: string; ended_at: string; duration_seconds?: number } = {
      status,
      ended_at: new Date().toISOString(),
    };

    if (durationSeconds !== undefined) {
      updateData.duration_seconds = durationSeconds;
    }

    const { error } = await supabaseService
      .from("call_records")
      .update(updateData)
      .eq("id", recordId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to update call record";
    return { success: false, error: errorMessage };
  }
}

/**
 * Update call record by call_id (useful when we don't have recordId)
 */
export async function updateCallRecordByCallId(
  callId: string,
  status: "accepted" | "declined" | "missed" | "ended",
  durationSeconds?: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || supabaseUrl === "https://placeholder.supabase.co") {
      return { success: false, error: "Server configuration error" };
    }

    if (!supabaseServiceKey || supabaseServiceKey === "placeholder-key") {
      return { success: false, error: "Server configuration error" };
    }

    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    const updateData: { status: string; ended_at: string; duration_seconds?: number } = {
      status,
      ended_at: new Date().toISOString(),
    };

    if (durationSeconds !== undefined) {
      updateData.duration_seconds = durationSeconds;
    }

    const { error } = await supabaseService
      .from("call_records")
      .update(updateData)
      .eq("call_id", callId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to update call record";
    return { success: false, error: errorMessage };
  }
}

/**
 * Get call records for a room with caller and receiver profile information
 */
export async function getCallRecords(
  roomId: string
): Promise<{ success: boolean; records?: CallRecord[]; error?: string }> {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    const { data, error } = await supabase
      .from("call_records")
      .select(
        `
        *,
        caller:profiles!call_records_caller_fkey(display_name, email),
        receiver:profiles!call_records_receiver_fkey(display_name, email)
      `
      )
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(100); // Limit to last 100 call records

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, records: data as CallRecord[] };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to fetch call records";
    return { success: false, error: errorMessage };
  }
}
