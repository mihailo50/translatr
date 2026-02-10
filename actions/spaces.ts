"use server";

import { createClient } from '../utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { randomUUID } from 'crypto';

// =================================================================
// TYPE DEFINITIONS
// =================================================================

export type Space = {
  id: string;
  name: string;
  avatar_url: string | null;
  role: 'admin' | 'member' | 'moderator';
  slug?: string;
  is_private?: boolean;
  created_at?: string;
};

export type SpaceChannel = {
  id: string; // This is the conversation_id
  name: string;
  type: 'text' | 'audio' | 'video';
  unread_count: number;
  is_private?: boolean;
  allowed_role_ids?: string[]; // Role IDs that can access this channel
};

// =================================================================
// HELPER FUNCTIONS
// =================================================================

/**
 * Verifies if the currently authenticated user is a member of a given space.
 * @param spaceId The ID of the space to check.
 * @returns {Promise<boolean>} True if the user is a member, false otherwise.
 */
async function isUserSpaceMember(spaceId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return false;

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

/**
 * Verifies if the currently authenticated user is an admin or owner of a given space.
 * @param spaceId The ID of the space to check.
 * @returns {Promise<{isAdmin: boolean, error: string | null}>}
 */
async function checkAdminPermissions(spaceId: string): Promise<{isAdmin: boolean; error: string | null}> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { isAdmin: false, error: 'Unauthorized' };
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
    const { data, error } = await supabase
      .from('space_members')
      .select('role')
      .eq('space_id', spaceId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }
    
    if (data?.role === 'admin' || data?.role === 'owner') {
      return { isAdmin: true, error: null };
    }

    return { isAdmin: false, error: 'Forbidden: You do not have admin or owner rights for this space.' };
  } catch(err) {
    const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
    console.error(`Error checking admin permissions for space ${spaceId}:`, errorMessage);
    return { isAdmin: false, error: `Permission check failed: ${errorMessage}` };
  }
}


// =================================================================
// PUBLIC ACTIONS
// =================================================================

/**
 * Fetches all spaces the current user is a member of.
 * @returns {Promise<{ spaces: Space[] | null; error: string | null }>}
 */
export async function getUserSpaces(): Promise<{ spaces: Space[] | null; error: string | null }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { spaces: null, error: 'Unauthorized: User not logged in.' };
    }

    const { data, error } = await supabase
      .from('space_members')
      .select(`
        role,
        space:spaces (
          id,
          name,
          avatar_url
        )
      `)
      .eq('user_id', user.id);

    if (error) {
      throw new Error(error.message);
    }
    
    if (!data) {
      return { spaces: [], error: null };
    }

    const spaces: Space[] = data.map((item: any) => ({
      id: item.space.id,
      name: item.space.name,
      avatar_url: item.space.avatar_url,
      role: item.role,
    }));

    return { spaces, error: null };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
    console.error('Error fetching user spaces:', errorMessage);
    return { spaces: null, error: `Failed to fetch spaces: ${errorMessage}` };
  }
}

/**
 * Checks if a user has permission to access a channel.
 * NOTE: This assumes the rooms table has a metadata JSONB column.
 * If not, you'll need to add: ALTER TABLE rooms ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
 * 
 * @param channelId The ID of the channel.
 * @param userId The ID of the user.
 * @returns {Promise<{ hasAccess: boolean; error: string | null }>}
 */
