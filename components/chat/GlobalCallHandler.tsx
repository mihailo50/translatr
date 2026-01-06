'use client';

import React, { useEffect, useState, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter, usePathname } from 'next/navigation';
import CallNotificationBanner from './CallNotificationBanner';
import { useNotification } from '../contexts/NotificationContext';
import { toast } from 'sonner';

interface CallNotification {
  id: string;
  recipient_id: string;
  type: 'call';
  content: {
    sender_name: string;
    call_type: 'audio' | 'video';
    call_id: string;
    room_id: string;
  };
  related_id: string;
  created_at: string;
}

export default function GlobalCallHandler() {
  const supabase = createClient();
  const router = useRouter();
  const pathname = usePathname();
  const { currentRoomId } = useNotification();
  const [incomingCall, setIncomingCall] = useState<CallNotification | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const processedCallIdsRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);
  const ringtoneIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioUnlockedRef = useRef<boolean>(false);
  const pendingRingtoneRef = useRef<boolean>(false);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    
    // Initialize ringtone audio
    const audio = new Audio('/sounds/ringtone.mp3');
    audio.volume = 0.7;
    audio.loop = true;
    audio.preload = 'auto';
    ringtoneRef.current = audio;
    
    // Unlock audio on user interaction
    const unlockAudio = async () => {
      try {
        audioUnlockedRef.current = true;
        // If we had a pending ringtone, start it now
        if (pendingRingtoneRef.current && ringtoneRef.current) {
          pendingRingtoneRef.current = false;
          try { await ringtoneRef.current.play(); } catch {}
        }
      } catch (e) {
        console.log('Ringtone audio unlock:', e);
      }
    };
    
    const events = ['click', 'touchstart', 'keydown', 'mousedown', 'pointerdown'];
    const handlers: Array<() => void> = [];
    
    events.forEach(event => {
      const handler = () => {
        unlockAudio();
        // Keep listeners active for multiple interactions
      };
      handlers.push(handler);
      document.addEventListener(event, handler, { once: false, passive: true });
    });
    
    return () => {
      mountedRef.current = false;
      stopRingtone();
      events.forEach((event, i) => {
        if (handlers[i]) {
          document.removeEventListener(event, handlers[i]);
        }
      });
    };
  }, []);
  
  const playRingtone = async () => {
    if (ringtoneRef.current) {
      try {
        ringtoneRef.current.currentTime = 0;
        await ringtoneRef.current.play();
        console.log('✅ Ringtone playing (GlobalCallHandler)');
      } catch (err: any) {
        console.log('Could not play ringtone:', err);
        // Queue pending play until audio is unlocked via user interaction
        pendingRingtoneRef.current = true;
      }
    }
  };
  
  const stopRingtone = () => {
    if (ringtoneRef.current) {
      ringtoneRef.current.pause();
      ringtoneRef.current.currentTime = 0;
    }
    if (ringtoneIntervalRef.current) {
      clearInterval(ringtoneIntervalRef.current);
      ringtoneIntervalRef.current = null;
    }
    pendingRingtoneRef.current = false;
  };

  const clearIncomingCallUI = async (reason: string) => {
    console.log(`📞 Clearing incoming call UI: ${reason}`);
    stopRingtone();
    setShowBanner(false);
    setIncomingCall(null);
  };

  useEffect(() => {
    const setupCallListener = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mountedRef.current) return;
      userIdRef.current = user.id;

      // Fetch initial unread call notifications
      const { data: existingCalls } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', user.id)
        .eq('type', 'call')
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(1);

      if (existingCalls && existingCalls.length > 0 && mountedRef.current) {
        const latestCall = existingCalls[0] as CallNotification;
        if (!processedCallIdsRef.current.has(latestCall.id)) {
          // Check if user is currently in the chatroom for this call
          const callRoomId = latestCall.content.room_id;
          const isInChatroom = currentRoomId === callRoomId || pathname === `/chat/${callRoomId}`;
          
          if (isInChatroom) {
            console.log('⏭️ User is in chatroom, skipping existing call banner');
            // Mark notification as read
            await supabase
              .from('notifications')
              .update({ is_read: true, read_at: new Date().toISOString() })
              .eq('id', latestCall.id);
            return; // Don't show banner if user is in the chatroom
          }
          
          processedCallIdsRef.current.add(latestCall.id);
          setIncomingCall(latestCall);
          setShowBanner(true);
          playRingtone();
          console.log('📞 Found existing call notification:', latestCall);
        }
      }

      // Subscribe to new call notifications
      const channel = supabase
        .channel('global-call-notifications')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `recipient_id=eq.${user.id}`,
          },
          async (payload) => {
            if (!mountedRef.current) return;
            
            const notification = payload.new as any;
            
            if (notification.type === 'call' && !notification.is_read) {
              const callNotif = notification as CallNotification;
              
              // Avoid processing the same call twice
              if (processedCallIdsRef.current.has(callNotif.id)) {
                return;
              }
              
              processedCallIdsRef.current.add(callNotif.id);
              
              console.log('📞 New call notification received:', callNotif);
              
              // Check if user is currently in the chatroom for this call
              const callRoomId = callNotif.content.room_id;
              const isInChatroom = currentRoomId === callRoomId || pathname === `/chat/${callRoomId}`;
              
              if (isInChatroom) {
                console.log('⏭️ User is in chatroom, skipping banner (ChatRoom will handle it)');
                // Mark notification as read since user is in the room
                await supabase
                  .from('notifications')
                  .update({ is_read: true, read_at: new Date().toISOString() })
                  .eq('id', callNotif.id);
                return; // Don't show banner if user is in the chatroom
              }
              
              setIncomingCall(callNotif);
              setShowBanner(true);
              
              // Play ringtone continuously
              playRingtone();
              
              toast.info(`Incoming ${callNotif.content.call_type} call from ${callNotif.content.sender_name}`);
            }
          }
        )
        .subscribe();

      // Subscribe to notification updates/deletes so the banner closes if the call is ended elsewhere
      const notifUpdatesChannel = supabase
        .channel('global-call-notification-updates')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `recipient_id=eq.${user.id}`,
          },
          async (payload) => {
            if (!mountedRef.current) return;
            const updated = payload.new as any;
            // If the current incoming call notification was marked read, close banner
            if (incomingCall && updated?.id === incomingCall.id && updated?.is_read) {
              await clearIncomingCallUI('notification marked read');
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'notifications',
            filter: `recipient_id=eq.${user.id}`,
          },
          async (payload) => {
            if (!mountedRef.current) return;
            const deleted = payload.old as any;
            if (incomingCall && deleted?.id === incomingCall.id) {
              await clearIncomingCallUI('notification deleted');
            }
          }
        )
        .subscribe();

      // Also subscribe to call record updates to detect when calls end/timeout
      const callRecordsChannel = supabase
        .channel('global-call-records')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'call_records',
            filter: `receiver_id=eq.${user.id}`,
          },
          async (payload) => {
            if (!mountedRef.current) return;
            
            const record = payload.new as any;
            // If call was marked as ended/missed/declined/accepted, clear the banner
            if (record.status === 'missed' || record.status === 'ended' || record.status === 'declined' || record.status === 'accepted') {
              await clearIncomingCallUI(`call_records status=${record.status}`);
              
              // Mark related notification as read
              if (record.call_id) {
                await supabase
                  .from('notifications')
                  .update({ is_read: true, read_at: new Date().toISOString() })
                  .eq('type', 'call')
                  .eq('recipient_id', user.id)
                  .eq('related_id', record.room_id)
                  .eq('is_read', false);
              }
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
        supabase.removeChannel(notifUpdatesChannel);
        supabase.removeChannel(callRecordsChannel);
      };
    };

    const cleanup = setupCallListener();
    
    return () => {
      cleanup.then(cleanupFn => cleanupFn?.());
    };
  }, [supabase, currentRoomId, pathname, incomingCall]);

  // When we have an incoming call, subscribe directly to that call_id updates too.
  // This covers edge cases where receiver_id is null or policy filters don't match.
  useEffect(() => {
    const callId = incomingCall?.content?.call_id;
    if (!callId) return;

    const channel = supabase
      .channel(`incoming-call-record-${callId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'call_records',
          filter: `call_id=eq.${callId}`,
        },
        async (payload) => {
          if (!mountedRef.current) return;
          const record = payload.new as any;
          if (record?.status === 'missed' || record?.status === 'ended' || record?.status === 'declined' || record?.status === 'accepted') {
            await clearIncomingCallUI(`call_id subscription status=${record.status}`);
            const recipientId = userIdRef.current;
            if (recipientId) {
              await supabase
                .from('notifications')
                .update({ is_read: true, read_at: new Date().toISOString() })
                .eq('id', incomingCall.id)
                .eq('recipient_id', recipientId);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, incomingCall]);

  const handleAcceptCall = async () => {
    if (!incomingCall) return;
    
    // Stop ringtone
    stopRingtone();
    
    // Mark notification as read
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', incomingCall.id);
    
    // Navigate to chat room
    router.push(`/chat/${incomingCall.content.room_id}`);
    
    // Clear call state
    setShowBanner(false);
    setIncomingCall(null);
  };

  const handleDeclineCall = async () => {
    if (!incomingCall) return;
    
    // Stop ringtone
    stopRingtone();
    
    // Mark notification as read
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', incomingCall.id);
    
    // Clear call state
    setShowBanner(false);
    setIncomingCall(null);
  };

  const handleDeclineWithMessage = async () => {
    if (!incomingCall) return;
    
    // Stop ringtone
    stopRingtone();
    
    // Mark notification as read
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', incomingCall.id);
    
    // Navigate to chat room to send a message
    router.push(`/chat/${incomingCall.content.room_id}`);
    
    // Clear call state
    setShowBanner(false);
    setIncomingCall(null);
  };

  if (!showBanner || !incomingCall) return null;

  return (
    <CallNotificationBanner
      callerName={incomingCall.content.sender_name}
      callType={incomingCall.content.call_type}
      onAccept={handleAcceptCall}
      onDecline={handleDeclineCall}
      onDeclineWithMessage={handleDeclineWithMessage}
      onDismiss={handleDeclineCall}
    />
  );
}

