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
  const [lastSeenMap, setLastSeenMap] = useState<Record<string, number>>({}); // Track last seen timestamps
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
        const seenMap: Record<string, number> = {};
        const now = Date.now();
        
        for (const key in newState) {
            const presence = newState[key][0] as any;
            if (presence && presence.status) {
                userMap[presence.user_id] = presence.status;
                // Track last seen timestamp
                if (presence.last_seen) {
                    seenMap[presence.user_id] = new Date(presence.last_seen).getTime();
                } else {
                    seenMap[presence.user_id] = now;
                }
            }
        }
        setOnlineUsers(prev => ({ ...prev, ...userMap }));
        setLastSeenMap(prev => ({ ...prev, ...seenMap }));
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        const userMap: Record<string, UserStatus> = {};
        const seenMap: Record<string, number> = {};
        const now = Date.now();
        
        newPresences.forEach((presence: any) => {
          if (presence.status) {
            userMap[presence.user_id] = presence.status;
            // Track last seen timestamp
            if (presence.last_seen) {
                seenMap[presence.user_id] = new Date(presence.last_seen).getTime();
            } else {
                seenMap[presence.user_id] = now;
            }
          }
        });
        setOnlineUsers(prev => ({ ...prev, ...userMap }));
        setLastSeenMap(prev => ({ ...prev, ...seenMap }));
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
          // Set status to offline instead of deleting, so UI can show offline state
          Object.keys(userMap).forEach(userId => {
            updated[userId] = 'offline';
            // Also update database status to offline (fire and forget)
            void (async () => {
              try {
                await supabase
                  .from('profiles')
                  .update({ status: 'offline' })
                  .eq('id', userId);
              } catch (err) {
                console.error('Failed to update offline status:', err);
              }
            })();
          });
          return updated;
        });
        // Remove from last seen map
        setLastSeenMap(prev => {
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

    // Heartbeat: Update last_seen periodically to show we're still active
    const heartbeatInterval = setInterval(() => {
      if (presenceChannelRef.current && user?.id) {
        trackPresence(user.id, status, presenceChannelRef.current);
      }
    }, 30000); // Every 30 seconds

    // Check for stale presence: Mark users as offline if no update in 90 seconds
    const staleCheckInterval = setInterval(() => {
      const now = Date.now();
      const STALE_THRESHOLD = 90000; // 90 seconds (reduced from 2 minutes for faster detection)
      
      setLastSeenMap(prev => {
        setOnlineUsers(currentUsers => {
          const updated = { ...currentUsers };
          let hasChanges = false;
          
          Object.keys(prev).forEach(userId => {
            const lastSeen = prev[userId];
            if (now - lastSeen > STALE_THRESHOLD && updated[userId] !== 'offline') {
              updated[userId] = 'offline';
              hasChanges = true;
              
              // Also update database status to offline
              void (async () => {
                try {
                  await supabase
                    .from('profiles')
                    .update({ status: 'offline' })
                    .eq('id', userId);
                } catch (err) {
                  console.error(`❌ Failed to update user ${userId} status to offline:`, err);
                }
              })();
            }
          });
          
          return hasChanges ? updated : currentUsers;
        });
        return prev;
      });
    }, 15000); // Check every 15 seconds (more frequent checks)

    // Handle page unload - set status to offline
    const handleBeforeUnload = () => {
      if (user?.id) {
        const persisted = mapToPersistedStatus('offline');
        // Try to update status (may not complete if page is closing)
        void (async () => {
          try {
            await supabase
              .from('profiles')
              .update({ status: persisted })
              .eq('id', user.id);
          } catch (err) {
            // Ignore errors on unload
          }
        })();
      }
    };

    // Handle visibility change - set offline when tab is hidden for too long
    let hiddenTimeoutRef: { current: NodeJS.Timeout | null } = { current: null };
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // After 5 minutes of being hidden, mark as offline
        hiddenTimeoutRef.current = setTimeout(() => {
          if (user?.id && document.hidden) {
            const persisted = mapToPersistedStatus('offline');
            setStatus('offline');
            void (async () => {
              try {
                await supabase
                  .from('profiles')
                  .update({ status: persisted })
                  .eq('id', user.id);
              } catch (err) {
                console.error('Failed to update status to offline:', err);
              }
            })();
          }
        }, 300000); // 5 minutes
      } else {
        // Tab is visible again, mark as online
        if (hiddenTimeoutRef.current) {
          clearTimeout(hiddenTimeoutRef.current);
          hiddenTimeoutRef.current = null;
        }
        if (user?.id && status === 'offline') {
          setStatus('online');
          const persisted = mapToPersistedStatus('online');
          void (async () => {
            try {
              await supabase
                .from('profiles')
                .update({ status: persisted })
                .eq('id', user.id);
            } catch (err) {
              console.error('Failed to update status to online:', err);
            }
          })();
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
        presenceChannelRef.current = null;
        clearInterval(heartbeatInterval);
        clearInterval(staleCheckInterval);
        window.removeEventListener('beforeunload', handleBeforeUnload);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        if (hiddenTimeoutRef.current) clearTimeout(hiddenTimeoutRef.current);
        supabase.removeChannel(channel);
    };
  }, [user?.id, status, trackPresence, mapToPersistedStatus, supabase]);

  // 3. Real-time subscription to profiles table for status changes
  // This ensures status updates from DB are reflected in real-time across all users
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
      .subscribe((status) => {
        // Subscription status (no logging)
      });

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
          // Status persisted
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