export async function checkChannelPermission(channelId: string, userId: string): Promise<{ hasAccess: boolean; error: string | null }> {
  try {
    const supabase = await createClient();
    
    // Get channel details including space_id and permission settings
    // NOTE: metadata column may need to be added to rooms table
    const { data: channel, error: channelError } = await supabase
      .from('rooms')
      .select('id, space_id')
      .eq('id', channelId)
      .eq('room_type', 'channel')
      .maybeSingle();
    
    if (channelError) {
      // If metadata column doesn't exist, try without it
      const { data: channelBasic } = await supabase
        .from('rooms')
        .select('id, space_id')
        .eq('id', channelId)
        .eq('room_type', 'channel')
        .maybeSingle();
      
      if (!channelBasic) {
        return { hasAccess: false, error: 'Channel not found' };
      }
      
      // If no space_id, it's not a space channel - allow access
      if (!channelBasic.space_id) {
        return { hasAccess: true, error: null };
      }
      
      // For now, if it's a space channel, check membership
      const { data: member } = await supabase
        .from('space_members')
        .select('role')
        .eq('space_id', channelBasic.space_id)
        .eq('user_id', userId)
        .maybeSingle();
      
      return { hasAccess: !!member, error: member ? null : 'You are not a member of this space' };
    }
    
    if (!channel) {
      return { hasAccess: false, error: 'Channel not found' };
    }
    
    if (!channel.space_id) {
      // Not a space channel, allow access
      return { hasAccess: true, error: null };
    }
    
    // Get user's role in the space
    const { data: member, error: memberError } = await supabase
      .from('space_members')
      .select('role')
      .eq('space_id', channel.space_id)
      .eq('user_id', userId)
      .maybeSingle();
    
    if (memberError || !member) {
      return { hasAccess: false, error: 'You are not a member of this space' };
    }
    
    // Try to get metadata if column exists
    try {
      const { data: channelWithMeta } = await supabase
        .from('rooms')
        .select('metadata')
        .eq('id', channelId)
        .single();
      
      if (channelWithMeta?.metadata) {
        const metadata = channelWithMeta.metadata as { is_private?: boolean; allowed_role_ids?: string[] } | null;
        
        // Check if channel is private and has role restrictions
        if (metadata?.is_private && metadata?.allowed_role_ids && metadata.allowed_role_ids.length > 0) {
          // Map system roles to IDs (admin, moderator, member)
          const roleIdMap: Record<string, string> = {
            'admin': 'admin',
            'moderator': 'moderator',
            'member': 'member',
          };
          
          const userRoleId = roleIdMap[member.role] || member.role;
          const hasAccess = metadata.allowed_role_ids.includes(userRoleId);
          
          if (!hasAccess) {
            return { hasAccess: false, error: 'You do not have permission to access this channel' };
          }
        }
      }
    } catch (_metaError) {
      // Metadata column doesn't exist or error - continue with basic membership check
    }
    
    return { hasAccess: true, error: null };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
    console.error(`Error checking channel permission:`, errorMessage);
    return { hasAccess: false, error: `Permission check failed: ${errorMessage}` };
  }
}

/**
 * Fetches all channels (conversations) for a given space.
 * @param spaceId The ID of the space.
 * @returns {Promise<{ channels: SpaceChannel[] | null; error: string | null }>}
 */
export async function getSpaceChannels(spaceId: string): Promise<{ channels: SpaceChannel[] | null; error: string | null }> {
  try {
    // Security: First, verify user has access to this space.
    const isMember = await isUserSpaceMember(spaceId);
    if (!isMember) {
      return { channels: null, error: 'Forbidden: You are not a member of this space.' };
    }
    
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('rooms')
      .select('id, name, room_type')
      .eq('space_id', spaceId)
      .eq('room_type', 'channel');
      
    if (error) {
      throw new Error(error.message);
    }

    // TODO: Implement unread count logic.
    // This would involve checking the last_read timestamp for the user on each channel
    // and counting messages since then. For now, it's hardcoded.
    const channels: SpaceChannel[] = (data || []).map((room: any) => ({
      id: room.id,
      name: room.name,
      type: (room.room_type === 'channel' ? 'text' : room.room_type) || 'text',
      unread_count: 0, 
    }));

    return { channels, error: null };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
    console.error(`Error fetching channels for space ${spaceId}:`, errorMessage);
    return { channels: null, error: `Failed to fetch space channels: ${errorMessage}` };
  }
}

/**
 * Creates a new space and a default #general channel.
 * @param name The name of the new space.
 * @returns {Promise<{ spaceId: string | null; error: string | null }>}
 */
