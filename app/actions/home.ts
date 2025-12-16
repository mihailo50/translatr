'use server';

import { createClient } from '../../utils/supabase/server';
import { redirect } from 'next/navigation';

export interface Conversation {
  id: string;
  name: string;
  type: 'direct' | 'group';
  lastMessage: string;
  time: string;
  avatar: string;
  unread: number;
}

export interface HomeStats {
  totalTranslations: number;
  activeMinutes: number;
  messagesSent: number;
}

export async function getHomeData() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  // Get user's profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('id', user.id)
    .single();

  // Get all rooms the user is a member of
  const { data: roomMemberships } = await supabase
    .from('room_members')
    .select('room_id')
    .eq('profile_id', user.id);

  if (!roomMemberships || roomMemberships.length === 0) {
    return {
      user: {
        name: profile?.display_name || user.email?.split('@')[0] || 'User',
        avatar: profile?.avatar_url || null,
      },
      conversations: [],
      stats: {
        totalTranslations: 0,
        activeMinutes: 0,
        messagesSent: 0,
      },
    };
  }

  const roomIds = roomMemberships.map(rm => rm.room_id);

  // Get last message for each room
  // First, get the latest message per room
  const { data: allMessages } = await supabase
    .from('messages')
    .select(`
      id,
      room_id,
      original_text,
      created_at,
      sender_id,
      sender:profiles!messages_sender_id_fkey(display_name, avatar_url)
    `)
    .in('room_id', roomIds)
    .order('created_at', { ascending: false });

  // Get the last message for each room
  const lastMessagesMap = new Map<string, typeof allMessages[0]>();
  if (allMessages) {
    for (const msg of allMessages) {
      if (!lastMessagesMap.has(msg.room_id)) {
        lastMessagesMap.set(msg.room_id, msg);
      }
    }
  }
  const lastMessages = Array.from(lastMessagesMap.values());

  // Get all messages count for stats
  const { data: allUserMessages } = await supabase
    .from('messages')
    .select('id, translations, created_at')
    .eq('sender_id', user.id);

  // Calculate stats
  const messagesSent = allUserMessages?.length || 0;
  const totalTranslations = allUserMessages?.reduce((acc, msg) => {
    const translations = msg.translations as Record<string, string> || {};
    return acc + Object.keys(translations).length;
  }, 0) || 0;

  // Calculate active minutes (rough estimate: 1 message = 2 minutes of activity)
  // You can refine this logic based on your needs
  const activeMinutes = Math.floor(messagesSent * 2);

  // Build conversations list
  const conversationsMap = new Map<string, Conversation>();

  // Process each room
  for (const roomId of roomIds) {
    // Get room members to determine if it's a group or direct chat
    const { data: members } = await supabase
      .from('room_members')
      .select(`
        profile_id,
        profile:profiles!room_members_profile_id_fkey(id, display_name, avatar_url)
      `)
      .eq('room_id', roomId);

    if (!members || members.length === 0) continue;

    const isGroup = members.length > 2;
    const otherMembers = members.filter(m => m.profile_id !== user.id);
    
    // Determine room name and avatar
    let roomName = 'Chat';
    let roomAvatar = 'https://picsum.photos/seed/default/50/50';

    if (isGroup) {
      roomName = otherMembers
        .map(m => m.profile?.display_name || 'User')
        .slice(0, 2)
        .join(', ');
      if (otherMembers.length > 2) {
        roomName += ` +${otherMembers.length - 2}`;
      }
      roomAvatar = 'https://picsum.photos/seed/group/50/50';
    } else if (otherMembers.length === 1) {
      const otherUser = otherMembers[0].profile;
      roomName = otherUser?.display_name || 'User';
      roomAvatar = otherUser?.avatar_url || `https://picsum.photos/seed/${otherUser?.id || 'user'}/50/50`;
    }

    // Find last message for this room
    const lastMessage = lastMessages.find(msg => msg.room_id === roomId);
    
    // Format last message text
    let lastMessageText = 'No messages yet';
    let lastMessageTime = 'Never';
    
    if (lastMessage) {
      const senderName = lastMessage.sender?.display_name || 'Someone';
      lastMessageText = `${senderName}: ${lastMessage.original_text}`;
      
      // Format time
      const messageDate = new Date(lastMessage.created_at);
      const now = new Date();
      const diffMs = now.getTime() - messageDate.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) {
        lastMessageTime = 'Just now';
      } else if (diffMins < 60) {
        lastMessageTime = `${diffMins}m ago`;
      } else if (diffHours < 24) {
        lastMessageTime = `${diffHours}h ago`;
      } else if (diffDays < 7) {
        lastMessageTime = `${diffDays}d ago`;
      } else {
        lastMessageTime = messageDate.toLocaleDateString();
      }
    }

    // Get unread count (messages after user's last read - simplified: count messages not sent by user)
    // For now, we'll set unread to 0. You can implement proper unread tracking later
    const unread = 0;

    conversationsMap.set(roomId, {
      id: roomId,
      name: roomName,
      type: isGroup ? 'group' : 'direct',
      lastMessage: lastMessageText,
      time: lastMessageTime,
      avatar: roomAvatar,
      unread,
    });
  }

  // Sort conversations by last message time (most recent first)
  const conversations = Array.from(conversationsMap.values()).sort((a, b) => {
    const aMsg = lastMessages.find(msg => msg.room_id === a.id);
    const bMsg = lastMessages.find(msg => msg.room_id === b.id);
    
    if (!aMsg && !bMsg) return 0;
    if (!aMsg) return 1; // No message = sort to end
    if (!bMsg) return -1;
    
    // Sort by created_at timestamp (most recent first)
    return new Date(bMsg.created_at).getTime() - new Date(aMsg.created_at).getTime();
  });

  return {
    user: {
      name: profile?.display_name || user.email?.split('@')[0] || 'User',
      avatar: profile?.avatar_url || null,
    },
    conversations,
    stats: {
      totalTranslations,
      activeMinutes,
      messagesSent,
    },
  };
}

