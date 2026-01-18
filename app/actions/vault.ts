'use server';

import { createClient } from '../../utils/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Get or create the Aether Vault for the current user.
 * The vault is a personal chat room where only the user is a participant.
 * Room ID format: vault_{userId}
 */
export async function getOrCreateVault(): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  const vaultRoomId = `vault_${user.id}`;

  // Use service role to ensure we can check and create the room properly
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || supabaseUrl === 'https://placeholder.supabase.co') {
    throw new Error('Server configuration error: Supabase URL not configured');
  }

  if (!supabaseServiceKey || supabaseServiceKey === 'placeholder-key') {
    // Fall back to regular client (with RLS)
    // Check if user is already a member
    const { data: existingMember } = await supabase
      .from('room_members')
      .select('room_id')
      .eq('room_id', vaultRoomId)
      .eq('profile_id', user.id)
      .single();

    if (existingMember) {
      return vaultRoomId;
    }

    // Create room membership for current user
    const { error } = await supabase
      .from('room_members')
      .insert({ room_id: vaultRoomId, profile_id: user.id });

    if (error && !error.message?.includes('duplicate') && !error.code?.includes('23505')) {
      throw new Error(error.message || 'Failed to create vault');
    }

    return vaultRoomId;
  }

  // Use service role client for reliable checks
  const serviceSupabase = createSupabaseClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  // Check if vault room membership already exists
  const { data: existingMember } = await serviceSupabase
    .from('room_members')
    .select('room_id')
    .eq('room_id', vaultRoomId)
    .eq('profile_id', user.id)
    .single();

  if (existingMember) {
    return vaultRoomId;
  }

  // Create room membership (vault rooms don't need a separate "conversations" table entry)
  // They're identified by the vault_{userId} format
  const { error } = await serviceSupabase
    .from('room_members')
    .insert({ room_id: vaultRoomId, profile_id: user.id });

  if (error && !error.message?.includes('duplicate') && !error.code?.includes('23505')) {
    throw new Error(error.message || 'Failed to create vault');
  }

  return vaultRoomId;
}
