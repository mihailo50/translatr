"use server";

import { createClient } from "../../utils/supabase/server";

export interface SearchResultUser {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
}

export interface SearchResultMessage {
  id: string;
  text: string;
  room_id: string;
  created_at: string;
  sender_name: string;
  room_name?: string;
}

export interface GlobalSearchResults {
  users: SearchResultUser[];
  messages: SearchResultMessage[];
}

export async function globalSearch(query: string): Promise<GlobalSearchResults> {
  if (!query || query.trim().length === 0) {
    return { users: [], messages: [] };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Perform concurrent search requests
  const [usersRes, messagesRes] = await Promise.all([
    // 1. Search Users
    supabase
      .from("profiles")
      .select("id, display_name, email, avatar_url")
      .or(`display_name.ilike.%${query}%,email.ilike.%${query}%`)
      .limit(5),

    // 2. Search Messages
    supabase
      .from("messages")
      .select(
        `
        id,
        original_text,
        room_id,
        created_at,
        sender:profiles!messages_sender_id_fkey(display_name)
      `
      )
      .ilike("original_text", `%${query}%`)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const users: SearchResultUser[] = (usersRes.data || [])
    .filter((u: SearchResultUser) => u.id !== user?.id) // Exclude self
    .map((u: SearchResultUser) => ({
      id: u.id,
      display_name: u.display_name,
      email: u.email,
      avatar_url: u.avatar_url,
    }));

  const messages: SearchResultMessage[] = (messagesRes.data || []).map((m) => {
    const sender = Array.isArray(m.sender) ? m.sender[0] : m.sender;
    return {
      id: m.id,
      text: m.original_text,
      room_id: m.room_id,
      created_at: m.created_at,
      sender_name: sender?.display_name || "Unknown",
      room_name: "Chat",
    };
  });

  return { users, messages };
}