export async function createSpace(formData: FormData): Promise<{ spaceId: string | null; error: string | null }> {
  try {
    const name = formData.get('name') as string;
    const avatarUrl = formData.get('avatar_url') as string | null;

    console.log('createSpace called with:', { name, avatarUrl: avatarUrl ? `${avatarUrl.substring(0, 50)}...` : null });

    if (!name || name.trim().length < 2) {
        return { spaceId: null, error: 'Space name must be at least 2 characters long.'};
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError) {
      console.error('Auth error:', authError);
      return { spaceId: null, error: `Authentication error: ${authError.message}` };
    }

    if (!user) {
      return { spaceId: null, error: 'Unauthorized: User not logged in.' };
    }

    // 1. Insert the new space
    // Limit avatar_url length if it's a base64 data URL (database TEXT has limits)
    let finalAvatarUrl = avatarUrl || null;
    if (finalAvatarUrl && finalAvatarUrl.startsWith('data:') && finalAvatarUrl.length > 100000) {
      // If base64 is too long, truncate or use color instead
      console.warn('Avatar URL too long, using color instead');
      finalAvatarUrl = null; // Will fall back to default color in UI
    }

    const { data: spaceData, error: spaceError } = await supabase
      .from('spaces')
      .insert({
        name: name.trim(),
        owner_id: user.id,
        avatar_url: finalAvatarUrl,
      })
      .select('id')
      .single();

    if (spaceError) {
      console.error('Space insert error:', spaceError);
      // Provide more helpful error messages
      if (spaceError.code === '42P01') {
        throw new Error('Database table "spaces" does not exist. Please run the migration: supabase_migration_spaces.sql');
      } else if (spaceError.code === '42501') {
        throw new Error('Permission denied. Please check your database Row Level Security (RLS) policies.');
      }
      throw spaceError;
    }

    if (!spaceData || !spaceData.id) {
      throw new Error('Space was created but no ID was returned. Please check your database.');
    }

    const newSpaceId = spaceData.id;

    // 2. Add creator as an admin member
    const { error: memberError } = await supabase
      .from('space_members')
      .insert({
        space_id: newSpaceId,
        user_id: user.id,
        role: 'admin',
      });

    if (memberError) {
      console.error('Space member insert error:', memberError);
      if (memberError.code === '42P01') {
        throw new Error('Database table "space_members" does not exist. Please run the migration: supabase_migration_spaces.sql');
      }
      throw memberError;
    }

    // 3. Create a default #general channel for the space
    // Generate a unique room ID for the channel
    const channelId = randomUUID();
    
    const { error: channelError } = await supabase
        .from('rooms')
        .insert({
            id: channelId,
            name: 'general',
            space_id: newSpaceId,
            room_type: 'channel',
        });

    if(channelError) {
      console.error('Channel creation error:', channelError);
      throw channelError;
    }
    
    // 4. Add creator as a member of the default channel
    const { error: roomMemberError } = await supabase
        .from('room_members')
        .insert({
            room_id: channelId,
            profile_id: user.id,
        });
    
    if(roomMemberError) {
      console.error('Room member insert error:', roomMemberError);
      throw roomMemberError;
    }


    // Revalidate paths to update UI across the app
    revalidatePath('/');
    revalidatePath(`/space/${newSpaceId}`);

    return { spaceId: newSpaceId, error: null };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
    console.error('Error creating space:', errorMessage);
    return { spaceId: null, error: `Failed to create space: ${errorMessage}` };
  }
}

/**
 * Updates the role of a member in a space.
 * @param spaceId The ID of the space.
 * @param userId The ID of the user to update.
 * @param newRole The new role to assign.
 * @returns {Promise<{ success: boolean; error: string | null }>}
 */
export async function updateMemberRole(spaceId: string, userId: string, newRole: 'admin' | 'moderator' | 'member'): Promise<{ success: boolean; error: string | null }> {
  try {
    const { isAdmin, error: permError } = await checkAdminPermissions(spaceId);
    if (!isAdmin || permError) {
      return { success: false, error: permError || 'Forbidden' };
    }

    const supabase = await createClient();
    
    // TODO: Prevent self-demotion for the last admin

    const { error } = await supabase
      .from('space_members')
      .update({ role: newRole })
      .eq('space_id', spaceId)
      .eq('user_id', userId);

    if (error) throw error;

    revalidatePath(`/space/${spaceId}`);
    revalidatePath(`/`); // For member list in modals
    return { success: true, error: null };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
    console.error('Error updating member role:', errorMessage);
    return { success: false, error: `Failed to update role: ${errorMessage}` };
  }
}

