"use server";

import { createClient } from '../utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';

// =================================================================
// TYPE DEFINITIONS
// =================================================================

export type ChannelType = 'text' | 'voice';

export type Channel = {
  id: string;
  space_id: string;
  name: string;
  type: ChannelType;
  created_by: string;
  created_at: string;
  updated_at: string;
};

// =================================================================
// HELPER FUNCTIONS
// =================================================================

/**
 * Verifies if the currently authenticated user is an admin or owner of a given space.
 * @param spaceId The ID of the space to check.
 * @returns {Promise<{isAdmin: boolean; error: string | null}>}
 */
async function checkAdminPermissions(spaceId: string): Promise<{isAdmin: boolean; error: string | null}> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { isAdmin: false, error: 'Unauthorized: User not logged in.' };
    }

    // Check if user is space owner
    const { data: spaceData, error: spaceError } = await supabase
      .from('spaces')
      .select('owner_id')
      .eq('id', spaceId)
      .single();

    if (spaceError) {
      throw new Error(spaceError.message);
    }

    if (spaceData?.owner_id === user.id) {
      return { isAdmin: true, error: null };
    }

    // Check if user is admin
    const { data: memberData, error: memberError } = await supabase
      .from('space_members')
      .select('role')
      .eq('space_id', spaceId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (memberError) {
      throw new Error(memberError.message);
    }

    if (memberData?.role === 'admin' || memberData?.role === 'owner') {
      return { isAdmin: true, error: null };
    }

    return { isAdmin: false, error: 'Forbidden: You do not have admin or owner rights for this space.' };
  } catch(err) {
    const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
    console.error(`Error checking admin permissions for space ${spaceId}:`, errorMessage);
    return { isAdmin: false, error: `Permission check failed: ${errorMessage}` };
  }
}

/**
 * Verifies if the currently authenticated user is a member of a given space.
 * @param spaceId The ID of the space to check.
 * @returns {Promise<boolean>} True if the user is a member, false otherwise.
 */
async function isUserSpaceMember(spaceId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return false;

  // Check if user is owner
  const { data: spaceData } = await supabase
    .from('spaces')
    .select('owner_id')
    .eq('id', spaceId)
    .maybeSingle();

  if (spaceData?.owner_id === user.id) {
    return true;
  }

  // Check if user is a member
  const { data, error } = await supabase
    .from('space_members')
    .select('user_id')
    .eq('space_id', spaceId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.error('Error checking space membership:', error);
    return false;
  }
  
  return !!data;
}

// =================================================================
// PUBLIC ACTIONS
// =================================================================

/**
 * Creates a new channel in a space.
 * Only admins or owners can create channels.
 * 
 * @param spaceId The ID of the space.
 * @param name The name of the channel.
 * @param type The type of channel ('text' or 'voice').
 * @returns {Promise<{ channelId: string | null; error: string | null }>}
 */
export async function createChannel(
  spaceId: string,
  name: string,
  type: ChannelType
): Promise<{ channelId: string | null; error: string | null }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { channelId: null, error: 'Unauthorized: User not logged in.' };
    }

    // Validate input
    if (!spaceId || !name || !type) {
      return { channelId: null, error: 'Missing required fields: spaceId, name, and type are required.' };
    }

    if (type !== 'text' && type !== 'voice') {
      return { channelId: null, error: 'Invalid channel type. Must be "text" or "voice".' };
    }

    // Check admin permissions
    const { isAdmin, error: permError } = await checkAdminPermissions(spaceId);
    if (!isAdmin) {
      return { channelId: null, error: permError || 'Forbidden: You do not have permission to create channels.' };
    }

    // Verify space exists
    const { data: spaceData, error: spaceError } = await supabase
      .from('spaces')
      .select('id')
      .eq('id', spaceId)
      .single();

    if (spaceError || !spaceData) {
      return { channelId: null, error: 'Space not found.' };
    }

    // Create channel
    const channelId = randomUUID();
    const { data: channelData, error: channelError } = await supabase
      .from('channels')
      .insert({
        id: channelId,
        space_id: spaceId,
        name: name.trim(),
        type: type,
        created_by: user.id,
      })
      .select()
      .single();

    if (channelError) {
      // Handle unique constraint violation (duplicate channel name in space)
      if (channelError.code === '23505') {
        return { channelId: null, error: `A channel named "${name}" already exists in this space.` };
      }
      throw new Error(channelError.message);
    }

    // For text channels, create a corresponding room entry for message compatibility
    // IMPORTANT: Use the same ID as the channel so they can be queried together
    if (type === 'text') {
      const { error: roomError } = await supabase
        .from('rooms')
        .insert({
          id: channelId, // Use the same ID as the channel
          name: name.trim(),
          room_type: 'channel',
          space_id: spaceId,
          channel_id: channelId, // Link room to channel
        });

      if (roomError) {
        console.error('Error creating room for channel:', roomError);
        // If room creation fails, delete the channel to maintain consistency
        await supabase.from('channels').delete().eq('id', channelId);
        throw new Error(`Failed to create corresponding room for text channel: ${roomError.message}`);
      }
    }

    // Revalidate the space layout path
    revalidatePath(`/space/${spaceId}`);
    revalidatePath(`/space/${spaceId}/channel/${channelId}`);

    return { channelId: channelData.id, error: null };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
    console.error(`Error creating channel in space ${spaceId}:`, errorMessage);
    return { channelId: null, error: `Failed to create channel: ${errorMessage}` };
  }
}

