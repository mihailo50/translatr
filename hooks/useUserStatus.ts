import { useState, useEffect, useCallback } from 'react';
import { createClient } from '../utils/supabase/client';
import { User } from '@supabase/supabase-js';

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

  // 2. Handle Realtime Presence (Broadcasting & Listening)
  useEffect(() => {
    if (!user?.id) return;

    // We use a global channel for app-wide presence
    const channel = supabase.channel('global_presence', {
        config: {
            presence: {
                key: user.id,
            },
        },
    });

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
        setOnlineUsers(userMap);
      })
      .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
             // Initial Track
             await trackPresence(user.id);
          }
      });

    // Helper to track presence based on current status
    const trackPresence = async (uid: string) => {
        if (status === 'invisible') {
             // If invisible, we untrack or track as offline? 
             // Best practice for invisible: Don't track, or track as offline if you want them to receive "offline" messages.
             // Here we simply won't track in the public channel, making them appear offline.
             await channel.untrack();
        } else {
             await channel.track({
                 user_id: uid,
                 status: status,
                 last_seen: new Date().toISOString()
             });
        }
    };

    // Re-track whenever status changes
    trackPresence(user.id);

    return () => {
        supabase.removeChannel(channel);
    };
  }, [user?.id, status]);

  // 3. Action to update status
  const updateUserStatus = useCallback(async (newStatus: UserStatus) => {
      if (!user?.id) return;
      
      setStatus(newStatus);

      // Persist to DB with schema-safe value
      const persisted = mapToPersistedStatus(newStatus);
      await supabase
        .from('profiles')
        .update({ status: persisted })
        .eq('id', user.id);
        
  }, [mapToPersistedStatus, supabase, user?.id]);

  return {
    status,
    updateUserStatus,
    onlineUsers // Map of userId -> status
  };
};