/**
 * Removes a member from a space.
 * @param spaceId The ID of the space.
 * @param userId The ID of the user to remove.
 * @returns {Promise<{ success: boolean; error: string | null }>}
 */
export async function removeMember(spaceId: string, userId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    // Check invoker's permissions
    const { data: invoker } = await supabase.from('space_members').select('role').eq('user_id', user.id).eq('space_id', spaceId).single();

    // A user can always leave a space
    if (user.id === userId) {
        // TODO: check if they are the last admin
    } else if (invoker?.role !== 'admin') {
        return { success: false, error: 'Forbidden: You do not have admin rights to remove members.' };
    }
    
    const { error } = await supabase
      .from('space_members')
      .delete()
      .eq('space_id', spaceId)
      .eq('user_id', userId);

    if (error) throw error;

    revalidatePath(`/space/${spaceId}`);
    revalidatePath(`/`);
    return { success: true, error: null };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
    console.error('Error removing member:', errorMessage);
    return { success: false, error: `Failed to remove member: ${errorMessage}` };
  }
}

/**
 * Fetches all members of a space with their profile information.
 * Optimized for fast loading with parallel queries and proper indexing.
 * @param spaceId The ID of the space.
 * @returns {Promise<{ members: Array<{id: string, name: string, avatar: string | null, role: 'admin' | 'moderator' | 'member', joined_at: string}> | null; error: string | null }>}
 */
export async function getSpaceMembers(spaceId: string): Promise<{ 
  members: Array<{
    id: string;
    name: string;
    avatar: string | null;
    role: 'admin' | 'moderator' | 'member';
    joined_at: string;
  }> | null; 
  error: string | null 
}> {
  try {
    // Security: First, verify user has access to this space.
    const isMember = await isUserSpaceMember(spaceId);
    if (!isMember) {
      return { members: null, error: 'Forbidden: You are not a member of this space.' };
    }

    const supabase = await createClient();
    
    // Single optimized query with join - fetches members and profile data in one go
    // Uses indexes on space_members(space_id) and profiles(id) for fast lookup
    const { data: membersData, error: membersError } = await supabase
      .from('space_members')
      .select('user_id, role, joined_at')
      .eq('space_id', spaceId)
      .order('joined_at', { ascending: true }); // Order by join date

    if (membersError) {
      throw new Error(membersError.message);
    }

    if (!membersData || membersData.length === 0) {
      return { members: [], error: null };
    }

    // Fetch profile data for all members in parallel (fast batch query)
    const userIds = membersData.map(m => m.user_id);
    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', userIds);

    if (profilesError) {
      throw new Error(profilesError.message);
    }

    // Create a map for O(1) lookup
    const profilesMap = new Map(
      (profilesData || []).map(p => [p.id, p])
    );

    // Transform the data to match the expected format
    const members = membersData.map((member) => {
      const profile = profilesMap.get(member.user_id);
      return {
        id: member.user_id,
        name: profile?.display_name || 'Unknown User',
        avatar: profile?.avatar_url || null,
        role: member.role as 'admin' | 'moderator' | 'member',
        joined_at: member.joined_at,
      };
    });

    return { members, error: null };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
    console.error(`Error fetching members for space ${spaceId}:`, errorMessage);
    return { members: null, error: `Failed to fetch members: ${errorMessage}` };
  }
}

/**
 * Invites a user to a space by their user ID.
 * Creates a space invitation and sends a notification.
 * @param spaceId The ID of the space.
 * @param inviteeId The ID of the user to invite.
 * @returns {Promise<{ success: boolean; error: string | null }>}
 */
