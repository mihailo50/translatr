import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Check, MessageSquare, UserPlus, Info, Lock } from 'lucide-react';
import { createClient } from '../../utils/supabase/client';
import { toast } from 'sonner';
import { useNotification } from '../contexts/NotificationContext';

interface NotificationContent {
  sender_name?: string;
  preview?: string;
  avatar_url?: string;
}

interface Notification {
  id: string;
  type: 'message' | 'contact_request' | 'system';
  content: NotificationContent;
  is_read: boolean;
  created_at: string;
  related_id?: string;
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const { isNotificationsOpen, setIsNotificationsOpen, currentRoomId } = useNotification();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; right: number } | null>(null);
  const notificationSoundRef = useRef<HTMLAudioElement | null>(null);
  const currentRoomIdRef = useRef<string | null>(null);
  const roomEntryTimeRef = useRef<Map<string, number>>(new Map()); // Track when user entered each room
  const audioUnlockedRef = useRef<boolean>(false);
  const pendingSoundQueueRef = useRef<Array<() => void>>([]);
  const supabase = createClient();
  
  // Initialize notification sound and unlock audio on user interaction
  useEffect(() => {
    // Create and preload audio
    const audio = new Audio('/sounds/new-notification.mp3');
    audio.volume = 0.5;
    audio.preload = 'auto';
    
    // Handle audio loading
    audio.addEventListener('canplaythrough', () => {
      // Notification sound ready
    });
    
    audio.addEventListener('error', (e) => {
      console.error('❌ Audio loading error:', e);
      console.error('Audio file path: /sounds/new-notification.mp3');
    });
    
    notificationSoundRef.current = audio;
    
    // Unlock audio on first user interaction (required by browsers)
    const unlockAudio = async () => {
      if (notificationSoundRef.current && !audioUnlockedRef.current) {
        try {
          await notificationSoundRef.current.play();
          notificationSoundRef.current.pause();
          notificationSoundRef.current.currentTime = 0;
          audioUnlockedRef.current = true;
          
          // Play any queued sounds
          pendingSoundQueueRef.current.forEach(playFn => playFn());
          pendingSoundQueueRef.current = [];
        } catch (err: any) {
          // Audio unlock failed
        }
      }
    };
    
    // Try to unlock on various user interactions
    const events = ['click', 'touchstart', 'keydown', 'mousedown', 'pointerdown'];
    const handlers: Array<() => void> = [];
    
    events.forEach(event => {
      const handler = () => {
        if (!audioUnlockedRef.current) {
          unlockAudio();
        }
      };
      handlers.push(handler);
      document.addEventListener(event, handler, { once: false, passive: true });
    });
    
    return () => {
      if (notificationSoundRef.current) {
        notificationSoundRef.current.pause();
        notificationSoundRef.current = null;
      }
      events.forEach((event, i) => {
        if (handlers[i]) {
          document.removeEventListener(event, handlers[i]);
        }
      });
    };
  }, []);
  
  // Keep currentRoomIdRef in sync with currentRoomId
  // Track when user enters each room to prevent playing sounds for old notifications
  useEffect(() => {
    const previousRoomId = currentRoomIdRef.current;
    currentRoomIdRef.current = currentRoomId;
    
    // If user entered a new room, record the entry time
    // This prevents old notifications from triggering sounds when polling detects them
    if (currentRoomId && currentRoomId !== previousRoomId) {
      const entryTime = Date.now();
      roomEntryTimeRef.current.set(currentRoomId, entryTime);
    } else if (!currentRoomId) {
      // User left all rooms
    }
  }, [currentRoomId]);

  // Calculate dropdown position when it opens
  useEffect(() => {
    if (isNotificationsOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 16, // 16px spacing (mt-4 equivalent)
        right: window.innerWidth - rect.right
      });
    } else {
      setDropdownPosition(null);
    }
  }, [isNotificationsOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (dropdownRef.current && !dropdownRef.current.contains(target) && 
          buttonRef.current && !buttonRef.current.contains(target)) {
        setIsNotificationsOpen(false);
      }
    };
    if (isNotificationsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isNotificationsOpen, setIsNotificationsOpen]);

  // Fetch Initial Notifications & Subscribe to Realtime
  useEffect(() => {
    let channel: any = null;
    let mounted = true;
    let pollInterval: NodeJS.Timeout | null = null;
    let lastNotificationId: string | null = null;
    const processedNotificationIds = new Set<string>(); // Track processed notifications to prevent duplicates
    let initialFetchDone = false; // Track if initial fetch is complete
    let initialFetchTimestamp: number | null = null; // Track when initial fetch happened

    const fetchNotifications = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mounted) return;

      // Clean up old read notifications (older than 7 days) before fetching
      // This follows standard practice: read notifications are kept for 7 days, then automatically deleted
      try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        const { error: deleteError } = await supabase
          .from('notifications')
          .delete()
          .eq('recipient_id', user.id)
          .eq('is_read', true)
          .not('read_at', 'is', null)
          .lt('read_at', sevenDaysAgo.toISOString());
        
        // Only log errors if they have meaningful information
        // Supabase sometimes returns empty error objects {} for successful operations
        // or error objects with all null/undefined/empty properties
        if (deleteError) {
          // First check if it's a completely empty object
          const errorKeys = Object.keys(deleteError);
          if (errorKeys.length === 0) {
            // Empty object {} - ignore silently
            return;
          }
          
          const errorMessage = (deleteError as any).message;
          const errorCode = (deleteError as any).code;
          const errorDetails = (deleteError as any).details;
          const errorHint = (deleteError as any).hint;
          
          // Check if error has any meaningful content (not just empty strings or null/undefined)
          const hasMeaningfulError = 
            (errorMessage && typeof errorMessage === 'string' && errorMessage.trim().length > 0) ||
            (errorCode && typeof errorCode === 'string' && errorCode.trim().length > 0) ||
            (errorDetails && typeof errorDetails === 'string' && errorDetails.trim().length > 0) ||
            (errorHint && typeof errorHint === 'string' && errorHint.trim().length > 0);
          
          // Only log if at least one meaningful property exists
          if (hasMeaningfulError) {
            console.error('Error cleaning up old notifications:', {
              message: errorMessage,
              code: errorCode,
              details: errorDetails,
              hint: errorHint
            });
          }
          // Silently ignore empty error objects - they indicate successful operations
        }
        // If no error or empty error object, cleanup was successful
      } catch (err) {
        console.error('Error during notification cleanup:', err instanceof Error ? err.message : err);
      }

      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (data && mounted) {
        // Check if there are new notifications (only via polling, real-time handles its own)
        if (lastNotificationId && data.length > 0 && data[0].id !== lastNotificationId) {
          // New notification detected via polling - only process if not already processed
          const newNotifications = data.filter(n => {
            // Skip if already processed
            if (processedNotificationIds.has(n.id)) {
              return false;
            }
            
            // Skip if notification is for current room and was created before user entered
            if (n.type === 'message' && n.related_id === currentRoomIdRef.current) {
              const roomEntryTime = roomEntryTimeRef.current.get(n.related_id);
              if (roomEntryTime) {
                const notificationTime = new Date(n.created_at).getTime();
                if (notificationTime < roomEntryTime) {
                  console.log('🔇 Polling: Skipping old notification for current room', n.id);
                  // Mark as processed to avoid checking again
                  processedNotificationIds.add(n.id);
                  return false;
                }
              }
            }
            
            return n.id !== lastNotificationId;
          });
          
          newNotifications.forEach(newNotification => {
            // Don't mark as processed here - let handleNewNotification do it after sound plays
            handleNewNotification(newNotification as Notification);
          });
        }
        
        setNotifications(data as any);
        setUnreadCount(data.filter((n: any) => !n.is_read).length);
        if (data.length > 0) {
          lastNotificationId = data[0].id;
          // Mark initial notifications as processed to avoid showing them again
          if (!initialFetchDone) {
            const now = Date.now();
            initialFetchTimestamp = now;
            data.forEach((n: any) => {
              processedNotificationIds.add(n.id);
            });
            initialFetchDone = true;
            console.log(`📋 Marked ${data.length} initial notifications as processed (timestamp: ${now})`);
          }
        }
      }
    };

    const handleNewNotification = (newNotification: Notification) => {
      if (!mounted) return;
      
      // Prevent duplicate processing - check BEFORE processing
      if (processedNotificationIds.has(newNotification.id)) {
        console.log('⏭️ Skipping duplicate notification:', newNotification.id);
        return;
      }
      
      // If this notification was created before the initial fetch, don't process it
      // This prevents sounds from playing on page reload
      if (initialFetchTimestamp !== null) {
        const notificationTime = new Date(newNotification.created_at).getTime();
        if (notificationTime < initialFetchTimestamp) {
          console.log('🔇 Skipping notification created before initial fetch (page reload):', {
            notificationId: newNotification.id,
            notificationTime: new Date(notificationTime).toISOString(),
            initialFetchTime: new Date(initialFetchTimestamp).toISOString()
          });
          processedNotificationIds.add(newNotification.id);
          return;
        }
      }
      
      // Mark as processed to prevent duplicates
      processedNotificationIds.add(newNotification.id);
      
      // Check if user is currently viewing this chatroom
      const isInCurrentRoom = (newNotification.type === 'message' || newNotification.type === 'call') && 
                             newNotification.related_id === currentRoomIdRef.current;
      
      // If notification is for the current room, check if it was created before user entered
      // This prevents playing sounds for old notifications when user enters a chatroom
      if (isInCurrentRoom) {
        const roomEntryTime = roomEntryTimeRef.current.get(newNotification.related_id!);
        const notificationTime = new Date(newNotification.created_at).getTime();
        
        // If user entered the room before this notification was created, it's an old notification
        // Don't process it - just delete it silently
        if (roomEntryTime && notificationTime < roomEntryTime) {
          // Delete the old notification since user is in the room
          void (async () => {
            try {
              await supabase
                .from('notifications')
                .delete()
                .eq('id', newNotification.id)
                .select();
            } catch (err) {
              console.error('Error deleting notification:', err);
            }
          })();
          
          return; // Don't process this notification further
        }
        
        // User is in the chatroom and this is a NEW notification (created after they entered)
        // Delete the notification immediately since they're already viewing it
        // The ChatRoom component will handle the call modal/sound
        void (async () => {
          try {
            await supabase
              .from('notifications')
              .delete()
              .eq('id', newNotification.id)
              .select();
          } catch (err) {
            console.error('Error deleting notification:', err);
          }
        })();
        
        return; // Don't show notification or play sound - ChatRoom handles it
      }
      
      // Check if notifications are muted for this room
      // Only apply mute check to message/call notifications (not contact requests)
      const checkIfMuted = () => {
        // Contact requests should never be muted
        if (newNotification.type === 'contact_request') {
          return false;
        }
        if (newNotification.related_id) {
          const mutedStatus = localStorage.getItem(`mute_notifications_${newNotification.related_id}`);
          return mutedStatus === 'true';
        }
        return false;
      };
      
      const isMuted = checkIfMuted();
      
      // Play sound function
      const playSound = () => {
        // Don't play sound if notifications are muted for this room
        if (isMuted) {
          console.log('🔇 Notification sound muted for this room');
          return;
        }
        
        // If audio is not unlocked, queue it and try to unlock
        if (!audioUnlockedRef.current) {
          pendingSoundQueueRef.current.push(playSound);
          
          // Try to unlock immediately by attempting to play
          if (notificationSoundRef.current) {
            notificationSoundRef.current.play()
              .then(() => {
                notificationSoundRef.current?.pause();
                notificationSoundRef.current!.currentTime = 0;
                audioUnlockedRef.current = true;
                console.log('🔊 Audio unlocked! Playing queued sound...');
                // Play the sound now that it's unlocked
                playSound();
              })
              .catch(() => {
                console.log('⏳ Audio still locked, will play after user interaction');
              });
          }
          return;
        }
        
        // Strategy 1: Try preloaded audio
        if (notificationSoundRef.current) {
          try {
            notificationSoundRef.current.currentTime = 0;
            const playPromise = notificationSoundRef.current.play();
            
            if (playPromise !== undefined) {
              playPromise
                .then(() => {
                  console.log('🔊 Notification sound played successfully (preloaded)');
                })
                .catch((err: any) => {
                  console.warn('Preloaded audio failed:', err.name, err.message);
                  // Fall through to Strategy 2
                  playSoundFallback();
                });
            } else {
              playSoundFallback();
            }
          } catch (err: any) {
            console.warn('Preloaded audio error:', err);
            playSoundFallback();
          }
        } else {
          playSoundFallback();
        }
      };
      
      // Strategy 2: Create fresh audio instance
      const playSoundFallback = () => {
        try {
          const sound = new Audio('/sounds/new-notification.mp3');
          sound.volume = 0.5;
          sound.currentTime = 0;
          
          // Add event listeners for debugging
          sound.addEventListener('play', () => {
            console.log('🔊 Sound started playing');
          });
          
          sound.addEventListener('error', (e) => {
            console.error('❌ Audio error event:', e);
          });
          
          const playPromise = sound.play();
          
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                console.log('🔊 Notification sound played successfully (fresh instance)');
              })
              .catch((err: any) => {
                console.error('❌ Sound playback failed:', err.name, err.message);
                if (err.name === 'NotAllowedError') {
                  console.warn('💡 Browser blocked autoplay - user needs to interact with page first');
                  console.warn('💡 Try clicking anywhere on the page to unlock audio');
                  // Queue this sound to play after unlock
                  if (!audioUnlockedRef.current) {
                    pendingSoundQueueRef.current.push(playSoundFallback);
                  }
                } else if (err.name === 'NotSupportedError') {
                  console.error('❌ Audio format not supported');
                } else {
                  console.error('❌ Unknown audio error:', err);
                }
              });
          }
        } catch (createErr: any) {
          console.error('Failed to create audio:', createErr);
        }
      };
      
      // Play sound for notification (only if not muted)
      playSound();
      
      // If notifications are muted for this room, don't add to notification list
      if (isMuted) {
        console.log('🔇 Notification muted for this room, not showing banner');
        // Mark as read immediately so it doesn't show up later
        void (async () => {
          try {
            await supabase
              .from('notifications')
              .update({ is_read: true, read_at: new Date().toISOString() })
              .eq('id', newNotification.id);
          } catch (err) {
            console.error('Error marking muted notification as read:', err);
          }
        })();
        return; // Don't add to notification list
      }
      
      // Update state
      setNotifications((prev) => {
        // Double-check for duplicates in state
        if (prev.some(n => n.id === newNotification.id)) {
          return prev;
        }
        return [newNotification, ...prev];
      });
      setUnreadCount((prev) => prev + 1);

      // Show Toast notification
      toast(
          <div className="flex items-center gap-3">
              <div className="p-2 bg-white/10 rounded-full">
                  {getIcon(newNotification.type)}
              </div>
              <div>
                  <p className="font-semibold text-sm text-white">{newNotification.content.sender_name || 'System'}</p>
                  <p className="text-xs text-white/60 line-clamp-1">{newNotification.content.preview || 'New notification'}</p>
              </div>
          </div>,
          {
              style: { background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }
          }
      );
    };

    const setupNotifications = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mounted) return;

      // Fetch initial notifications
      await fetchNotifications();

      // Set up real-time subscription with retry logic
      const setupSubscription = (retryCount = 0) => {
        if (!mounted) return;
        
        // Clean up existing channel if any
        if (channel) {
          supabase.removeChannel(channel);
        }

        // Create a simpler channel configuration
        channel = supabase
          .channel(`notifications_${user.id}_${Date.now()}`, {
            config: {
              broadcast: { self: false }
            }
          })
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'notifications',
              filter: `recipient_id=eq.${user.id}`,
            },
            (payload) => {
              const newNotification = payload.new as Notification;
              handleNewNotification(newNotification);
            }
          )
          .subscribe((status, err) => {
            console.log('📡 Notification subscription status:', status, err ? `Error: ${err.message || 'Unknown error'}` : '');
            if (status === 'SUBSCRIBED') {
              console.log('✅ Successfully subscribed to notifications');
            } else if (status === 'CHANNEL_ERROR' || status === 'SUBSCRIPTION_ERROR') {
              const errorMsg = err?.message || 'Unknown error';
              console.error('❌ Notification channel error:', errorMsg);
              
              // Check if it's a replication issue
              if (errorMsg.includes('replication') || errorMsg.includes('publication') || errorMsg.toLowerCase().includes('unknown')) {
                console.warn('⚠️ Real-time replication may not be enabled for notifications table. Using polling fallback.');
                console.warn('💡 To enable real-time: Run: ALTER PUBLICATION supabase_realtime ADD TABLE notifications;');
              }
              
              // Retry subscription after a delay (max 3 retries)
              if (retryCount < 3 && mounted) {
                console.log(`🔄 Retrying subscription (attempt ${retryCount + 1}/3)...`);
                setTimeout(() => {
                  setupSubscription(retryCount + 1);
                }, 2000 * (retryCount + 1)); // Exponential backoff
              } else {
                console.warn('⚠️ Max retries reached, will use polling fallback');
              }
            } else if (status === 'TIMED_OUT') {
              console.warn('⏱️ Notification subscription timed out');
              // Retry on timeout
              if (retryCount < 3 && mounted) {
                console.log(`🔄 Retrying subscription after timeout (attempt ${retryCount + 1}/3)...`);
                setTimeout(() => {
                  setupSubscription(retryCount + 1);
                }, 2000 * (retryCount + 1));
              }
            } else if (status === 'CLOSED') {
              console.warn('🔌 Notification channel closed');
              // Retry if closed unexpectedly
              if (retryCount < 2 && mounted) {
                setTimeout(() => {
                  setupSubscription(retryCount + 1);
                }, 3000);
              }
            }
          });
      };

      setupSubscription();

      // Fallback: Poll for new notifications every 200ms for ultra-fast delivery
      // This ensures notifications arrive quickly even if real-time has issues
      pollInterval = setInterval(() => {
        if (mounted) {
          fetchNotifications();
        }
      }, 200);
    };

    setupNotifications();

    // Cleanup function
    return () => {
      mounted = false;
      if (channel) {
        console.log('🧹 Cleaning up notification subscription');
        supabase.removeChannel(channel);
      }
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, []); // Empty deps - only run once on mount

  const handleNotificationClick = async (notification: Notification) => {
    // 1. Mark as read in DB
    if (!notification.is_read) {
        await supabase
            .from('notifications')
            .update({ 
                is_read: true,
                read_at: new Date().toISOString()
            })
            .eq('id', notification.id);
        
        // Optimistic Update
        setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, is_read: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));
    }

    // 2. Redirect based on type
    setIsNotificationsOpen(false);
    if (notification.type === 'message' && notification.related_id) {
        window.location.href = `/chat/${notification.related_id}`;
    } else if (notification.type === 'contact_request') {
        window.location.href = '/contacts';
    }
  };

  const markAllRead = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
        .from('notifications')
        .update({ 
            is_read: true,
            read_at: new Date().toISOString()
        })
        .eq('recipient_id', user.id)
        .eq('is_read', false);

    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const getIcon = (type: string) => {
      switch(type) {
          case 'message': return <MessageSquare size={14} className="text-aurora-indigo" />;
          case 'contact_request': return <UserPlus size={14} className="text-aurora-pink" />;
          default: return <Info size={14} className="text-white/60" />;
      }
  };

  return (
    <>
      <div className="relative">
        <button 
          ref={buttonRef}
          onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
          className={`relative p-2 rounded-full transition-colors z-[101] ${isNotificationsOpen ? 'bg-white/10 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
        >
          <Bell size={20} />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-aurora-slate shadow-[0_0_8px_rgba(239,68,68,0.6)]"></span>
          )}
        </button>
      </div>

      {isNotificationsOpen && dropdownPosition && typeof document !== 'undefined' && createPortal(
        <div 
          ref={dropdownRef}
          className="fixed w-80 rounded-2xl border border-white/20 overflow-hidden z-[9999] animate-in fade-in zoom-in-95 duration-200 shadow-[0_20px_50px_rgba(0,0,0,0.7)]"
          style={{
            top: `${dropdownPosition.top}px`,
            right: `${dropdownPosition.right}px`,
            background: 'rgba(10, 10, 20, 0.95)',
            backdropFilter: 'blur(25px)',
            WebkitBackdropFilter: 'blur(25px)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
              {/* Header with proper padding and softened separator */}
              <div className="relative px-6 py-5 border-b border-white/5 flex items-center justify-between">
                  <h3 className="font-bold text-white text-base">Notifications</h3>
                  {unreadCount > 0 && (
                      <button 
                          onClick={markAllRead}
                          className="text-xs font-medium text-aurora-indigo hover:text-aurora-purple transition-colors flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-white/5"
                      >
                          <Check size={12} /> Mark all read
                      </button>
                  )}
              </div>

              <div className="relative max-h-[400px] overflow-y-auto scrollbar-thin">
                {notifications.length === 0 ? (
                    <div className="p-8 text-center opacity-40">
                        <Bell size={32} className="mx-auto mb-2 opacity-50" />
                        <p className="text-sm text-white/60">No notifications yet</p>
                    </div>
                ) : (
                    notifications.map((n) => {
                        const isEncrypted = n.content.preview?.includes('🔒') || n.content.preview?.toLowerCase().includes('encrypted');
                        return (
                            <div 
                                key={n.id}
                                onClick={() => handleNotificationClick(n)}
                                className={`
                                    relative px-6 py-4 flex gap-3 cursor-pointer transition-all duration-200 border-b border-white/5 last:border-0 hover:bg-white/5
                                    ${n.is_read ? 'opacity-75 hover:opacity-100' : ''}
                                `}
                            >
                                <div className="flex-shrink-0 mt-0.5">
                                    {n.content.avatar_url ? (
                                        <img src={n.content.avatar_url} alt="" className="w-9 h-9 rounded-full bg-slate-800/50 object-cover border border-white/10" />
                                    ) : (
                                        <div className="w-9 h-9 rounded-full bg-slate-800/50 flex items-center justify-center border border-white/10 backdrop-blur-sm">
                                            {getIcon(n.type)}
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start mb-1">
                                        <p className="text-sm font-bold text-white truncate pr-2">
                                            {n.content.sender_name || 'System'}
                                        </p>
                                        <span className="text-[10px] text-white/60 whitespace-nowrap ml-2">
                                            {getTimeAgo(n.created_at)}
                                        </span>
                                    </div>
                                    <div className="flex items-start gap-1.5">
                                        {isEncrypted && (
                                            <Lock size={12} className="text-aurora-indigo/90 mt-0.5 flex-shrink-0" />
                                        )}
                                        <p className={`text-xs line-clamp-2 leading-relaxed break-words ${
                                            isEncrypted 
                                                ? 'text-aurora-indigo/90 font-medium' 
                                                : 'text-white/70'
                                        }`}>
                                            {n.content.preview || 'New message'}
                                        </p>
                                    </div>
                                </div>
                                {!n.is_read && (
                                    <div className="self-center w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)] flex-shrink-0"></div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>,
        document.body
      )}
    </>
  );
}

function getTimeAgo(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return date.toLocaleDateString();
}