/**
 * Renames a channel.
 * Only admins or owners can rename channels.
 * 
 * @param channelId The ID of the channel to rename.
 * @param newName The new name for the channel.
 * @returns {Promise<{ success: boolean; error: string | null }>}
 */
export async function renameChannel(
  channelId: string,
  newName: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Unauthorized: User not logged in.' };
    }

    // Validate input
    if (!channelId || !newName) {
      return { success: false, error: 'Missing required fields: channelId and newName are required.' };
    }

    const trimmedName = newName.trim();
    if (!trimmedName) {
      return { success: false, error: 'Channel name cannot be empty.' };
    }

    // Get channel to verify it exists and get space_id
    const { data: channelData, error: channelFetchError } = await supabase
      .from('channels')
      .select('id, space_id, name')
      .eq('id', channelId)
      .single();

    if (channelFetchError || !channelData) {
      return { success: false, error: 'Channel not found.' };
    }

    // Check admin permissions
    const { isAdmin, error: permError } = await checkAdminPermissions(channelData.space_id);
    if (!isAdmin) {
      return { success: false, error: permError || 'Forbidden: You do not have permission to rename channels.' };
    }

    // Update channel name
    const { error: updateError } = await supabase
      .from('channels')
      .update({ name: trimmedName })
      .eq('id', channelId);

    if (updateError) {
      // Handle unique constraint violation (duplicate channel name in space)
      if (updateError.code === '23505') {
        return { success: false, error: `A channel named "${trimmedName}" already exists in this space.` };
      }
      throw new Error(updateError.message);
    }

    // Update corresponding room name if it exists
    const { data: roomData } = await supabase
      .from('rooms')
      .select('id')
      .eq('channel_id', channelId)
      .maybeSingle();

    if (roomData) {
      const { error: roomUpdateError } = await supabase
        .from('rooms')
        .update({ name: trimmedName })
        .eq('id', roomData.id);

      if (roomUpdateError) {
        console.error('Error updating room name:', roomUpdateError);
        // Don't fail the operation, channel was renamed successfully
      }
    }

    // Revalidate paths
    revalidatePath(`/space/${channelData.space_id}`);
    revalidatePath(`/space/${channelData.space_id}/channel/${channelId}`);

    return { success: true, error: null };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
    console.error(`Error renaming channel ${channelId}:`, errorMessage);
    return { success: false, error: `Failed to rename channel: ${errorMessage}` };
  }
}

/**
 * Deletes a channel.
 * Only admins or owners can delete channels.
 * 
 * @param channelId The ID of the channel to delete.
 * @returns {Promise<{ success: boolean; error: string | null }>}
 */
export async function deleteChannel(
  channelId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Unauthorized: User not logged in.' };
    }

    // Validate input
    if (!channelId) {
      return { success: false, error: 'Missing required field: channelId is required.' };
    }

    // Get channel to verify it exists and get space_id
    const { data: channelData, error: channelFetchError } = await supabase
      .from('channels')
      .select('id, space_id, name')
      .eq('id', channelId)
      .single();

    if (channelFetchError || !channelData) {
      return { success: false, error: 'Channel not found.' };
    }

    // Check admin permissions
    const { isAdmin, error: permError } = await checkAdminPermissions(channelData.space_id);
    if (!isAdmin) {
      return { success: false, error: permError || 'Forbidden: You do not have permission to delete channels.' };
    }

    // Delete corresponding room if it exists (CASCADE should handle this, but we'll do it explicitly)
    const { data: roomData } = await supabase
      .from('rooms')
      .select('id')
      .eq('channel_id', channelId)
      .maybeSingle();

    if (roomData) {
      // Delete messages in the room first (if needed, depending on your cascade settings)
      // For now, we'll let the database handle cascades
      const { error: roomDeleteError } = await supabase
        .from('rooms')
        .delete()
        .eq('id', roomData.id);

      if (roomDeleteError) {
        console.error('Error deleting room:', roomDeleteError);
        // Continue with channel deletion even if room deletion fails
      }
    }

    // Delete the channel (this will cascade delete related data if foreign keys are set up)
    const { error: deleteError } = await supabase
      .from('channels')
      .delete()
      .eq('id', channelId);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    // Revalidate the space layout path
    revalidatePath(`/space/${channelData.space_id}`);

    return { success: true, error: null };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
    console.error(`Error deleting channel ${channelId}:`, errorMessage);
    return { success: false, error: `Failed to delete channel: ${errorMessage}` };
  }
}

/**
 * Fetches all channels for a given space.
 * All space members can view channels.
 * 
 * @param spaceId The ID of the space.
 * @returns {Promise<{ channels: Channel[] | null; error: string | null }>}
 */
export async function getSpaceChannels(spaceId: string): Promise<{ channels: Channel[] | null; error: string | null }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { channels: null, error: 'Unauthorized: User not logged in.' };
    }

    // Verify user is a member of the space
    const isMember = await isUserSpaceMember(spaceId);
    if (!isMember) {
      return { channels: null, error: 'Forbidden: You are not a member of this space.' };
    }

    // Fetch channels
    const { data, error } = await supabase
      .from('channels')
      .select('*')
      .eq('space_id', spaceId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return { channels: data || [], error: null };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
    console.error(`Error fetching channels for space ${spaceId}:`, errorMessage);
    return { channels: null, error: `Failed to fetch channels: ${errorMessage}` };
  }
}