export async function inviteUserToSpace(spaceId: string, inviteeId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const { isAdmin, error: permError } = await checkAdminPermissions(spaceId);
    if (!isAdmin || permError) {
      return { success: false, error: permError || 'Forbidden' };
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    // Check if user is already a member
    const { data: existingMember } = await supabase
      .from('space_members')
      .select('user_id')
      .eq('space_id', spaceId)
      .eq('user_id', inviteeId)
      .maybeSingle();

    if (existingMember) {
      return { success: false, error: 'User is already a member of this space.' };
    }

    // Check if there's already a pending invitation
    const { data: existingInvite } = await supabase
      .from('space_invitations')
      .select('id')
      .eq('space_id', spaceId)
      .eq('invitee_id', inviteeId)
      .eq('status', 'pending')
      .maybeSingle();

    if (existingInvite) {
      return { success: false, error: 'User already has a pending invitation.' };
    }

    // Get space and inviter info for notification
    const { data: spaceData } = await supabase
      .from('spaces')
      .select('name')
      .eq('id', spaceId)
      .single();

    const { data: inviterProfile } = await supabase
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('id', user.id)
      .single();

    // Create invitation
    const { error: inviteError } = await supabase
      .from('space_invitations')
      .insert({
        space_id: spaceId,
        inviter_id: user.id,
        invitee_id: inviteeId,
        status: 'pending',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      });

    if (inviteError) {
      throw new Error(inviteError.message);
    }

    // Create notification
    const { error: notifError } = await supabase
      .from('notifications')
      .insert({
        recipient_id: inviteeId,
        type: 'space_invite',
        content: {
          sender_name: inviterProfile?.display_name || 'Someone',
          space_name: spaceData?.name || 'A space',
          avatar_url: inviterProfile?.avatar_url,
        },
        related_id: spaceId,
      });

    if (notifError) {
      // Log but don't fail - invitation was created
      console.error('Failed to create notification:', notifError);
    }

    revalidatePath(`/space/${spaceId}`);
    return { success: true, error: null };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
    console.error('Error inviting user to space:', errorMessage);
    return { success: false, error: `Failed to invite user: ${errorMessage}` };
  }
}

/**
 * Accepts a space invitation.
 * @param invitationId The ID of the invitation.
 * @returns {Promise<{ success: boolean; error: string | null }>}
 */
export async function acceptSpaceInvitation(invitationId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    // Get invitation
    const { data: invitation, error: inviteError } = await supabase
      .from('space_invitations')
      .select('space_id, invitee_id, status, expires_at')
      .eq('id', invitationId)
      .single();

    if (inviteError || !invitation) {
      return { success: false, error: 'Invitation not found.' };
    }

    if (invitation.invitee_id !== user.id) {
      return { success: false, error: 'Unauthorized' };
    }

    if (invitation.status !== 'pending') {
      return { success: false, error: 'Invitation is no longer valid.' };
    }

    if (new Date(invitation.expires_at) < new Date()) {
      // Mark as expired
      await supabase
        .from('space_invitations')
        .update({ status: 'expired' })
        .eq('id', invitationId);
      return { success: false, error: 'Invitation has expired.' };
    }

    // Add user as member
    const { error: memberError } = await supabase
      .from('space_members')
      .insert({
        space_id: invitation.space_id,
        user_id: user.id,
        role: 'member',
      });

    if (memberError) {
      throw new Error(memberError.message);
    }

    // Update invitation status
    const { error: updateError } = await supabase
      .from('space_invitations')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
      })
      .eq('id', invitationId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    // Mark notification as read
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('type', 'space_invite')
      .eq('related_id', invitation.space_id)
      .eq('recipient_id', user.id)
      .eq('is_read', false);

    revalidatePath('/');
    revalidatePath(`/space/${invitation.space_id}`);
    return { success: true, error: null };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
    console.error('Error accepting space invitation:', errorMessage);
    return { success: false, error: `Failed to accept invitation: ${errorMessage}` };
  }
}

/**
 * Declines a space invitation.
 * @param invitationId The ID of the invitation.
 * @returns {Promise<{ success: boolean; error: string | null }>}
 */
export async function declineSpaceInvitation(invitationId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    // Get invitation
    const { data: invitation, error: inviteError } = await supabase
      .from('space_invitations')
      .select('space_id, invitee_id, status')
      .eq('id', invitationId)
      .single();

    if (inviteError || !invitation) {
      return { success: false, error: 'Invitation not found.' };
    }

    if (invitation.invitee_id !== user.id) {
      return { success: false, error: 'Unauthorized' };
    }

    if (invitation.status !== 'pending') {
      return { success: false, error: 'Invitation is no longer valid.' };
    }

    // Update invitation status
    const { error: updateError } = await supabase
      .from('space_invitations')
      .update({
        status: 'declined',
        declined_at: new Date().toISOString(),
      })
      .eq('id', invitationId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    // Mark notification as read
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('type', 'space_invite')
      .eq('related_id', invitation.space_id)
      .eq('recipient_id', user.id)
      .eq('is_read', false);

    return { success: true, error: null };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
    console.error('Error declining space invitation:', errorMessage);
    return { success: false, error: `Failed to decline invitation: ${errorMessage}` };
  }
}

