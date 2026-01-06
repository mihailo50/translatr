'use server';

import { createClient } from '../../utils/supabase/server';
import { redirect } from 'next/navigation';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import crypto from 'crypto';

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

// Server-side decryption function (Node.js compatible)
// Matches client-side encryption logic in utils/encryption.ts
async function decryptMessageServer(cipher: string, iv: string, roomId: string): Promise<string> {
  try {
    // Derive key from roomId (matching client-side PBKDF2 logic)
    // Client uses roomId as raw key material, then PBKDF2 with salt
    const keyMaterial = Buffer.from(roomId, 'utf-8');
    const salt = Buffer.from('translatr-secure-salt-v1', 'utf-8');
    
    // Use PBKDF2 to derive key (matching client-side: 100000 iterations, SHA-256, 32 bytes for AES-256)
    const key = crypto.pbkdf2Sync(keyMaterial, salt, 100000, 32, 'sha256');
    
    // Decode base64
    const ivBytes = Buffer.from(iv, 'base64');
    const cipherBytes = Buffer.from(cipher, 'base64');
    
    // In Web Crypto API with GCM, the auth tag (16 bytes) is automatically appended to ciphertext
    // Extract it for Node.js crypto which requires it separately
    const authTagLength = 16;
    if (cipherBytes.length < authTagLength) {
      throw new Error('Ciphertext too short');
    }
    
    const encrypted = cipherBytes.slice(0, -authTagLength);
    const authTag = cipherBytes.slice(-authTagLength);
    
    // Decrypt using AES-256-GCM
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBytes);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf-8');
  } catch (e) {
    console.error('Server decryption error:', e);
    // Return encrypted indicator if decryption fails
    return '🔒 Encrypted message';
  }
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

  // Use service role to bypass RLS for reliable room membership management
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || supabaseUrl === 'https://placeholder.supabase.co') {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
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
  
  const { createClient: createServiceClient } = await import('@supabase/supabase-js');
  let serviceSupabase;
  
  if (!supabaseServiceKey || supabaseServiceKey === 'placeholder-key') {
    console.error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
    // Fall back to regular client (with RLS) instead of failing completely
    serviceSupabase = createServiceClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '');
  } else {
    serviceSupabase = createServiceClient(supabaseUrl, supabaseServiceKey);
  }

  // Get all rooms the user is a member of
  const { data: roomMemberships } = await supabase
    .from('room_members')
    .select('room_id')
    .eq('profile_id', user.id);

  // Get all unique room IDs from messages
  const { data: allRoomMessages } = await serviceSupabase
    .from('messages')
    .select('room_id, sender_id')
    .order('created_at', { ascending: false });

  // Find rooms where user is involved
  const userInvolvedRooms = new Set<string>();
  if (allRoomMessages) {
    // Get unique room IDs
    const uniqueRoomIds = Array.from(new Set(allRoomMessages.map(m => m.room_id)));
    
    for (const roomId of uniqueRoomIds) {
      // Check if user sent any message in this room
      const userSentMessage = allRoomMessages.some(m => m.room_id === roomId && m.sender_id === user.id);
      
      if (userSentMessage) {
        userInvolvedRooms.add(roomId);
      } else {
        // For direct message rooms, check if room ID contains user ID
        if (roomId.startsWith('direct_')) {
          const parts = roomId.split('_');
          if (parts.length === 3 && (parts[1] === user.id || parts[2] === user.id)) {
            userInvolvedRooms.add(roomId);
          }
        } else {
          // For group rooms, check if user is a member
          const { data: roomMembers } = await serviceSupabase
            .from('room_members')
            .select('profile_id')
            .eq('room_id', roomId)
            .eq('profile_id', user.id)
            .limit(1);
          if (roomMembers && roomMembers.length > 0) {
            userInvolvedRooms.add(roomId);
          }
        }
      }
    }
  }

  // Combine room IDs from both sources
  const memberRoomIds = roomMemberships?.map(rm => rm.room_id) || [];
  const messageRoomIds = Array.from(userInvolvedRooms);
  const allRoomIds = Array.from(new Set([...memberRoomIds, ...messageRoomIds]));

  // Ensure user is added to room_members for any rooms they're involved in but aren't members of
  for (const roomId of messageRoomIds) {
    if (!memberRoomIds.includes(roomId)) {
      // Use service role to add user to room_members (bypasses RLS)
      await serviceSupabase
        .from('room_members')
        .insert({ room_id: roomId, profile_id: user.id })
        .select()
        .single();
    }
  }

  if (allRoomIds.length === 0) {
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

  const roomIds = allRoomIds;

  // Get last message for each room using service role to bypass RLS
  // First, get the latest message per room
  const { data: allMessages, error: messagesError } = await serviceSupabase
    .from('messages')
    .select(`
      id,
      room_id,
      original_text,
      created_at,
      sender_id,
      metadata,
      sender:profiles!messages_sender_id_fkey(id, display_name, avatar_url, email)
    `)
    .in('room_id', roomIds)
    .order('created_at', { ascending: false });

  if (messagesError) {
    console.error('Error loading messages for conversations:', messagesError);
  }

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
    // Use service role to bypass RLS
    const { data: members } = await serviceSupabase
      .from('room_members')
      .select(`
        profile_id,
        profile:profiles!room_members_profile_id_fkey(id, display_name, avatar_url)
      `)
      .eq('room_id', roomId);

    // If no members found, try to get other user from direct room ID
    if (!members || members.length === 0) {
      // For direct message rooms, extract the other user from room ID
      if (roomId.startsWith('direct_')) {
        const parts = roomId.split('_');
        if (parts.length === 3) {
          const userId1 = parts[1];
          const userId2 = parts[2];
          const otherUserId = userId1 === user.id ? userId2 : userId1;
          
          // Get other user's profile
          const { data: otherProfile } = await serviceSupabase
            .from('profiles')
            .select('id, display_name, avatar_url')
            .eq('id', otherUserId)
            .single();

          if (otherProfile) {
            // Create a conversation entry even without room_members
            const lastMessage = lastMessages.find(msg => msg.room_id === roomId);
            let lastMessageText = 'No messages yet';
            let lastMessageTime = 'Never';
            
            if (lastMessage) {
              const senderName = lastMessage.sender?.display_name || 'Someone';
              lastMessageText = `${senderName}: ${lastMessage.original_text}`;
              
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

            conversationsMap.set(roomId, {
              id: roomId,
              name: otherProfile.display_name || 'User',
              type: 'direct',
              lastMessage: lastMessageText,
              time: lastMessageTime,
              avatar: otherProfile.avatar_url || `https://picsum.photos/seed/${otherProfile.id}/50/50`,
              unread: 0,
            });
          }
        }
      }
      continue;
    }

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
      // Get sender name - check if it's the current user
      let senderName = 'You';
      if (lastMessage.sender_id !== user.id) {
        senderName = lastMessage.sender?.display_name || lastMessage.sender?.email?.split('@')[0] || 'Someone';
      }
      
      // Handle encrypted messages or empty text
      let messageText = lastMessage.original_text || '';
      const metadata = lastMessage.metadata as any;
      
      // Check if message is encrypted
      if (metadata?.encrypted && metadata?.iv && messageText) {
        try {
          // Decrypt the message using Node.js crypto (server-side compatible)
          messageText = await decryptMessageServer(messageText, metadata.iv, roomId);
        } catch (e) {
          console.error('Failed to decrypt message preview:', e);
          messageText = '🔒 Encrypted message';
        }
      } else if (!messageText || messageText.trim() === '') {
        // Check if there's an attachment
        if (metadata?.attachment_meta) {
          const attachment = metadata.attachment_meta;
          if (attachment.type === 'image') {
            messageText = attachment.viewOnce ? '📸 View once photo' : '📷 Photo';
          } else {
            messageText = `📎 ${attachment.name || 'File'}`;
          }
        } else {
          messageText = 'Message';
        }
      }
      
      // Truncate long messages
      if (messageText.length > 50) {
        messageText = messageText.substring(0, 50) + '...';
      }
      
      lastMessageText = `${senderName}: ${messageText}`;
      
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
      _lastMessageTimestamp: lastMessage ? new Date(lastMessage.created_at).getTime() : 0,
    } as Conversation & { _lastMessageTimestamp?: number });
  }

  // Sort conversations by last message time (most recent first)
  const conversations = Array.from(conversationsMap.values()).sort((a, b) => {
    const aTimestamp = (a as any)._lastMessageTimestamp || 0;
    const bTimestamp = (b as any)._lastMessageTimestamp || 0;
    return bTimestamp - aTimestamp; // Descending order (newest first)
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

