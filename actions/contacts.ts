'use server';

import { createClient } from '../utils/supabase/server';
import { revalidatePath } from 'next/cache';

export interface ContactUser {
  id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  status?: 'friends' | 'pending_sent' | 'pending_received' | 'none';
  relationship_id?: string;
}

export async function getContactsData() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { friends: [], requests: [] };

  const { data, error } = await supabase
    .from('contacts')
    .select(`
      id,
      status,
      created_at,
      user_id,
      contact_id,
      sender:profiles!contacts_user_id_fkey(id, display_name, email, avatar_url),
      receiver:profiles!contacts_contact_id_fkey(id, display_name, email, avatar_url)
    `)
    .or(`user_id.eq.${user.id},contact_id.eq.${user.id}`)
    .order('created_at', { ascending: false });

  if (error || !data) {
    console.error("Error fetching contacts:", error);
    return { friends: [], requests: [] };
  }

  const friends: ContactUser[] = [];
  const requests: ContactUser[] = [];

  for (const row of data) {
    const isSender = row.user_id === user.id;
    const otherUser = isSender ? row.receiver : row.sender;
    if (!otherUser) continue; 

    const contactProfile: ContactUser = {
        id: otherUser.id,
        display_name: otherUser.display_name,
        email: otherUser.email,
        avatar_url: otherUser.avatar_url,
        relationship_id: row.id
    };

    if (row.status === 'accepted') {
        friends.push({ ...contactProfile, status: 'friends' });
    } else if (row.status === 'pending') {
        if (!isSender) {
            requests.push({ ...contactProfile, status: 'pending_received' });
        }
    }
  }

  return { friends, requests };
}

export async function searchUsers(query: string): Promise<ContactUser[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  if (!query || query.length < 2) return [];

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, display_name, email, avatar_url')
    .or(`display_name.ilike.%${query}%,email.ilike.%${query}%`)
    .neq('id', user.id)
    .limit(20);

  if (error) {
    console.error(error);
    return [];
  }

  const { data: myContacts } = await supabase
    .from('contacts')
    .select('user_id, contact_id, status, id')
    .or(`user_id.eq.${user.id},contact_id.eq.${user.id}`);

  const results = profiles.map((profile: any) => {
    const relationship = myContacts?.find((c: any) => 
      (c.user_id === user.id && c.contact_id === profile.id) ||
      (c.contact_id === user.id && c.user_id === profile.id)
    );

    let status: ContactUser['status'] = 'none';
    let relationship_id = undefined;

    if (relationship) {
      relationship_id = relationship.id;
      if (relationship.status === 'accepted') {
        status = 'friends';
      } else if (relationship.status === 'pending') {
        status = relationship.user_id === user.id ? 'pending_sent' : 'pending_received';
      } else if (relationship.status === 'blocked') {
        status = 'none'; 
      }
    }

    return {
      id: profile.id,
      display_name: profile.display_name,
      email: profile.email,
      avatar_url: profile.avatar_url,
      status,
      relationship_id
    };
  });

  return results;
}

export async function sendContactRequest(targetUserId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { data: existing } = await supabase
    .from('contacts')
    .select('*')
    .or(`and(user_id.eq.${user.id},contact_id.eq.${targetUserId}),and(user_id.eq.${targetUserId},contact_id.eq.${user.id})`)
    .single();

  if (existing) {
    if (existing.status === 'pending' && existing.contact_id === user.id) {
       return await acceptContactRequest(existing.id);
    }
    return { error: 'Relationship already exists' };
  }

  const { error } = await supabase
    .from('contacts')
    .insert({
      user_id: user.id,
      contact_id: targetUserId,
      status: 'pending'
    });

  if (error) return { error: error.message };
  try { revalidatePath('/contacts'); } catch(e) {}
  return { success: true };
}

export async function acceptContactRequest(relationshipId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('contacts')
    .update({ status: 'accepted' })
    .eq('id', relationshipId);

  if (error) return { error: error.message };
  try { revalidatePath('/contacts'); } catch(e) {}
  return { success: true };
}

export async function declineContactRequest(relationshipId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('contacts')
    .delete() 
    .eq('id', relationshipId);

  if (error) return { error: error.message };
  try { revalidatePath('/contacts'); } catch(e) {}
  return { success: true };
}

// Check if blocking exists between current user and the other room member
export async function getBlockStatus(roomId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { blocked: false, blockedByMe: false };

  // Get other member
  const { data: members } = await supabase
      .from('room_members')
      .select('profile_id')
      .eq('room_id', roomId)
      .neq('profile_id', user.id)
      .limit(1);
  
  if (!members || members.length === 0) return { blocked: false, blockedByMe: false };
  const targetId = members[0].profile_id;

  const { data: rel } = await supabase
      .from('contacts')
      .select('id, status, user_id')
      .or(`and(user_id.eq.${user.id},contact_id.eq.${targetId}),and(user_id.eq.${targetId},contact_id.eq.${user.id})`)
      .single();

  if (!rel || rel.status !== 'blocked') return { blocked: false, blockedByMe: false };

  return { blocked: true, blockedByMe: rel.user_id === user.id };
}

export async function blockUserInRoom(roomId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  // 1. Get room members to find target
  const { data: members, error: membersError } = await supabase
      .from('room_members')
      .select('profile_id')
      .eq('room_id', roomId)
      .neq('profile_id', user.id)
      .limit(1);

  if (membersError || !members || members.length === 0) {
      return { error: 'Could not find user to block' };
  }

  const targetUserId = members[0].profile_id;

  // 2. Check/Update relationship
  const { data: existingRel } = await supabase
      .from('contacts')
      .select('id')
      .or(`and(user_id.eq.${user.id},contact_id.eq.${targetUserId}),and(user_id.eq.${targetUserId},contact_id.eq.${user.id})`)
      .single();

  if (existingRel) {
      // Update existing to blocked. IMPORTANT: Set user_id to current user to indicate ownership of the block.
      const { error } = await supabase
          .from('contacts')
          .update({ status: 'blocked', user_id: user.id, contact_id: targetUserId })
          .eq('id', existingRel.id);
      
      if (error) return { error: error.message };
  } else {
      // Create new blocked relationship
      const { error } = await supabase
          .from('contacts')
          .insert({
              user_id: user.id,
              contact_id: targetUserId,
              status: 'blocked'
          });
      if (error) return { error: error.message };
  }

  return { success: true };
}

export async function unblockUserInRoom(roomId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { data: members } = await supabase
      .from('room_members')
      .select('profile_id')
      .eq('room_id', roomId)
      .neq('profile_id', user.id)
      .limit(1);

  if (!members || members.length === 0) return { error: 'User not found' };
  const targetUserId = members[0].profile_id;

  // Find the blocked relationship where I am the user_id (blocker)
  const { data: rel } = await supabase
      .from('contacts')
      .select('id')
      .eq('user_id', user.id)
      .eq('contact_id', targetUserId)
      .eq('status', 'blocked')
      .single();

  if (rel) {
      // Delete the block (reset to no relationship)
      const { error } = await supabase
          .from('contacts')
          .delete()
          .eq('id', rel.id);
      
      if (error) return { error: error.message };
      return { success: true };
  }

  return { error: "Block record not found or permission denied" };
}