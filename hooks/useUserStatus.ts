import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '../utils/supabase/client';
import { User } from '@supabase/supabase-js';
import { RealtimeChannel } from '@supabase/supabase-js';

export type UserStatus = 'online' | 'busy' | 'dnd' | 'invisible' | 'in-call' | 'offline' | 'away';

export interface PresenceState {
  user_id: string;
  status: UserStatus;
  last_seen: string;
}

export const useUserStatus = (user: any) => {
  const [status, setStatus] = useState<UserStatus>('online');
  const [onlineUsers, setOnlineUsers] = useState<Record<string, UserStatus>>({});
  const supabase = createClient();
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);

  // Supabase profile.status only allows: online, offline, away, invisible.
  // Map richer presence values to the allowed set when persisting.
  const mapToPersistedStatus = useCallback((s: UserStatus) => {
    if (s === 'invisible') return 'invisible' as const;
    if (s === 'offline') return 'offline' as const;
    if (s === 'online') return 'online' as const;
    // busy, dnd, in-call → fall back to "away" which fits the DB constraint
    return 'away' as const;
  }, []);

  // 1. Load persisted status from DB on mount
  useEffect(() => {
    if (!user?.id) return;
    
    const fetchStatus = async () => {
        const { data } = await supabase
            .from('profiles')
            .select('status')
            .eq('id', user.id)
            .single();
        
        const currentStatus = data?.status as UserStatus | undefined;

        // If status is missing or offline, treat the active session as online
        // to avoid stale "offline" indicators after server restarts or cold starts.
        if (!currentStatus || currentStatus === 'offline') {
            setStatus('online');
            await supabase
              .from('profiles')
              .update({ status: 'online' })
              .eq('id', user.id);
        } else {
            // Map DB-only "away" to an online-ish state for UI/presence
            const effective = currentStatus === 'away' ? 'online' : currentStatus;
            setStatus(effective);
        }
    };
    fetchStatus();
  }, [mapToPersistedStatus, supabase, user?.id]);

  // Helper to track presence based on current status
  const trackPresence = useCallback(async (uid: string, currentStatus: UserStatus, channel: RealtimeChannel) => {
      // Always track presence, even for invisible users, so others can see the status update
      // For invisible, we still track but with 'invisible' status so other users know they exist
      await channel.track({
          user_id: uid,
          status: currentStatus,
          last_seen: new Date().toISOString()
      });
  }, []);

  // 2. Handle Realtime Presence (Broadcasting & Listening)
  useEffect(() => {
    if (!user?.id) return;

    // We use a global channel for app-wide presence
    const channel = supabase.channel(`global_presence_${Date.now()}`, {
        config: {
            presence: {
                key: user.id,
            },
        },
    });

    presenceChannelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const newState = channel.presenceState();
        const userMap: Record<string, UserStatus> = {};
        
        for (const key in newState) {
            const presence = newState[key][0] as any;
            if (presence && presence.status) {
                userMap[presence.user_id] = presence.status;
            }
        }
        setOnlineUsers(prev => ({ ...prev, ...userMap }));
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        const userMap: Record<string, UserStatus> = {};
        newPresences.forEach((presence: any) => {
          if (presence.status) {
            userMap[presence.user_id] = presence.status;
          }
        });
        setOnlineUsers(prev => ({ ...prev, ...userMap }));
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        const userMap: Record<string, UserStatus> = {};
        leftPresences.forEach((presence: any) => {
          if (presence.user_id) {
            userMap[presence.user_id] = 'offline';
          }
        });
        setOnlineUsers(prev => {
          const updated = { ...prev };
          Object.keys(userMap).forEach(userId => {
            delete updated[userId];
          });
          return updated;
        });
      })
      .subscribe(async (subStatus) => {
          if (subStatus === 'SUBSCRIBED') {
             // Initial Track
             await trackPresence(user.id, status, channel);
          }
      });

    // Re-track whenever status changes
    trackPresence(user.id, status, channel);

    return () => {
        presenceChannelRef.current = null;
        supabase.removeChannel(channel);
    };
  }, [user?.id, status, trackPresence]);

  // 3. Real-time subscription to profiles table for status changes
  useEffect(() => {
    if (!user?.id) return;

    const profilesChannel = supabase
      .channel(`profiles_status_${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: 'status=neq.null',
        },
        (payload) => {
          const updatedUser = payload.new as any;
          if (updatedUser.id && updatedUser.status) {
            const dbStatus = updatedUser.status as string;
            // Map DB status to UserStatus
            let mappedStatus: UserStatus = dbStatus as UserStatus;
            if (dbStatus === 'away') {
              mappedStatus = 'online'; // Map away to online for UI
            }
            
            setOnlineUsers(prev => ({
              ...prev,
              [updatedUser.id]: mappedStatus
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(profilesChannel);
    };
  }, [user?.id, supabase]);

  // 4. Action to update status
  const updateUserStatus = useCallback(async (newStatus: UserStatus) => {
      if (!user?.id) return;
      
      // Update local state immediately
      setStatus(newStatus);

      // Immediately update presence tracking (don't wait for useEffect)
      if (presenceChannelRef.current) {
        await trackPresence(user.id, newStatus, presenceChannelRef.current);
      }

      // Persist to DB with schema-safe value (non-blocking for speed)
      const persisted = mapToPersistedStatus(newStatus);
      supabase
        .from('profiles')
        .update({ status: persisted })
        .eq('id', user.id)
        .then(() => {
          console.log('✅ Status updated in database:', persisted);
        })
        .catch((error) => {
          console.error('❌ Failed to update status in database:', error);
        });
        
  }, [mapToPersistedStatus, supabase, user?.id, trackPresence]);

  return {
    status,
    updateUserStatus,
    onlineUsers // Map of userId -> status
  };
};