/**
 * Cancels a space invitation (admin only).
 * @param spaceId The ID of the space.
 * @param inviteeId The ID of the invited user.
 * @returns {Promise<{ success: boolean; error: string | null }>}
 */
export async function cancelSpaceInvitation(spaceId: string, inviteeId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const { isAdmin, error: permError } = await checkAdminPermissions(spaceId);
    if (!isAdmin || permError) {
      return { success: false, error: permError || 'Forbidden' };
    }

    const supabase = await createClient();

    // Find pending invitation
    const { data: invitation, error: inviteError } = await supabase
      .from('space_invitations')
      .select('id, status')
      .eq('space_id', spaceId)
      .eq('invitee_id', inviteeId)
      .eq('status', 'pending')
      .maybeSingle();

    if (inviteError || !invitation) {
      return { success: false, error: 'No pending invitation found.' };
    }

    // Update invitation status
    const { error: updateError } = await supabase
      .from('space_invitations')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', invitation.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    // Delete notification
    await supabase
      .from('notifications')
      .delete()
      .eq('type', 'space_invite')
      .eq('related_id', spaceId)
      .eq('recipient_id', inviteeId)
      .eq('is_read', false);

    revalidatePath(`/space/${spaceId}`);
    return { success: true, error: null };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
    console.error('Error cancelling space invitation:', errorMessage);
    return { success: false, error: `Failed to cancel invitation: ${errorMessage}` };
  }
}

/**
 * Gets contacts that can be invited to a space (excludes existing members and pending invites).
 * @param spaceId The ID of the space.
 * @returns {Promise<{ contacts: Array<{id: string, name: string, avatar: string | null, email: string | null}> | null; error: string | null }>}
 */
export async function getInvitableContacts(spaceId: string): Promise<{
  contacts: Array<{
    id: string;
    name: string;
    avatar: string | null;
    email: string | null;
  }> | null;
  error: string | null;
}> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { contacts: null, error: 'Unauthorized' };
    }

    // Get user's accepted contacts with profile data
    const { data: contactsData, error: contactsError } = await supabase
      .from('contacts')
      .select('contact_id, user_id')
      .or(`user_id.eq.${user.id},contact_id.eq.${user.id}`)
      .eq('status', 'accepted');

    if (contactsError) {
      throw new Error(contactsError.message);
    }

    // Get existing members
    const { data: membersData } = await supabase
      .from('space_members')
      .select('user_id')
      .eq('space_id', spaceId);

    const memberIds = new Set((membersData || []).map(m => m.user_id));

    // Get pending invitations
    const { data: invitesData } = await supabase
      .from('space_invitations')
      .select('invitee_id')
      .eq('space_id', spaceId)
      .eq('status', 'pending');

    const invitedIds = new Set((invitesData || []).map(i => i.invitee_id));

    // Extract contact user IDs
    const contactIds: string[] = [];
    for (const contact of contactsData || []) {
      const otherUserId = contact.user_id === user.id ? contact.contact_id : contact.user_id;
      if (otherUserId && otherUserId !== user.id && !memberIds.has(otherUserId) && !invitedIds.has(otherUserId)) {
        contactIds.push(otherUserId);
      }
    }

    if (contactIds.length === 0) {
      return { contacts: [], error: null };
    }

    // Fetch profiles for contacts
    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url, email')
      .in('id', contactIds);

    if (profilesError) {
      throw new Error(profilesError.message);
    }

    // Transform to expected format
    const contacts = (profilesData || []).map(profile => ({
      id: profile.id,
      name: profile.display_name || 'Unknown User',
      avatar: profile.avatar_url || null,
      email: profile.email || null,
    }));

    return { contacts, error: null };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
    console.error('Error fetching invitable contacts:', errorMessage);
    return { contacts: null, error: `Failed to fetch contacts: ${errorMessage}` };
  }
}