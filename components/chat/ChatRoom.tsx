'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { Phone, Video, MoreVertical, Ban, Trash2, X, Unlock, Search, Users, Circle, Bell, BellOff, Image as ImageIcon, Languages, ArrowLeft, ChevronDown, ShieldCheck } from 'lucide-react';
import { useLiveKitChat } from '../../hooks/useLiveKitChat';
import { useUserStatus, UserStatus } from '../../hooks/useUserStatus';
import { createClient } from '../../utils/supabase/client';
import { useNotification } from '../contexts/NotificationContext';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import LiveKitCallModal from './LiveKitCallModal';
import CallNotificationBanner from './CallNotificationBanner';
import ConfirmModal from '../ui/ConfirmModal';

// Lazy-load heavy components to improve initial page load
const CallOverlay = dynamic(() => import('./CallOverlay'), {
  ssr: false, // LiveKit components require client-side only
  loading: () => null, // No loading state needed (overlay is conditionally rendered)
});

const MediaDrawer = dynamic(() => import('./MediaDrawer'), {
  ssr: false,
  loading: () => null, // Drawer handles its own loading state
});
import { initiateCall, cancelCall, checkActiveCall } from '../../actions/calls';
import { createCallRecord, updateCallRecord, updateCallRecordByCallId, getCallRecords } from '../../actions/callRecords';
import { blockUserInRoom, unblockUserInRoom, getBlockStatus } from '../../actions/contacts';
import { RoomEvent, ConnectionState } from 'livekit-client';
import { toast } from 'sonner';
import { callLogger } from '../../utils/callLogger';

export interface Participant {
    id: string;
    name: string;
    avatar?: string;
    status?: string;
}

export interface RoomDetails {
    id: string;
    room_type: 'direct' | 'group';
    name: string;
    members_count: number;
    participants?: Participant[];
}

interface ChatRoomProps {
  roomId: string;
  userId: string;
  userName: string;
  userPreferredLanguage?: string;
  roomDetails: RoomDetails;
}

const ChatRoom: React.FC<ChatRoomProps> = ({ 
    roomId, 
    userId, 
    userName, 
    userPreferredLanguage = 'en',
    roomDetails
}) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  // Use notification context - safe for SSR with updated hook
  const { isNotificationsOpen, setIsNotificationsOpen, setCurrentRoomId } = useNotification();
  
  // Track current room ID for notifications
  useEffect(() => {
    setCurrentRoomId(roomId);
    return () => {
      setCurrentRoomId(null);
    };
  }, [roomId, setCurrentRoomId]);

  // Mark all unread notifications for this room as read when user enters the room
  useEffect(() => {
    const markRoomNotificationsAsRead = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Mark all unread message notifications for this room as read (fire and forget for speed)
        const markReadPromise = supabase
          .from('notifications')
          .update({ 
            is_read: true,
            read_at: new Date().toISOString()
          })
          .eq('recipient_id', user.id)
          .eq('type', 'message')
          .eq('related_id', roomId)
          .eq('is_read', false)
          .select(); // Minimal select to reduce response size
        Promise.resolve(markReadPromise).catch((err: any) => {
          // Silently handle error
          console.error('Error marking room notifications as read:', err);
        });
      } catch (err) {
        // Silently handle error
      }
    };

    // Mark notifications as read when room is loaded (non-blocking)
    markRoomNotificationsAsRead();
    
    // Load call records for this room
    const loadCallRecords = async () => {
      try {
        const result = await getCallRecords(roomId);
        if (result.success && result.records) {
          setCallRecords(result.records);
        }
      } catch (err) {
        // Silently handle error
      }
    };
    
    loadCallRecords();
    
    // Subscribe to call record updates - both for reloading records AND detecting call cancellation
    const channel = supabase
      .channel(`call-records-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'call_records',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          // Reload call records when they change
          loadCallRecords();
          
          // Check if this is a call status update that should close the incoming call UI
          const record = payload.new as any;
          if (record && (record.status === 'missed' || record.status === 'ended' || record.status === 'declined')) {
            // Stop ringtone if playing
            if (ringtoneRef.current) {
              ringtoneRef.current.pause();
              ringtoneRef.current.currentTime = 0;
            }
            if (ringbackRef.current) {
              ringbackRef.current.pause();
              ringbackRef.current.currentTime = 0;
            }
            
            // Clear call UI state if we're showing an incoming call
            if (isCallModalOpenRef.current && !activeCallTokenRef.current) {
              setIsCallModalOpen(false);
              setShowCallBanner(false);
              setIncomingCaller('');
              setIncomingCallId(null);
              setIncomingCallRoomId(null);
              
              if (record.status === 'missed') {
                toast.info('Missed call');
              } else if (record.status === 'ended') {
                toast.info('Call ended');
              }
            }
          }
        }
      )
      .subscribe();
    
    return () => {
      try {
        channel.unsubscribe();
      } catch (e) {
        // Ignore unsubscribe errors
      }
      try {
        supabase.removeChannel(channel);
      } catch (e) {
        // Ignore removeChannel errors
      }
    };
  }, [roomId, supabase]);
  
  // Track processed call notification IDs to prevent duplicate handling
  const processedCallNotifIdsRef = useRef<Set<string>>(new Set());
  
  // Fallback: Poll for incoming call notifications for THIS room
  // This handles cases where LiveKit DataChannel misses the call_invite
  useEffect(() => {
    if (!userId || !roomId) return;
    
    const checkForCallNotifications = async () => {
      // Skip if we already have an active call or are showing the call modal
      if (activeCallTokenRef.current || isCallModalOpenRef.current || showCallBannerRef.current) {
        return;
      }
      
      try {
        const { data: calls, error: callsError } = await supabase
          .from('notifications')
          .select('*')
          .eq('recipient_id', userId)
          .eq('type', 'call')
          .eq('related_id', roomId)
          .eq('is_read', false)
          .order('created_at', { ascending: false })
          .limit(1);
        
        if (callsError) {
          console.error('📞 [ChatRoom] Error fetching call notifications:', callsError);
        }
        
        // Log every poll check (not just when found) for debugging
        if (calls && calls.length > 0) {
          console.log('📞 [ChatRoom.poll] Found call notification:', { 
            id: calls[0].id, 
            content: calls[0].content,
            created_at: calls[0].created_at,
            userId,
            roomId
          });
          const latestCall = calls[0];
          
          // Skip if already processed
          if (processedCallNotifIdsRef.current.has(latestCall.id)) {
            return;
          }
          
          // Check if call is recent (within 30 seconds)
          const callAge = Date.now() - new Date(latestCall.created_at).getTime();
          if (callAge > 30000) {
            // Mark old call notification as read and add to processed
            processedCallNotifIdsRef.current.add(latestCall.id);
            await supabase
              .from('notifications')
              .update({ is_read: true, read_at: new Date().toISOString() })
              .eq('id', latestCall.id);
            return;
          }
          
          // Mark as processed to prevent re-handling
          processedCallNotifIdsRef.current.add(latestCall.id);
          
          // Extract call details from notification
          const content = latestCall.content as any;
          const callerId = content?.sender_name || 'Unknown';
          const callTypeFromNotif = content?.call_type || 'audio';
          const callId = content?.call_id;
          
          // Don't show call UI if we initiated this call
          if (callId && callId.includes(userId)) {
            return;
          }
          
          // Show call UI
          setIncomingCaller(callerId);
          setCallType(callTypeFromNotif);
          setIncomingCallId(callId || null);
          setIncomingCallRoomId(roomId);
          setIsCallModalOpen(true);
          setShowCallBanner(false);
          playRingtone();
          
          callLogger.callUIShown({
              callId: callId || undefined,
              roomId,
              initiatorName: callerId,
              receiverId: userId,
              receiverName: userName,
              callType: callTypeFromNotif,
              deviceInfo: 'ChatRoom (Polling)'
          });
          
          callLogger.callRinging({
              callId: callId || undefined,
              roomId,
              deviceInfo: 'ChatRoom'
          });
          
          toast.info(`Incoming ${callTypeFromNotif} call from ${callerId}`);
          
          // Store notification ID to watch for external cancellation (e.g. caller cancels)
          // We DO NOT mark as read yet - we wait for user action or cancellation
          // The processedCallNotifIdsRef prevents re-processing
          setIncomingCallNotifId(latestCall.id);
        }
      } catch (error) {
        // Silently handle error
      }
    };
    
    // Check immediately and then every 2 seconds
    checkForCallNotifications();
    const pollInterval = setInterval(checkForCallNotifications, 2000);
    
    // ALSO subscribe to realtime call notifications for immediate response
    // This is faster than polling and ensures calls are shown instantly
    const callNotifChannel = supabase
      .channel(`chatroom-call-notifications-${roomId}-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${userId}`,
        },
        async (payload) => {
          const notification = payload.new as any;
          
          // Only handle call notifications for THIS room
          if (notification.type !== 'call' || notification.related_id !== roomId) {
            return;
          }
          
          // Skip if already showing call UI or in a call
          if (activeCallTokenRef.current || isCallModalOpenRef.current || showCallBannerRef.current) {
            return;
          }
          
          // Skip if already processed
          if (processedCallNotifIdsRef.current.has(notification.id)) {
            return;
          }
          
          console.log('📞 [ChatRoom.realtime] Received call notification:', {
            id: notification.id,
            content: notification.content,
            roomId
          });
          
          // Mark as processed
          processedCallNotifIdsRef.current.add(notification.id);
          
          // Extract call details
          const content = notification.content as any;
          const callerId = content?.sender_name || 'Unknown';
          const callTypeFromNotif = content?.call_type || 'audio';
          const callId = content?.call_id;
          
          // Don't show call UI if we initiated this call
          if (callId && callId.includes(userId)) {
            return;
          }
          
          // Show call UI immediately
          setIncomingCaller(callerId);
          setCallType(callTypeFromNotif);
          setIncomingCallId(callId || null);
          setIncomingCallRoomId(roomId);
          setIsCallModalOpen(true);
          setShowCallBanner(false);
          playRingtone();
          
          callLogger.callUIShown({
              callId: callId || undefined,
              roomId,
              initiatorName: callerId,
              receiverId: userId,
              receiverName: userName,
              callType: callTypeFromNotif,
              deviceInfo: 'ChatRoom (Realtime)'
          });
          
          callLogger.callRinging({
              callId: callId || undefined,
              roomId,
              deviceInfo: 'ChatRoom'
          });
          
          toast.info(`Incoming ${callTypeFromNotif} call from ${callerId}`);
          
          // Store notification ID to watch for cancellation
          setIncomingCallNotifId(notification.id);
        }
      )
      .subscribe();
    
    // Also poll for active calls (for "Join Call" button)
    // But DON'T show Join Call if there's a pending call notification for THIS user
    const checkForActiveCalls = async () => {
      // Skip if we're already in a call or have an incoming call
      if (activeCallTokenRef.current || isCallModalOpenRef.current || showCallBannerRef.current) {
        return;
      }
      
      try {
        // First check if we have an unread call notification - if so, DON'T show "Join Call"
        // The incoming call modal/banner should take priority
        const { data: pendingCalls } = await supabase
          .from('notifications')
          .select('id')
          .eq('recipient_id', userId)
          .eq('type', 'call')
          .eq('related_id', roomId)
          .eq('is_read', false)
          .limit(1);
        
        if (pendingCalls && pendingCalls.length > 0) {
          // There's a pending call notification - let the call handling logic deal with it
          // Don't show "Join Call" button
          setHasActiveCallToJoin(false);
          setActiveCallTypeToJoin(null);
          return;
        }
        
        const result = await checkActiveCall(roomId);
        if (result.hasActiveCall && result.callType) {
          setHasActiveCallToJoin(true);
          setActiveCallTypeToJoin(result.callType);
        } else {
          setHasActiveCallToJoin(false);
          setActiveCallTypeToJoin(null);
        }
      } catch (error) {
        // Silently handle error
      }
    };
    
    // Delay initial check to allow call notifications to arrive first
    setTimeout(checkForActiveCalls, 2000);
    const activeCallPollInterval = setInterval(checkForActiveCalls, 5000);
    
    return () => {
      clearInterval(pollInterval);
      clearInterval(activeCallPollInterval);
      try {
        callNotifChannel.unsubscribe();
      } catch (e) {
        // Ignore unsubscribe errors
      }
      try {
        supabase.removeChannel(callNotifChannel);
      } catch (e) {
        // Ignore removeChannel errors
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, roomId, supabase]);
  
  // Room details validation (no logging)

  if (!roomDetails) {
      return <div className="flex h-full items-center justify-center text-white/50">Loading room...</div>;
  }

  const { isConnected, messages, error, room: liveKitChatRoom, sendRealtimeMessage, reloadMessages } = useLiveKitChat(roomId, userId, userName);
  const [callRecords, setCallRecords] = useState<any[]>([]);
  
  // Notification mute state - load from localStorage per room
  const [isNotificationsMuted, setIsNotificationsMuted] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(`mute_notifications_${roomId}`);
      return saved === 'true';
    }
    return false;
  });
  
  // Sound ref for playing notification sound when message arrives
  const messageSoundRef = useRef<HTMLAudioElement | null>(null);
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);
  const ringbackRef = useRef<HTMLAudioElement | null>(null);
  const callTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const audioUnlockedRef = useRef<boolean>(false);
  const pendingRingtoneRef = useRef<boolean>(false);
  const pendingRingbackRef = useRef<boolean>(false);
  const lastMessageIdRef = useRef<string | null>(null);
  const messagesInitializedRef = useRef<boolean>(false);
  
  // Initialize message sound and ringtone
  useEffect(() => {
    messageSoundRef.current = new Audio('/sounds/new-notification.mp3');
    messageSoundRef.current.volume = 0.5;
    messageSoundRef.current.preload = 'auto';
    
    // Create and preload ringtone for calls
    ringtoneRef.current = new Audio('/sounds/ringtone.mp3');
    ringtoneRef.current.volume = 0.7;
    ringtoneRef.current.loop = true;
    ringtoneRef.current.preload = 'auto';
    
    // Create and preload ringback for outgoing calls
    ringbackRef.current = new Audio('/sounds/ringback.mp3');
    ringbackRef.current.volume = 0.7;
    ringbackRef.current.loop = true;
    ringbackRef.current.preload = 'auto';
    
    // Unlock audio on user interaction
    const unlockAudio = async () => {
      try {
        audioUnlockedRef.current = true;
        // If we had a pending ringtone, start it now
        if (pendingRingtoneRef.current && ringtoneRef.current) {
          pendingRingtoneRef.current = false;
          try { await ringtoneRef.current.play(); } catch {}
        }
        // If we had a pending ringback, start it now
        if (pendingRingbackRef.current && ringbackRef.current) {
          pendingRingbackRef.current = false;
          try { await ringbackRef.current.play(); } catch {}
        }
      } catch (e) {
        // Silently handle
      }
    };
    
    const events = ['click', 'touchstart', 'keydown', 'mousedown', 'pointerdown'];
    const handlers: Array<() => void> = [];
    
    events.forEach(event => {
      const handler = () => {
        unlockAudio();
        // Don't remove listeners immediately - let them stay for multiple interactions
      };
      handlers.push(handler);
      document.addEventListener(event, handler, { once: false, passive: true });
    });
    
    return () => {
      if (messageSoundRef.current) {
        messageSoundRef.current.pause();
        messageSoundRef.current = null;
      }
      if (ringtoneRef.current) {
        ringtoneRef.current.pause();
        ringtoneRef.current = null;
      }
      if (ringbackRef.current) {
        ringbackRef.current.pause();
        ringbackRef.current = null;
      }
      if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
      }
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
      } catch (err: any) {
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
    pendingRingtoneRef.current = false;
  };
  
  const playRingback = async () => {
    if (ringbackRef.current) {
      try {
        ringbackRef.current.currentTime = 0;
        await ringbackRef.current.play();
      } catch (err: any) {
        // Queue pending play until audio is unlocked via user interaction
        pendingRingbackRef.current = true;
      }
    }
  };
  
  const stopRingback = () => {
    if (ringbackRef.current) {
      ringbackRef.current.pause();
      ringbackRef.current.currentTime = 0;
    }
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
    pendingRingbackRef.current = false;
  };
  
  // Initialize lastMessageIdRef when messages are first loaded (prevents sound on page reload)
  useEffect(() => {
    if (messages.length > 0 && !messagesInitializedRef.current) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage) {
        lastMessageIdRef.current = lastMessage.id;
        messagesInitializedRef.current = true;
      }
    } else if (messages.length === 0) {
      // Reset when messages are cleared (room change)
      messagesInitializedRef.current = false;
      lastMessageIdRef.current = null;
    }
  }, [messages.length]); // Only depend on length to avoid re-running on every message update
  
  // Play sound when a new message arrives from another user
  // Save mute status to localStorage when it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`mute_notifications_${roomId}`, isNotificationsMuted.toString());
    }
  }, [isNotificationsMuted, roomId]);

  useEffect(() => {
    if (messages.length === 0) return;
    
    // Don't play sound on initial load - wait until messages are initialized
    if (!messagesInitializedRef.current) return;
    
    // Don't play sound if notifications are muted for this room
    if (isNotificationsMuted) return;
    
    const lastMessage = messages[messages.length - 1];
    
    // Only play sound for messages from other users that we haven't seen yet
    if (lastMessage && !lastMessage.isMe && lastMessage.id !== lastMessageIdRef.current) {
      lastMessageIdRef.current = lastMessage.id;
      
      // Play sound for new message
      const playSound = () => {
        if (messageSoundRef.current) {
          messageSoundRef.current.currentTime = 0;
          messageSoundRef.current.play().catch((err: any) => {
            // Silently fail if autoplay is blocked
            console.log('Message sound blocked:', err.name);
          });
        }
      };
      
      playSound();
    }
  }, [messages, isNotificationsMuted]); 
  
  // Presence Hook
  const { onlineUsers, updateUserStatus } = useUserStatus({ id: userId });
  const [partnerProfileStatus, setPartnerProfileStatus] = useState<UserStatus | null>(null);

  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [activeCallToken, setActiveCallToken] = useState<string | null>(null);
  const [activeCallUrl, setActiveCallUrl] = useState<string | null>(null);
  const [activeCallType, setActiveCallType] = useState<'audio' | 'video'>('audio');
  const [incomingCaller, setIncomingCaller] = useState('');
  const [callType, setCallType] = useState<'audio' | 'video'>('audio');
  const [showCallBanner, setShowCallBanner] = useState(false);
  const [incomingCallId, setIncomingCallId] = useState<string | null>(null);
  const [incomingCallRoomId, setIncomingCallRoomId] = useState<string | null>(null);
  const [callRecordId, setCallRecordId] = useState<string | null>(null);
  const [callStartTime, setCallStartTime] = useState<number | null>(null);
  const [isCaller, setIsCaller] = useState(false);
  const [hasActiveCallToJoin, setHasActiveCallToJoin] = useState(false);
  const [activeCallTypeToJoin, setActiveCallTypeToJoin] = useState<'audio' | 'video' | null>(null);
  const [incomingCallNotifId, setIncomingCallNotifId] = useState<string | null>(null);

  // Subscribe to updates for the current incoming call notification
  useEffect(() => {
    if (!incomingCallNotifId) return;

    const channel = supabase
      .channel(`incoming-call-${incomingCallNotifId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `id=eq.${incomingCallNotifId}`,
        },
        async (payload) => {
          const updated = payload.new as any;
          // If notification is marked read (e.g. cancelled), close the UI
          if (updated && updated.is_read) {
            console.log('📞 [ChatRoom] Incoming call notification marked read (cancelled), closing UI');
            
            callLogger.callCancelled({
                callId: incomingCallNotifId,
                roomId,
                deviceInfo: 'ChatRoom (Notification Update)'
            });
            
            callLogger.callUIHidden({
                callId: incomingCallNotifId,
                roomId,
                deviceInfo: 'ChatRoom'
            });
            
            // Stop ringtone
            stopRingtone();
            
            // Clear UI
            setIsCallModalOpen(false);
            setShowCallBanner(false);
            setIncomingCaller('');
            setIncomingCallId(null);
            setIncomingCallRoomId(null);
            setIncomingCallNotifId(null);
            
            toast.info('Call cancelled');
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications',
          filter: `id=eq.${incomingCallNotifId}`,
        },
        async () => {
          console.log('📞 [ChatRoom] Incoming call notification deleted, closing UI');
          
          callLogger.callCancelled({
              callId: incomingCallNotifId,
              roomId,
              deviceInfo: 'ChatRoom (Notification Deleted)'
          });
          
          callLogger.callUIHidden({
              callId: incomingCallNotifId,
              roomId,
              deviceInfo: 'ChatRoom'
          });

          stopRingtone();
          setIsCallModalOpen(false);
          setShowCallBanner(false);
          setIncomingCaller('');
          setIncomingCallId(null);
          setIncomingCallRoomId(null);
          setIncomingCallNotifId(null);
          toast.info('Call cancelled');
        }
      )
      .subscribe();

    return () => {
      try {
        channel.unsubscribe();
      } catch (e) {
        // Ignore unsubscribe errors
      }
      try {
        supabase.removeChannel(channel);
      } catch (e) {
        // Ignore removeChannel errors
      }
    };
  }, [incomingCallNotifId, supabase]);
  
  // Refs to access current call state without adding to dependency array
  const activeCallTokenRef = useRef<string | null>(null);
  const isCallModalOpenRef = useRef(false);
  const showCallBannerRef = useRef(false);
  const callRecordIdRef = useRef<string | null>(null);
  const callStartTimeRef = useRef<number | null>(null);
  
  // Keep refs in sync with state
  useEffect(() => {
    activeCallTokenRef.current = activeCallToken;
    callRecordIdRef.current = callRecordId;
    callStartTimeRef.current = callStartTime;
  }, [activeCallToken, callRecordId, callStartTime]);
  
  useEffect(() => {
    isCallModalOpenRef.current = isCallModalOpen;
  }, [isCallModalOpen]);
  
  useEffect(() => {
    showCallBannerRef.current = showCallBanner;
  }, [showCallBanner]);

  // Auto-join call when accepting from GlobalCallHandler banner
  useEffect(() => {
    const acceptCall = searchParams?.get('acceptCall');
    const callId = searchParams?.get('callId');
    const callType = searchParams?.get('callType') as 'audio' | 'video' | null;
    
    if (acceptCall === 'true' && callType && !activeCallTokenRef.current && !isCallModalOpenRef.current) {
      // Remove URL params after reading
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
      
      // Auto-join the accepted call
      const joinAcceptedCall = async () => {
        console.log('📞 Auto-joining accepted call from banner:', { callId, callType, roomId });
        
        // Use initiateCall to join the call
        const res = await initiateCall(roomId, userId, userName, callType);
        
        if (res.success && res.token && res.serverUrl) {
          const token = typeof res.token === 'string' ? res.token : await res.token;
          setActiveCallToken(token);
          setActiveCallUrl(res.serverUrl);
          setActiveCallType(callType);
          setCallStartTime(Date.now());
          callStartTimeRef.current = Date.now();
          
          updateUserStatus('in-call');
          toast.success('Call joined');
        } else {
          console.error('❌ Failed to auto-join call:', res.error);
          toast.error(res.error || 'Failed to join call');
        }
      };
      
      // Small delay to ensure ChatRoom is fully mounted
      setTimeout(joinAcceptedCall, 300);
    }
  }, [searchParams, roomId, userId, userName, updateUserStatus]);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMediaDrawerOpen, setIsMediaDrawerOpen] = useState(false);
  const [isGroupMembersOpen, setIsGroupMembersOpen] = useState(false);
  const [showClearChatConfirm, setShowClearChatConfirm] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const groupListRef = useRef<HTMLDivElement>(null);

  const [isTranslationEnabled, setIsTranslationEnabled] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // --- Derived Status Logic ---
  const directPartnerId = roomDetails.room_type === 'direct' ? roomDetails.participants?.[0]?.id : undefined;

  // Fetch fallback status from profiles and subscribe to real-time updates
  useEffect(() => {
      if (!directPartnerId) return;
      
      const fetchStatus = async () => {
          const { data, error } = await supabase
              .from('profiles')
              .select('status')
              .eq('id', directPartnerId)
              .single();
          if (!error && data?.status) {
              const dbStatus = data.status as UserStatus;
              setPartnerProfileStatus(dbStatus);
          } else {
              // If we can't fetch, assume offline to be safe
              setPartnerProfileStatus('offline');
          }
      };
      
      // Initial fetch
      fetchStatus();
      
      // Periodic refresh every 10 seconds to catch offline status changes faster
      const refreshInterval = setInterval(() => {
          fetchStatus();
      }, 10000);
      
      // Subscribe to real-time updates for this user's status
      const channel = supabase
          .channel(`profile_status_${directPartnerId}_${Date.now()}`)
          .on(
              'postgres_changes',
              {
                  event: 'UPDATE',
                  schema: 'public',
                  table: 'profiles',
                  filter: `id=eq.${directPartnerId}`,
              },
              (payload) => {
                  const updatedProfile = payload.new as any;
                  if (updatedProfile.status) {
                      setPartnerProfileStatus(updatedProfile.status as UserStatus);
                  }
              }
          )
          .subscribe();
      
      return () => {
          clearInterval(refreshInterval);
          try {
            channel.unsubscribe();
          } catch (e) {
            // Ignore unsubscribe errors
          }
          try {
            supabase.removeChannel(channel);
          } catch (e) {
            // Ignore removeChannel errors
          }
      };
  }, [directPartnerId, supabase]);

  const directPartnerStatus: UserStatus = useMemo(() => {
      if (!directPartnerId) return 'online'; // default optimistic
      
      // Priority: 1. Presence (most real-time), 2. Database status (fallback), 3. Default to offline
      const presenceStatus = onlineUsers[directPartnerId];
      
      // If presence exists, use it (presence is the most real-time data)
      if (presenceStatus !== undefined) {
          // CRITICAL: If presence explicitly says offline, ALWAYS trust it (most real-time)
          if (presenceStatus === 'offline') {
              return 'offline';
          }
          // Return the presence status (already checked it's not offline)
          return presenceStatus;
      }
      
      // If presence has NO data, fall back to database status
      if (partnerProfileStatus !== null && partnerProfileStatus !== undefined) {
          // If database says offline, trust it
          if (partnerProfileStatus === 'offline') {
              return 'offline';
          }
          // Return the database status (already checked it's not offline)
          return partnerProfileStatus;
      }
      
      // If we have no data at all, default to offline
      return 'offline';
  }, [directPartnerId, onlineUsers, partnerProfileStatus]);

  // Track group member statuses from database - this is the source of truth
  const [groupMemberDbStatuses, setGroupMemberDbStatuses] = useState<Record<string, string>>({});
  
  // Fetch group member statuses from database with polling for reliability
  useEffect(() => {
    if (roomDetails.room_type !== 'group' || !roomDetails.participants) return;
    
    let mounted = true;
    const memberIds = roomDetails.participants!.map(p => p.id);
    
    const fetchGroupStatuses = async () => {
      if (!mounted) return;
      
      const { data } = await supabase
        .from('profiles')
        .select('id, status')
        .in('id', memberIds);
      
      if (data && mounted) {
        const statusMap: Record<string, string> = {};
        data.forEach(p => {
          // Treat null/undefined status as online (user is active)
          statusMap[p.id] = p.status || 'online';
        });
        setGroupMemberDbStatuses(statusMap);
      }
    };
    
    // Initial fetch
    fetchGroupStatuses();
    
    // Poll every 5 seconds for reliable status updates across all devices
    const pollInterval = setInterval(fetchGroupStatuses, 5000);
    
    // Also subscribe to real-time status changes for immediate updates
    const channel = supabase
      .channel(`group_members_status_${roomId}_${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
        },
        (payload) => {
          const updated = payload.new as any;
          if (updated.id && memberIds.includes(updated.id)) {
            setGroupMemberDbStatuses(prev => ({
              ...prev,
              [updated.id]: updated.status || 'online'
            }));
          }
        }
      )
      .subscribe();
    
    return () => {
      mounted = false;
      clearInterval(pollInterval);
      try {
        channel.unsubscribe();
      } catch (e) {
        // Ignore unsubscribe errors
      }
      try {
        supabase.removeChannel(channel);
      } catch (e) {
        // Ignore removeChannel errors
      }
    };
  }, [roomDetails.room_type, roomDetails.participants, roomId, supabase]);

  const onlineGroupMembers = useMemo(() => {
      if (roomDetails.room_type !== 'group' || !roomDetails.participants) return [];
      
      return roomDetails.participants.filter(p => {
          // Current user is always considered online (they're viewing the chat)
          if (p.id === userId) return true;
          
          // Check database status first (source of truth, more reliable)
          const dbStatus = groupMemberDbStatuses[p.id];
          if (dbStatus && dbStatus !== 'offline' && dbStatus !== 'invisible') {
            return true;
          }
          
          // Fallback to presence status
          const presenceStatus = onlineUsers[p.id];
          if (presenceStatus !== undefined && presenceStatus !== 'offline' && presenceStatus !== 'invisible') {
            return true;
          }
          
          return false;
      });
  }, [roomDetails, onlineUsers, groupMemberDbStatuses, userId]);

  // --- Call State Handling ---
  const handleCallDisconnect = (shouldSignalTerminate: boolean) => {
      stopRingback(); // Stop ringback if caller cancels/disconnects
      stopRingtone(); // Stop ringtone if receiver disconnects
      updateUserStatus('online'); // Revert status
      handleEndCall(shouldSignalTerminate);
  };
  
  // ----------------------------

  useEffect(() => {
    const checkBlock = async () => {
        const status = await getBlockStatus(roomId);
        setIsBlocked(status.blocked);
        setBlockedByMe(status.blockedByMe);
    };
    checkBlock();
  }, [roomId]);

  // Calculate menu position when it opens
  useEffect(() => {
    if (isMenuOpen && menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 8, // 8px spacing below the button
        right: window.innerWidth - rect.right
      });
    } else {
      setMenuPosition(null);
    }
  }, [isMenuOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        const target = event.target as HTMLElement;
        // Check if click is outside the portal menu as well
        if (!target.closest('.menu-dropdown-portal')) {
          setIsMenuOpen(false);
        }
      }
      if (groupListRef.current && !groupListRef.current.contains(event.target as Node)) {
        setIsGroupMembersOpen(false);
      }
    };
    if (isMenuOpen || isGroupMembersOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen, isGroupMembersOpen]);

  // Menu position no longer needed - using fixed positioning

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedQuery(searchQuery); }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (!liveKitChatRoom) {
      return;
    }
    
    const handleData = async (payload: Uint8Array, participant?: any) => {
        const decoder = new TextDecoder();
        try {
            const data = JSON.parse(decoder.decode(payload));
            
            // Handle Incoming Call
            if (data.type === 'call_invite' && data.senderId !== userId) {
                console.log('📞 [ChatRoom] Received call_invite via DataChannel:', {
                    callId: data.callId,
                    sender: data.senderName,
                    senderId: data.senderId,
                    callType: data.callType,
                    roomId: data.roomId,
                    currentRoomId: roomId,
                    hasActiveCall: !!activeCallTokenRef.current
                });
                
                // Ignore if we already have an active call token (we're already in a call)
                if (activeCallTokenRef.current) {
                    console.log('📞 [ChatRoom] Already in a call, ignoring call_invite');
                    return;
                }
                
                const callRoomId = data.roomId;
                const isCallFromCurrentRoom = callRoomId === roomId;
                
                console.log('📞 [ChatRoom] Call room match:', { isCallFromCurrentRoom, callRoomId, currentRoomId: roomId });
                
                // Clear any previous call state first
                setShowCallBanner(false);
                setIsCallModalOpen(false);
                stopRingtone(); // Stop any existing ringtone
                
                setIncomingCaller(data.senderName || 'Unknown');
                setCallType(data.callType || 'audio');
                setIncomingCallId(data.callId || null);
                setIncomingCallRoomId(callRoomId || null);
                
                // Play ringtone
                playRingtone();
                
                callLogger.callRinging({
                    callId: data.callId,
                    roomId: data.roomId,
                    deviceInfo: 'ChatRoom (DataChannel)'
                });
                
                // If call is from current room, show modal only (user is in chat with caller)
                // If call is from different room, show banner only (user is not in chat with caller)
                if (isCallFromCurrentRoom) {
                    console.log('📞 [ChatRoom] Showing call modal (call from current room)');
                    setShowCallBanner(false);
                    setIsCallModalOpen(true);
                    
                    callLogger.callUIShown({
                        callId: data.callId,
                        roomId: data.roomId,
                        initiatorName: data.senderName,
                        receiverId: userId,
                        receiverName: userName,
                        callType: data.callType,
                        deviceInfo: 'ChatRoom Modal (DataChannel)'
                    });

                    // Note: Calls always show UI, but muted notifications suppress toast only
                    if (!isNotificationsMuted) {
                        toast.info(`Incoming ${data.callType} call from ${data.senderName || 'Unknown'}`);
                    }
                } else {
                    console.log('📞 [ChatRoom] Showing call banner (call from different room)');
                    setShowCallBanner(true);
                    setIsCallModalOpen(false);
                    
                    callLogger.callUIShown({
                        callId: data.callId,
                        roomId: data.roomId,
                        initiatorName: data.senderName,
                        receiverId: userId,
                        receiverName: userName,
                        callType: data.callType,
                        deviceInfo: 'ChatRoom Banner (DataChannel)'
                    });

                    if (!isNotificationsMuted) {
                        toast.info(`Incoming ${data.callType} call from ${data.senderName || 'Unknown'}`);
                    }
                }
            }
            
            // Handle Call Accepted (receiver joined the call)
            // IMPORTANT: Only close modal if user is the CALLER (isCaller === true)
            // For group calls, other receivers should keep their call screen open
            if (data.type === 'call_accepted' && data.senderId !== userId && isCaller) {
                stopRingback(); // Stop ringback when call is accepted
                if (callTimeoutRef.current) {
                    clearTimeout(callTimeoutRef.current);
                    callTimeoutRef.current = null;
                }
                // Close caller modal and reset caller flag (only for the caller)
                setIsCallModalOpen(false);
                setIsCaller(false);
                
                // Update call record to accepted
                if (callRecordIdRef.current) {
                    await updateCallRecord(callRecordIdRef.current, 'accepted');
                    setCallStartTime(Date.now());
                    callStartTimeRef.current = Date.now();
                } else if (data.callId) {
                    await updateCallRecordByCallId(data.callId, 'accepted');
                }
            }
            
            // Handle Call Declined
            if (data.type === 'call_declined' && data.senderId !== userId) {
                stopRingback(); // Stop ringback when call is declined
                if (callTimeoutRef.current) {
                    clearTimeout(callTimeoutRef.current);
                    callTimeoutRef.current = null;
                }
                toast.info("Call declined");
                
                // Update call record to declined
                if (data.callId) {
                    await updateCallRecordByCallId(data.callId, 'declined');
                    // Reload call records
                    const reloadResult = await getCallRecords(roomId);
                    if (reloadResult.success && reloadResult.records) {
                        setCallRecords(reloadResult.records);
                    }
                }
                
                // Clear call state
                setActiveCallToken(null);
                setActiveCallUrl(null);
                setActiveCallType('audio');
                setIsCallModalOpen(false);
                setShowCallBanner(false);
                setIncomingCaller('');
                setIncomingCallId(null);
                setIncomingCallRoomId(null);
                setCallRecordId(null);
                callRecordIdRef.current = null;
                updateUserStatus('online');
                setIsCaller(false);
            }
            
            // Handle Call Termination (for both direct and group calls)
            if (data.type === 'call_ended' && data.senderId !== userId) {
                // Handle for both direct and group calls - stop ringtone/ringback for ALL users
                stopRingtone(); // Stop ringtone when call ends (for receivers)
                stopRingback(); // Stop ringback when call ends (for callers)
                if (callTimeoutRef.current) {
                    clearTimeout(callTimeoutRef.current);
                    callTimeoutRef.current = null;
                }
                
                // Show toast only if user was involved in the call (had UI showing)
                if (activeCallTokenRef.current || isCallModalOpenRef.current || showCallBannerRef.current || incomingCallId) {
                    toast.info("Call ended");
                }
                
                // Calculate duration if call was active
                let durationSeconds: number | undefined = undefined;
                if (callStartTimeRef.current) {
                    durationSeconds = Math.floor((Date.now() - callStartTimeRef.current) / 1000);
                }
                
                // Update call record to ended
                if (callRecordIdRef.current) {
                    await updateCallRecord(callRecordIdRef.current, 'ended', durationSeconds);
                } else if (data.callId) {
                    await updateCallRecordByCallId(data.callId, 'ended', durationSeconds);
                }
                
                // Reload call records
                const reloadResult = await getCallRecords(roomId);
                if (reloadResult.success && reloadResult.records) {
                    setCallRecords(reloadResult.records);
                }
                
                // Force disconnect by clearing ALL call state for EVERYONE
                // This ensures call UI is dismissed for all users when caller cancels
                setActiveCallToken(null);
                setActiveCallUrl(null);
                setActiveCallType('audio');
                setIsCallModalOpen(false);
                setShowCallBanner(false);
                setIncomingCaller('');
                setIncomingCallId(null);
                setIncomingCallRoomId(null);
                setCallRecordId(null);
                callRecordIdRef.current = null;
                setCallStartTime(null);
                callStartTimeRef.current = null;
                updateUserStatus('online');
                setIsCaller(false);
            }
        } catch (e) {
            // Silently handle malformed data
        }
    };
    
    // Set up listener - handle both immediate connection and waiting for connection
    const onConnected = () => {
      liveKitChatRoom.on(RoomEvent.DataReceived, handleData);
    };
    
    // If already connected, set up listener immediately
    if (liveKitChatRoom.state === ConnectionState.Connected) {
      liveKitChatRoom.on(RoomEvent.DataReceived, handleData);
    } else {
      // Wait for connection event
      liveKitChatRoom.on(RoomEvent.Connected, onConnected);
      
      // Also poll in case the event doesn't fire
      const checkConnection = setInterval(() => {
        if (liveKitChatRoom.state === ConnectionState.Connected) {
          liveKitChatRoom.on(RoomEvent.DataReceived, handleData);
          clearInterval(checkConnection);
        } else if (liveKitChatRoom.state === ConnectionState.Disconnected) {
          clearInterval(checkConnection);
        }
      }, 200);
      
      // Cleanup polling after 10 seconds
      setTimeout(() => clearInterval(checkConnection), 10000);
    }
    
    return () => { 
        liveKitChatRoom.off(RoomEvent.DataReceived, handleData);
        liveKitChatRoom.off(RoomEvent.Connected, onConnected);
    };
  }, [liveKitChatRoom, userId, roomId, roomDetails.room_type, updateUserStatus]);

  // Open call modal when notification panel is clicked during incoming call
  useEffect(() => {
    if (isNotificationsOpen && showCallBanner && incomingCaller && !isCallModalOpen) {
      setIsCallModalOpen(true);
    }
  }, [isNotificationsOpen, showCallBanner, incomingCaller, isCallModalOpen]);

  const handleBack = () => {
      router.push('/');
  };

  const handleStartCall = async (type: 'audio' | 'video') => {
      if (isBlocked) {
          toast.error("You cannot call a blocked user.");
          return;
      }
      
      // Stop any existing ringback
      stopRingback();
      
      // Clear any previous call state first
      setShowCallBanner(false);
      setIsCallModalOpen(false);
      setIncomingCaller('');
      setIncomingCallId(null);
      setIncomingCallRoomId(null);
      
      // Show caller modal immediately and start ringback within the user gesture
      setIsCaller(true);
      let calleeName: string;
      if (roomDetails.room_type === 'direct') {
        calleeName = roomDetails.participants?.[0]?.name || roomDetails.name || 'User';
      } else {
        // For group calls, show "Group Call" with member count
        const memberCount = roomDetails.members_count || roomDetails.participants?.length || 0;
        calleeName = memberCount > 0 
          ? `Group (${memberCount} members)` 
          : 'Group Call';
      }
      setIncomingCaller(calleeName);
      setIsCallModalOpen(true);
      playRingback();
      
      updateUserStatus('in-call');
      const toastId = toast.loading("Starting secure call...");
      const res = await initiateCall(roomId, userId, userName, type);
      if (res.success && res.token && res.serverUrl) {
          toast.dismiss(toastId);
          // Ensure token is a string (handle both sync and async toJwt)
          const token = typeof res.token === 'string' ? res.token : await res.token;
          setActiveCallToken(token);
          setActiveCallUrl(res.serverUrl);
          setActiveCallType(type);
          
          // Set call timeout (60 seconds)
          callTimeoutRef.current = setTimeout(async () => {
              stopRingback();
              toast.error('Call timed out - no answer');
              
              // Log timeout
              callLogger.callTimeout({
                  callId: callRecordIdRef.current || undefined,
                  roomId,
                  initiatorId: userId,
                  initiatorName: userName,
                  receiverId: roomDetails.participants?.[0]?.id,
                  receiverName: roomDetails.participants?.[0]?.name,
                  callType: type,
                  reason: 'No answer after 60 seconds'
              });
              
              // Update call record to missed
              if (callRecordIdRef.current) {
                  await updateCallRecord(callRecordIdRef.current, 'missed');
                  // Reload call records
                  const reloadResult = await getCallRecords(roomId);
                  if (reloadResult.success && reloadResult.records) {
                      setCallRecords(reloadResult.records);
                  }
              }
              
              // Send call_ended signal to receiver so they know call timed out
              // Only send if room is still connected (avoid "Room disconnected" errors)
              if (liveKitChatRoom && liveKitChatRoom.state === ConnectionState.Connected && liveKitChatRoom.localParticipant) {
                  try {
                      const payload = JSON.stringify({
                          type: 'call_ended',
                          callId: callRecordIdRef.current ? undefined : `call_${Date.now()}`,
                          senderId: userId,
                          timestamp: Date.now()
                      });
                      const encoder = new TextEncoder();
                      await liveKitChatRoom.localParticipant.publishData(encoder.encode(payload), { reliable: true });
                      console.log('✅ Sent call_ended signal for timeout');
                  } catch (error) {
                      // Silently handle errors - room might have disconnected during timeout
                      if (error instanceof Error && error.message.includes('Room disconnected')) {
                          console.log('⚠️ Cannot send call_ended - room already disconnected');
                      } else {
                          console.warn('Failed to send call_ended signal on timeout:', error);
                      }
                  }
              }
              
              // End the call
              handleEndCall(false);
          }, 60000); // 60 seconds timeout
          
          // Wait for room to be connected, then send call invite
          const waitForConnectionAndSend = async () => {
              if (!liveKitChatRoom) {
                  return;
              }
              
              // Wait for connection with timeout
              const waitForConnection = (): Promise<void> => {
                  return new Promise((resolve, reject) => {
                      if (liveKitChatRoom.state === ConnectionState.Connected) {
                          resolve();
                          return;
                      }
                      
                      const timeout = setTimeout(() => {
                          liveKitChatRoom.off(RoomEvent.Connected, onConnected);
                          reject(new Error('Connection timeout'));
                      }, 10000); // 10 second timeout
                      
                      const onConnected = () => {
                          clearTimeout(timeout);
                          liveKitChatRoom.off(RoomEvent.Connected, onConnected);
                          resolve();
                      };
                      
                      liveKitChatRoom.on(RoomEvent.Connected, onConnected);
                      
                      // Also poll in case event doesn't fire
                      const pollInterval = setInterval(() => {
                          if (liveKitChatRoom.state === ConnectionState.Connected) {
                              clearTimeout(timeout);
                              clearInterval(pollInterval);
                              liveKitChatRoom.off(RoomEvent.Connected, onConnected);
                              resolve();
                          } else if (liveKitChatRoom.state === ConnectionState.Disconnected) {
                              clearTimeout(timeout);
                              clearInterval(pollInterval);
                              liveKitChatRoom.off(RoomEvent.Connected, onConnected);
                              // Resolve silently instead of rejecting - disconnection is a valid state
                              // This prevents "Room disconnected" error from appearing in console
                              // The calling code will check room state before proceeding
                              resolve();
                          }
                      }, 200);
                      
                      // Cleanup polling after timeout
                      setTimeout(() => clearInterval(pollInterval), 10000);
                  });
              };
              
              try {
                  // Wait for connection
                  console.log('Waiting for LiveKit room connection...', liveKitChatRoom.state);
                  await waitForConnection();
                  
                  // Check if room is still connected before proceeding (prevents errors if room disconnected during wait)
                  if (liveKitChatRoom.state !== ConnectionState.Connected) {
                      console.log('⚠️ Room disconnected during wait, aborting call invite');
                      return;
                  }
                  
                  console.log('✅ Room connected, proceeding with call invite');
                  
                  // Wait a bit more for local participant to be ready
                  let attempts = 0;
                  while (!liveKitChatRoom.localParticipant && attempts < 20) {
                      await new Promise(resolve => setTimeout(resolve, 100));
                      attempts++;
                  }
                  
                  if (!liveKitChatRoom.localParticipant) {
                      console.error('Local participant never available after connection');
                      return;
                  }
                  
                  // Send call invite
                  const callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                  
                  // Get receiver ID for direct calls
                  let receiverId: string | null = null;
                  if (roomDetails.room_type === 'direct' && roomDetails.participants) {
                      receiverId = roomDetails.participants.find(p => p.id !== userId)?.id || null;
                  }
                  
                  // Create call record
                  const callRecordResult = await createCallRecord(roomId, userId, receiverId, type, callId);
                  if (callRecordResult.success && callRecordResult.recordId) {
                      setCallRecordId(callRecordResult.recordId);
                      callRecordIdRef.current = callRecordResult.recordId;
                      console.log('✅ Call record created:', callRecordResult.recordId);
                  }
                  
                  const dataPacket = JSON.stringify({
                      type: 'call_invite',
                      callId: callId,
                      roomId: roomId,
                      senderId: userId,
                      senderName: userName,
                      callType: type,
                      timestamp: Date.now()
                  });
                  const encoder = new TextEncoder();
                  
                  // Helper to safely send data (checks connection state first)
                  const safeSendData = async (packet: Uint8Array): Promise<boolean> => {
                      try {
                          if (!liveKitChatRoom || 
                              liveKitChatRoom.state !== ConnectionState.Connected ||
                              !liveKitChatRoom.localParticipant) {
                              return false;
                          }
                          await liveKitChatRoom.localParticipant.publishData(packet, { reliable: true });
                          return true;
                      } catch (err: any) {
                          // Silently handle "PC manager is closed" and similar connection errors
                          if (err?.message?.includes('PC manager') || 
                              err?.message?.includes('closed') ||
                              err?.message?.includes('disconnected')) {
                              console.log('⚠️ Room disconnected, skipping data send');
                              return false;
                          }
                          throw err;
                      }
                  };
                  
                  // Send primary invite
                  const primarySent = await safeSendData(encoder.encode(dataPacket));
                  if (primarySent) {
                      console.log('✅ Call invite sent via client data channel', { callId, roomId, type, roomState: liveKitChatRoom.state });
                  } else {
                      console.log('⚠️ Primary call invite skipped (room not connected)');
                  }
                  
                  // Send backup invites to ensure delivery (with safe send)
                  setTimeout(() => {
                      safeSendData(encoder.encode(dataPacket))
                          .then(sent => sent && console.log('✅ Backup call invite #1 sent'))
                          .catch(() => {});
                  }, 500);
                  
                  setTimeout(() => {
                      safeSendData(encoder.encode(dataPacket))
                          .then(sent => sent && console.log('✅ Backup call invite #2 sent'))
                          .catch(() => {});
                  }, 1500);
                  
                  setTimeout(() => {
                      safeSendData(encoder.encode(dataPacket))
                          .then(sent => sent && console.log('✅ Backup call invite #3 sent'))
                          .catch(() => {});
                  }, 3000);
                  
              } catch (error) {
                  console.error('Failed to wait for connection or send call invite:', error);
                  toast.error('Failed to send call invite. Please try again.');
                  stopRingback(); // Stop ringback on error
              }
          };
          
          // Start the process
          waitForConnectionAndSend();
      } else {
          stopRingback(); // Stop ringback if call failed to start
          updateUserStatus('online'); // Revert on fail
          toast.error("Failed to start call", { id: toastId });
      }
  };

  const handleAnswerCall = async () => {
      stopRingtone(); // Stop ringtone when call is answered
      updateUserStatus('in-call');
      setShowCallBanner(false);
      
      // Mark notification as read when answered
      if (incomingCallNotifId) {
          await supabase
            .from('notifications')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('id', incomingCallNotifId);
          setIncomingCallNotifId(null);
      }
      
      // Determine call type: use incoming call type if available, otherwise use activeCallTypeToJoin for join scenario
      const effectiveCallType = incomingCallId ? callType : (activeCallTypeToJoin || callType);
      
      // Log call acceptance
      callLogger.callAccepted({
          callId: incomingCallId || undefined,
          roomId,
          initiatorId: roomDetails.participants?.[0]?.id || 'unknown',
          initiatorName: incomingCaller || 'Unknown',
          receiverId: userId,
          receiverName: userName,
          callType: effectiveCallType
      });
      
      // Update call record to accepted (if we have the callId from the invite)
      if (incomingCallId) {
          await updateCallRecordByCallId(incomingCallId, 'accepted');
          setCallStartTime(Date.now());
          callStartTimeRef.current = Date.now();
      }
      
      // Send call_accepted signal to caller (so they can stop ringback)
      // Wait for chat room to be connected before sending
      const sendCallAcceptedSignal = async () => {
          // CallOverlay handles sending call_accepted via the call room DataChannel
          // No need to send from chat room as well
      };
      
      // Send signal (fire and forget)
      sendCallAcceptedSignal();
      
      // If call is from a different room, navigate to that room first
      const targetRoomId = incomingCallRoomId || roomId;
      if (targetRoomId !== roomId) {
          // Navigate to the correct chat room
          console.log('📞 Call from different room, navigating to:', targetRoomId);
          router.push(`/chat/${targetRoomId}`);
          // Wait a bit for navigation, then initiate call
          setTimeout(async () => {
              console.log('📞 Navigation complete, initiating call...');
              const res = await initiateCall(targetRoomId, userId, userName, callType);
              console.log('📞 initiateCall response (cross-room):', { success: res.success, hasToken: !!res.token, hasServerUrl: !!res.serverUrl, error: res.error });
              
              if (res.success && res.token && res.serverUrl) {
                  const token = typeof res.token === 'string' ? res.token : await res.token;
                  console.log('📞 Cross-room call successful, setting up overlay...');
                  
                  // Set call state FIRST
                  setActiveCallToken(token);
                  setActiveCallUrl(res.serverUrl);
                  setActiveCallType(callType);
                  
                  // Then close modal
                  setTimeout(() => {
                      setIsCallModalOpen(false);
                      console.log('✅ Cross-room call overlay state set, modal closed');
                  }, 100);
              } else {
                  console.error('❌ Failed to join cross-room call:', res.error);
                  updateUserStatus('online');
                  toast.error(res.error || "Failed to join call");
              }
          }, 500);
      } else {
          // Call is from current room, proceed normally
          console.log('📞 Answering/Joining call - calling initiateCall...', { roomId, userId, effectiveCallType });
          const res = await initiateCall(roomId, userId, userName, effectiveCallType);
          console.log('📞 initiateCall response:', { success: res.success, hasToken: !!res.token, hasServerUrl: !!res.serverUrl, error: res.error });
          
          if (res.success && res.token && res.serverUrl) {
              console.log('📞 Call join successful, setting up call overlay...');
              const token = typeof res.token === 'string' ? res.token : await res.token;
              console.log('📞 Setting state - token length:', token.length, 'serverUrl:', res.serverUrl, 'effectiveCallType:', effectiveCallType);
              
              // Set call state FIRST, then close modal
              // This ensures CallOverlay mounts before modal unmounts
              setActiveCallToken(token);
              setActiveCallUrl(res.serverUrl);
              setActiveCallType(effectiveCallType);
              setCallStartTime(Date.now());
              callStartTimeRef.current = Date.now();
              
              // Clear the "Join Call" state since we're now in the call
              setHasActiveCallToJoin(false);
              setActiveCallTypeToJoin(null);
              
              // Use setTimeout to ensure state has updated before closing modal
              setTimeout(() => {
                  setIsCallModalOpen(false);
                  console.log('✅ Call overlay state set successfully, modal closed');
              }, 100);
          } else {
              console.error('❌ Failed to join call:', res.error || 'Unknown error');
              updateUserStatus('online');
              toast.error(res.error || "Failed to join call");
          }
      }
  };

  const handleDeclineCall = async () => {
      // Stop both ringtone (for receivers) AND ringback (for callers)
      stopRingtone();
      stopRingback();
      
      // Clear call timeout if set
      if (callTimeoutRef.current) {
          clearTimeout(callTimeoutRef.current);
          callTimeoutRef.current = null;
      }
      
      // If this is the CALLER cancelling the call, use the cancel flow
      if (isCaller) {
          // Log call cancellation
          callLogger.callDeclined({
              callId: callRecordIdRef.current || incomingCallId || undefined,
              roomId,
              initiatorId: userId,
              initiatorName: userName,
              receiverId: roomDetails.participants?.[0]?.id,
              receiverName: roomDetails.participants?.[0]?.name,
              callType: activeCallType,
              reason: 'Caller cancelled'
          });
          
          // Cancel the call server-side to notify all recipients
          await cancelCall(roomId, userId);
          
          // Update call record to cancelled/declined
          if (callRecordIdRef.current) {
              await updateCallRecord(callRecordIdRef.current, 'declined');
              const result = await getCallRecords(roomId);
              if (result.success && result.records) {
                  setCallRecords(result.records);
              }
          }
      } else {
          // RECEIVER is declining
          // Log call decline
          callLogger.callDeclined({
              callId: incomingCallId || undefined,
              roomId,
              initiatorId: roomDetails.participants?.[0]?.id || 'unknown',
              initiatorName: incomingCaller,
              receiverId: userId,
              receiverName: userName,
              callType,
              reason: 'User declined'
          });
          
          // Mark notification as read when declined
          if (incomingCallNotifId) {
              await supabase
                .from('notifications')
                .update({ is_read: true, read_at: new Date().toISOString() })
                .eq('id', incomingCallNotifId);
              setIncomingCallNotifId(null);
          }
          
          // Update call record to declined
          if (incomingCallId) {
              await updateCallRecordByCallId(incomingCallId, 'declined');
              const result = await getCallRecords(roomId);
              if (result.success && result.records) {
                  setCallRecords(result.records);
              }
          }
          
          // Notify sender of decline via data channel
          if (liveKitChatRoom && liveKitChatRoom.state === ConnectionState.Connected && incomingCallId) {
              try {
                  const payload = JSON.stringify({
                      type: 'call_declined',
                      callId: incomingCallId,
                      senderId: userId,
                      timestamp: Date.now()
                  });
                  const encoder = new TextEncoder();
                  await liveKitChatRoom.localParticipant.publishData(encoder.encode(payload), { reliable: true });
              } catch (error) {
                  console.warn('Failed to send call decline signal:', error);
              }
          }
      }
      
      // Immediately clear call state to close call overlay
      setActiveCallToken(null);
      setActiveCallUrl(null);
      setActiveCallType('audio');
      setShowCallBanner(false);
      setIsCallModalOpen(false);
      setIncomingCaller('');
      setIncomingCallId(null);
      setIncomingCallRoomId(null);
      setIsCaller(false);
      updateUserStatus('online');
  };

  const handleDeclineWithMessage = async () => {
      stopRingtone(); // Stop ringtone when call is declined
      
      // Update call record to declined
      if (incomingCallId) {
          await updateCallRecordByCallId(incomingCallId, 'declined');
          // Reload call records
          const reloadResult = await getCallRecords(roomId);
          if (reloadResult.success && reloadResult.records) {
              setCallRecords(reloadResult.records);
          }
      }
      
      setShowCallBanner(false);
      setIsCallModalOpen(false);
      setIncomingCaller('');
      setIncomingCallId(null);
      setIncomingCallRoomId(null);
      updateUserStatus('online');
      
      // Notify sender of decline with message via data channel (this will stop their ringback)
      if (liveKitChatRoom && incomingCallId) {
          try {
              const payload = JSON.stringify({
                  type: 'call_declined',
                  callId: incomingCallId,
                  senderId: userId,
                  timestamp: Date.now()
              });
              const encoder = new TextEncoder();
              await liveKitChatRoom.localParticipant.publishData(encoder.encode(payload), { reliable: true });
          } catch (error) {
              console.warn('Failed to send call decline with message signal:', error);
          }
      }
      
      // Focus on message input to allow user to type a message
      // The user can manually send a message explaining why they declined
      toast.info("Call declined. You can send a message to explain.");
  };

  const handleEndCall = async (shouldSignalTerminate: boolean) => {
      // Stop ringback if it's playing (CRITICAL: Must stop before cleanup)
      stopRingback();
      stopRingtone(); // Also stop ringtone in case user was receiving a call
      
      const wasCallActive = callStartTimeRef.current !== null;
      
      // Calculate call duration and update call record
      let durationSeconds: number | undefined = undefined;
      let durationMs: number | undefined = undefined;
      if (callStartTimeRef.current) {
          durationMs = Date.now() - callStartTimeRef.current;
          durationSeconds = Math.floor(durationMs / 1000);
      }
      
      // If caller is cancelling before anyone accepted, use server-side cancel to notify ALL users
      if (isCaller && !wasCallActive) {
          // Call was cancelled before anyone accepted - clean up all notifications server-side
          await cancelCall(roomId, userId);
      }
      
      // Log call end
      callLogger.callEnded({
          callId: callRecordIdRef.current || incomingCallId || undefined,
          roomId,
          initiatorId: isCaller ? userId : (roomDetails.participants?.[0]?.id || 'unknown'),
          initiatorName: isCaller ? userName : incomingCaller,
          receiverId: isCaller ? (roomDetails.participants?.[0]?.id || undefined) : userId,
          receiverName: isCaller ? (roomDetails.participants?.[0]?.name || undefined) : userName,
          callType: activeCallType,
          duration: durationMs
      });
      
      // Update call record to ended
      if (callRecordIdRef.current) {
          await updateCallRecord(callRecordIdRef.current, 'ended', durationSeconds);
      } else if (incomingCallId) {
          await updateCallRecordByCallId(incomingCallId, 'ended', durationSeconds);
      }
      
      // Reload call records to show updated record
      const reloadResult = await getCallRecords(roomId);
      if (reloadResult.success && reloadResult.records) {
          setCallRecords(reloadResult.records);
      }
      
      // Clear call state first to disconnect the overlay
      setActiveCallToken(null);
      setActiveCallUrl(null);
      setActiveCallType('audio');
      setShowCallBanner(false);
      setIsCallModalOpen(false);
      setIncomingCaller('');
      setIncomingCallId(null);
      setIncomingCallRoomId(null);
      setCallRecordId(null);
      callRecordIdRef.current = null;
      setIsCaller(false);
      setCallStartTime(null);
      callStartTimeRef.current = null;
      updateUserStatus('online');
      
      // Always try to send call_ended signal if we have a liveKit room (for timeout and normal end cases)
      // This ensures the receiver knows the call ended even if it timed out
      if (liveKitChatRoom) {
          try {
              // Check if room is still connected before attempting to publish
              if (liveKitChatRoom.state !== ConnectionState.Connected) {
                  console.log('Room is not connected, skipping call end signal');
              } else if (!liveKitChatRoom.localParticipant) {
                  console.log('Local participant not available, skipping call end signal');
              } else {
                  // Broadcast end signal to the chat room
                  const payload = JSON.stringify({
                      type: 'call_ended',
                      callId: callRecordIdRef.current ? undefined : incomingCallId,
                      senderId: userId,
                      timestamp: Date.now()
                  });
                  const encoder = new TextEncoder();
                  await liveKitChatRoom.localParticipant.publishData(encoder.encode(payload), { reliable: true });
                  console.log('Call end signal sent');
              }
          } catch (error) {
              // Gracefully handle errors (connection closed, PC manager closed, etc.)
              console.warn('Failed to send call end signal:', error);
              // Don't throw - this is a non-critical operation
          }
      }
  };

  const handleBlockToggle = async () => {
    if (roomDetails.room_type !== 'direct') return;
    setIsMenuOpen(false);
    if (isBlocked && blockedByMe) {
        const toastId = toast.loading("Unblocking user...");
        const res = await unblockUserInRoom(roomId);
        if (res.success) {
            setIsBlocked(false);
            setBlockedByMe(false);
            toast.success("User has been unblocked", { id: toastId });
        } else {
            toast.error(res.error || "Failed to unblock user", { id: toastId });
        }
    } else if (!isBlocked) {
        const toastId = toast.loading("Blocking user...");
        const res = await blockUserInRoom(roomId);
        if (res.success) {
            setIsBlocked(true);
            setBlockedByMe(true);
            toast.success("User has been blocked", { id: toastId });
        } else {
            toast.error(res.error || "Failed to block user", { id: toastId });
        }
    }
  };

  const handleClearChat = () => {
      setIsMenuOpen(false);
      setShowClearChatConfirm(true);
  };

  const handleConfirmClearChat = async () => {
      setShowClearChatConfirm(false);
      
      const toastId = toast.loading("Clearing chat...");
      
      try {
          const { clearChatForUser } = await import('../../actions/chat');
          const result = await clearChatForUser(roomId);
          
          if (result.success) {
              toast.dismiss(toastId);
              toast.success("Chat cleared successfully");
              
              // Reload messages to get the filtered list (without hidden messages)
              if (reloadMessages) {
                  await reloadMessages();
              } else {
                  // Fallback: reload page if reloadMessages is not available
                  window.location.reload();
              }
          } else {
              toast.dismiss(toastId);
              toast.error(result.error || "Failed to clear chat");
          }
      } catch (error) {
          toast.dismiss(toastId);
          console.error('Error clearing chat:', error);
          toast.error("Failed to clear chat");
      }
  };

  const filteredMessages = useMemo(() => {
    if (!debouncedQuery.trim()) return messages;
    const lowerQuery = debouncedQuery.toLowerCase();
    return messages.filter((msg: any) => {
        const textMatch = msg.text?.toLowerCase().includes(lowerQuery);
        const translationMatch = msg.translations && Object.values(msg.translations).some((t: any) => typeof t === 'string' && t.toLowerCase().includes(lowerQuery));
        return textMatch || translationMatch;
    });
  }, [messages, debouncedQuery]);

  // Helper for Status UI
  const getStatusColor = (s: UserStatus) => {
      switch(s) {
          case 'online': return 'bg-green-500';
          case 'busy': return 'bg-red-500';
          case 'dnd': return 'bg-red-500'; // Could include icon
          case 'in-call': return 'bg-aurora-purple';
          case 'invisible':
          case 'offline': 
          default: return 'bg-slate-500';
      }
  };

  const getStatusText = (s: UserStatus) => {
      switch(s) {
          case 'online': return 'Online';
          case 'busy': return 'Busy';
          case 'dnd': return 'Do Not Disturb';
          case 'in-call': return 'In a Call';
          case 'offline': default: return 'Offline';
      }
  };

  if (error) return <div className="p-8 text-center text-red-400">{error}</div>;

  // Mouse-follow effect for Spatial Nebula
  const chatRoomRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!chatRoomRef.current) return;
    const rect = chatRoomRef.current.getBoundingClientRect();
    // Calculate mouse position as percentage (0-100)
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    // Update CSS variables for mouse-follow effect (subtle parallax)
    // Store as numeric value for calc() operations
    chatRoomRef.current.style.setProperty('--mouse-x', `${x}`);
    chatRoomRef.current.style.setProperty('--mouse-y', `${y}`);
  };

  // Call overlay state tracking (no logging)

  return (
    <div 
      ref={chatRoomRef}
      className="relative w-full h-full flex flex-col overflow-hidden rounded-3xl border border-white/5 bg-[#03030b] isolate z-0"
      onMouseMove={handleMouseMove}
      style={{
        '--mouse-x': '50',
        '--mouse-y': '50',
      } as React.CSSProperties}
    >
      {/* Spatial Nebula Background System - Removed fixed background to allow global gradient to show through */}
      
      {/* Nebula Blobs with Mouse-Follow Effect */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        {/* Blob 1: Indigo - scale(1.5), 20s duration */}
        <div 
          className="absolute nebula-blob-1"
          style={{
            background: 'radial-gradient(circle, rgba(79, 70, 229, 0.1) 0%, transparent 70%)',
            width: '600px',
            height: '600px',
            borderRadius: '50%',
            filter: 'blur(80px)',
            left: 'calc(20% + (var(--mouse-x, 50) - 50) * 0.1px)',
            top: 'calc(30% + (var(--mouse-y, 50) - 50) * 0.1px)',
          }}
        />
        
        {/* Blob 2: Purple - scale(2), 25s duration, opposite direction */}
        <div 
          className="absolute nebula-blob-2"
          style={{
            background: 'radial-gradient(circle, rgba(147, 51, 234, 0.1) 0%, transparent 70%)',
            width: '800px',
            height: '800px',
            borderRadius: '50%',
            filter: 'blur(100px)',
            right: 'calc(15% - (var(--mouse-x, 50) - 50) * 0.15px)',
            bottom: 'calc(20% - (var(--mouse-y, 50) - 50) * 0.15px)',
          }}
        />
        
        {/* Blob 3: Blue - scale(1.2), 15s duration */}
        <div 
          className="absolute nebula-blob-3"
          style={{
            background: 'radial-gradient(circle, rgba(59, 130, 246, 0.05) 0%, transparent 70%)',
            width: '500px',
            height: '500px',
            borderRadius: '50%',
            filter: 'blur(60px)',
            left: 'calc(50% + (var(--mouse-x, 50) - 50) * 0.08px)',
            top: 'calc(50% + (var(--mouse-y, 50) - 50) * 0.08px)',
          }}
        />
      </div>
      
      {/* Invisible Click Shield - Prevents clicks on header icons when notifications are open */}
      {isNotificationsOpen && (
        <div 
          className="fixed inset-0 z-40 pointer-events-auto"
          onClick={() => setIsNotificationsOpen(false)}
        />
      )}
      
      {/* --- FLOATING PANE HEADER --- */}
      <div className="sticky top-0 z-50 w-full shrink-0 -mx-4 px-4 -mt-4 pt-4 md:-mx-8 md:px-8 bg-[#0B0D12]/80 backdrop-blur-xl border-b border-white/5">
        <div 
          className="relative h-20 flex items-center mx-2 sm:mx-4 my-2 rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-md floating-header-pane shadow-lg shadow-black/20"
        >
          {/* AURORA ANIMATION LAYER: Pulls from your globals.css */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute top-[-40%] left-[-10%] w-[250px] h-[250px] bg-indigo-500/15 blur-[60px] rounded-full animate-aurora-1" />
            <div className="absolute bottom-[-40%] right-[-10%] w-[250px] h-[250px] bg-purple-500/15 blur-[60px] rounded-full animate-aurora-2" />
          </div>

          {/* CONTENT: Full width on mobile, max-w-4xl on larger screens */}
          <div className="max-w-4xl mx-auto w-full px-3 sm:px-6 flex items-center justify-between relative z-10">
            {isSearchOpen ? (
              <div className="flex items-center w-full gap-3 animate-in fade-in slide-in-from-top-1">
                <Search className="text-indigo-400 w-5 h-5" />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search conversation..." 
                  className="aurora-search-input bg-transparent border-b border-white/5 focus:border-indigo-500/50 focus:ring-0 text-white w-full text-sm transition-all duration-500"
                  autoFocus
                />
                <button onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }}><X size={20} className="text-white/40" /></button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
                  <button onClick={handleBack} className="text-white/70 hover:text-white transition-colors shrink-0">
                    <ArrowLeft size={22} />
                  </button>
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    {roomDetails.room_type === 'group' ? (
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-[0_0_15px_rgba(99,102,241,0.4)] shrink-0">
                        <Users size={18} className="sm:w-5 sm:h-5" />
                      </div>
                    ) : (
                      <div className="relative shrink-0">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-tr from-indigo-500/40 to-purple-500/40 p-[1px]">
                          <div className="w-full h-full rounded-full bg-[#03030b] flex items-center justify-center overflow-hidden">
                            {roomDetails.participants?.[0]?.avatar ? (
                              <img src={roomDetails.participants[0].avatar} className="w-full h-full object-cover" alt="" />
                            ) : (
                              <span className="text-white text-xs font-bold">{roomDetails.name[0]}</span>
                            )}
                          </div>
                        </div>
                        {!isBlocked && (
                          <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#03030b] ${getStatusColor(directPartnerStatus)}`}></div>
                        )}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h2 className="text-white font-bold text-sm sm:text-base tracking-tight leading-none mb-1 flex items-center gap-1 sm:gap-2 min-w-0">
                        <span className="truncate min-w-0">
                          {(() => {
                            if (roomDetails.room_type === 'direct' && roomDetails.participants?.[0]?.name) {
                              return roomDetails.participants[0].name;
                            }
                            if (roomDetails.name && roomDetails.name !== 'Loading...' && roomDetails.name !== 'Unknown') {
                              return roomDetails.name;
                            }
                            return roomDetails.participants?.[0]?.name || 'Chat';
                          })()}
                        </span>
                        {isBlocked && <Ban size={14} className="text-red-400 shrink-0" />}
                        {/* Ambient Security Shield */}
                        <div className="relative group/shield shrink-0">
                          <ShieldCheck size={12} className="text-emerald-500 animate-pulse" />
                          {/* Glass Tooltip */}
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg bg-white/10 backdrop-blur-md border border-white/20 shadow-lg opacity-0 group-hover/shield:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                            <p className="text-xs text-white/90 font-medium">E2EE Secured by Translatr Protocol</p>
                            {/* Tooltip Arrow */}
                            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-white/10 border-r border-b border-white/20 rotate-45"></div>
                          </div>
                        </div>
                      </h2>
                      <div className="flex items-center gap-1.5">
                        {roomDetails.room_type === 'group' ? (
                          <div className="relative" ref={groupListRef}>
                            <button 
                              onClick={() => setIsGroupMembersOpen(!isGroupMembersOpen)}
                              className="flex items-center gap-1.5 hover:text-white transition-colors"
                            >
                              <span className="text-xs font-medium text-indigo-400 flex items-center gap-1.5">
                                <span className="w-1 h-1 bg-indigo-400 rounded-full"></span>
                                {roomDetails.members_count} members ({onlineGroupMembers.length} online)
                              </span>
                              <ChevronDown size={10} className="text-indigo-400" />
                            </button>
                            {isGroupMembersOpen && (
                              <div className="absolute top-full left-0 mt-2 w-56 glass-strong rounded-xl border border-white/10 shadow-2xl overflow-hidden z-[60] animate-in fade-in zoom-in-95 duration-200">
                                <div className="px-3 py-2 border-b border-white/5 bg-white/5">
                                  <span className="text-[10px] font-bold uppercase text-white/50 tracking-wider">Online Members</span>
                                </div>
                                <div className="max-h-48 overflow-y-auto">
                                  {onlineGroupMembers.length > 0 ? (
                                    onlineGroupMembers.map(m => (
                                      <div key={m.id} className="flex items-center gap-3 px-3 py-2 hover:bg-white/5 transition-colors">
                                        <div className="relative">
                                          <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-[10px]">
                                            {m.avatar ? <img src={m.avatar} className="w-full h-full rounded-full" /> : m.name[0]}
                                          </div>
                                          <div className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-slate-900 ${getStatusColor(onlineUsers[m.id] as UserStatus)}`}></div>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm text-white truncate">{m.name}</p>
                                          <p className="text-[10px] text-white/40 capitalize">{getStatusText(onlineUsers[m.id] as UserStatus)}</p>
                                        </div>
                                      </div>
                                    ))
                                  ) : (
                                    <div className="px-3 py-4 text-center text-xs text-white/30">No one else is online</div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            {/* Status removed - security shown in header shield icon */}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                  {!isBlocked && (
                    <>
                      {hasActiveCallToJoin && activeCallTypeToJoin ? (
                        <button 
                          onClick={() => handleAnswerCall()} 
                          className="px-3 py-1.5 sm:px-4 sm:py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all flex items-center gap-2 shadow-lg shadow-green-500/20 hover:shadow-green-500/40 animate-pulse"
                        >
                          <Phone size={16} className="sm:w-4 sm:h-4" />
                          <span className="text-xs sm:text-sm font-medium">Join Call</span>
                        </button>
                      ) : (
                        <>
                          <button onClick={() => handleStartCall('audio')} className="p-1.5 sm:p-2 hover:bg-white/5 rounded-lg text-white/60 hover:text-green-400 transition-colors">
                            <Phone size={18} className="sm:w-5 sm:h-5" />
                          </button>
                          <button onClick={() => handleStartCall('video')} className="p-1.5 sm:p-2 hover:bg-white/5 rounded-lg text-white/60 hover:text-indigo-400 transition-colors">
                            <Video size={18} className="sm:w-5 sm:h-5" />
                          </button>
                        </>
                      )}
                    </>
                  )}
                  
                  {/* Desktop-only action icons (hidden on mobile) */}
                  <div className="hidden md:flex items-center gap-1">
                    <button 
                      onClick={() => setIsSearchOpen(true)} 
                      className="p-2 hover:bg-white/5 rounded-lg text-white/60 hover:text-white transition-colors"
                      title="Search Messages"
                    >
                      <Search size={18} />
                    </button>
                    <button 
                      onClick={() => setIsNotificationsMuted(!isNotificationsMuted)} 
                      className="p-2 hover:bg-white/5 rounded-lg text-white/60 hover:text-white transition-colors"
                      title={isNotificationsMuted ? 'Unmute Notifications' : 'Mute Notifications'}
                    >
                      {isNotificationsMuted ? <Bell size={18} className="text-green-400" /> : <BellOff size={18} />}
                    </button>
                    <button 
                      onClick={() => setIsTranslationEnabled(!isTranslationEnabled)} 
                      className="p-2 hover:bg-white/5 rounded-lg text-white/60 hover:text-white transition-colors"
                      title={isTranslationEnabled ? 'Translation On' : 'Translate Messages'}
                    >
                      <Languages size={18} className={isTranslationEnabled ? "text-aurora-indigo" : ""} />
                    </button>
                    <button 
                      onClick={() => setIsMediaDrawerOpen(true)} 
                      className="p-2 hover:bg-white/5 rounded-lg text-white/60 hover:text-white transition-colors"
                      title="Media & Files"
                    >
                      <ImageIcon size={18} />
                    </button>
                    {roomDetails.room_type === 'direct' && (
                      <button 
                        onClick={handleBlockToggle} 
                        className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                        disabled={isBlocked && !blockedByMe}
                        title={isBlocked && blockedByMe ? 'Unblock User' : 'Block User'}
                      >
                        {isBlocked && blockedByMe ? (
                          <Unlock size={18} className="text-green-400" />
                        ) : (
                          <Ban size={18} className={isBlocked && !blockedByMe ? "text-white/30" : "text-red-400"} />
                        )}
                      </button>
                    )}
                    {roomDetails.room_type === 'group' && (
                      <button 
                        onClick={() => setIsGroupMembersOpen(true)} 
                        className="p-2 hover:bg-white/5 rounded-lg text-white/60 hover:text-indigo-400 transition-colors"
                        title="Group Info"
                      >
                        <Users size={18} />
                      </button>
                    )}
                    <div className="w-px h-5 bg-white/10 mx-1" />
                    <button 
                      onClick={handleClearChat} 
                      className="p-2 hover:bg-white/5 rounded-lg text-red-400/60 hover:text-red-400 transition-colors"
                      title="Clear Chat"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>

                  {/* Mobile-only: Show muted indicator and three-dots menu */}
                  {isNotificationsMuted && (
                    <div className="md:hidden p-1.5 rounded-lg text-red-400" title="Notifications muted for this chat">
                      <BellOff size={18} />
                    </div>
                  )}
                  <button 
                    ref={menuRef}
                    onClick={() => setIsMenuOpen(!isMenuOpen)} 
                    className={`md:hidden p-1.5 sm:p-2 hover:bg-white/5 rounded-lg text-white/60 transition-colors ${isMenuOpen ? 'bg-white/5 text-white' : ''}`}
                  >
                    <MoreVertical size={18} className="sm:w-5 sm:h-5" />
                  </button>
                  {isMenuOpen && menuPosition && typeof document !== 'undefined' && createPortal(
                    <div 
                      className="menu-dropdown-portal fixed w-56 z-[100] rounded-xl py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top-right"
                      style={{
                        top: `${menuPosition.top}px`,
                        right: `${menuPosition.right}px`,
                        background: 'rgba(5, 5, 16, 0.9)',
                        backdropFilter: 'blur(24px) saturate(180%)',
                        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
                      }}
                    >
                      <button onClick={() => { setIsSearchOpen(true); setIsMenuOpen(false); }} className="w-full text-left px-4 py-3.5 hover:bg-white/5 transition-colors text-white/80 hover:text-white text-sm flex items-center gap-3">
                        <Search size={16} /> Search Messages
                      </button>
                      <button onClick={() => { setIsNotificationsMuted(!isNotificationsMuted); setIsMenuOpen(false); }} className="w-full text-left px-4 py-3.5 hover:bg-white/5 transition-colors text-white/80 hover:text-white text-sm flex items-center gap-3">
                        {isNotificationsMuted ? (
                          <>
                            <Bell size={16} className="text-green-400" />
                            <span className="text-green-400">Unmute Notifications</span>
                          </>
                        ) : (
                          <>
                            <BellOff size={16} />
                            <span>Mute Notifications</span>
                          </>
                        )}
                      </button>
                      <button onClick={() => { setIsTranslationEnabled(!isTranslationEnabled); setIsMenuOpen(false); }} className="w-full text-left px-4 py-3.5 hover:bg-white/5 transition-colors text-white/80 hover:text-white text-sm flex items-center gap-3">
                        <Languages size={16} className={isTranslationEnabled ? "text-aurora-indigo" : "text-white/50"} />
                        <span className={isTranslationEnabled ? "text-white" : "text-white/70"}>{isTranslationEnabled ? 'Translation On' : 'Translate Messages'}</span>
                      </button>
                      <button onClick={() => { setIsMediaDrawerOpen(true); setIsMenuOpen(false); }} className="w-full text-left px-4 py-3.5 hover:bg-white/5 transition-colors text-white/80 hover:text-white text-sm flex items-center gap-3">
                        <ImageIcon size={16} /> Media & Files
                      </button>
                      {roomDetails.room_type === 'direct' && (
                        <button onClick={handleBlockToggle} className="w-full text-left px-4 py-3.5 hover:bg-white/5 transition-colors text-white/80 hover:text-white text-sm flex items-center gap-3" disabled={isBlocked && !blockedByMe}>
                          {isBlocked && blockedByMe ? <><Unlock size={16} className="text-green-400" /><span className="text-green-400">Unblock User</span></> : <><Ban size={16} className={isBlocked && !blockedByMe ? "text-white/30" : "text-red-400"} /><span className={isBlocked && !blockedByMe ? "text-white/30" : "text-red-400"}>{isBlocked && !blockedByMe ? 'Blocked by User' : 'Block User'}</span></>}
                        </button>
                      )}
                      {roomDetails.room_type === 'group' && (
                        <button 
                          onClick={() => { 
                            setIsGroupMembersOpen(true); 
                            setIsMenuOpen(false); 
                          }} 
                          className="w-full text-left px-4 py-3.5 hover:bg-white/5 transition-colors text-white/80 hover:text-white text-sm flex items-center gap-3"
                        >
                          <Users size={16} className="text-indigo-400" />
                          <span className="text-indigo-400">Group Info</span>
                        </button>
                      )}
                      <div className="h-px bg-white/10 my-1 mx-2" />
                      <button onClick={handleClearChat} className="w-full text-left px-4 py-3.5 hover:bg-white/5 transition-colors text-red-400/80 hover:text-red-400 text-sm flex items-center gap-3">
                        <Trash2 size={16} /> Clear Chat
                      </button>
                    </div>,
                    document.body
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* CSS INJECTION: Spatial Nebula Animations */}
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes nebula-blob-1 {
            0% { 
              transform: translate(0, 0) scale(1.5);
              opacity: 0.6;
            }
            50% {
              transform: translate(30px, 40px) scale(1.6);
              opacity: 0.8;
            }
            100% { 
              transform: translate(-20px, -30px) scale(1.5);
              opacity: 0.6;
            }
          }
          
          @keyframes nebula-blob-2 {
            0% { 
              transform: translate(0, 0) scale(2);
              opacity: 0.5;
            }
            50% {
              transform: translate(-40px, 50px) scale(2.1);
              opacity: 0.7;
            }
            100% { 
              transform: translate(30px, -40px) scale(2);
              opacity: 0.5;
            }
          }
          
          @keyframes nebula-blob-3 {
            0% { 
              transform: translate(0, 0) scale(1.2);
              opacity: 0.4;
            }
            50% {
              transform: translate(25px, -35px) scale(1.3);
              opacity: 0.6;
            }
            100% { 
              transform: translate(-15px, 25px) scale(1.2);
              opacity: 0.4;
            }
          }
          
          .nebula-blob-1 {
            animation: nebula-blob-1 20s infinite ease-in-out;
          }
          
          .nebula-blob-2 {
            animation: nebula-blob-2 25s infinite ease-in-out;
            animation-delay: -5s;
          }
          
          .nebula-blob-3 {
            animation: nebula-blob-3 15s infinite ease-in-out;
            animation-delay: -10s;
          }
          
          .aurora-search-input:focus {
            text-shadow: 0 0 8px rgba(255, 255, 255, 0.3);
          }
          
          /* Top-Down Light Source Effect */
          .floating-header-pane::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 40%;
            background: linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, transparent 100%);
            pointer-events: none;
            border-radius: 1rem 1rem 0 0;
          }
        `}} />
      </div>

      <MessageList 
        messages={filteredMessages}
        callRecords={callRecords}
        currentUserId={userId}
        userPreferredLanguage={userPreferredLanguage} 
        isTranslationEnabled={isTranslationEnabled}
        isNotificationsOpen={isNotificationsOpen}
        isGroup={roomDetails.room_type === 'group'}
        roomName={roomDetails.name}
        roomParticipants={roomDetails.participants || []}
      />
      
      {/* Input with Fast P2P Send */}
      <MessageInput 
        roomId={roomId}
        userId={userId}
        userName={userName}
        isConnected={isConnected}
        disabled={isBlocked}
        sendRealtimeMessage={sendRealtimeMessage} // Pass the P2P function
      />

      {/* Call Notification Banner */}
      {showCallBanner && incomingCaller && (
        <CallNotificationBanner
          callerName={incomingCaller}
          callType={callType}
          onAccept={handleAnswerCall}
          onDecline={handleDeclineCall}
          onDeclineWithMessage={handleDeclineWithMessage}
          onDismiss={handleDeclineCall}
        />
      )}

      <LiveKitCallModal 
        isOpen={isCallModalOpen} 
        callerName={incomingCaller} 
        callType={callType} 
        onAnswer={handleAnswerCall} 
        onDecline={handleDeclineCall}
        onDeclineWithMessage={handleDeclineWithMessage}
        isCallActive={false} 
        isSender={isCaller}
      />
      
      {/* 
        CallOverlay renders when:
        1. We have a token and URL (call is active)
        2. Either: modal is closed (normal call view) OR we are the caller (waiting for answer)
        
        For callers: We MUST join the LiveKit room while showing ringback modal
        so we can detect when someone accepts (ParticipantConnected event)
        The 'hidden' prop keeps the overlay invisible while caller waits for answer
      */}
      {activeCallToken && activeCallUrl && (!isCallModalOpen || isCaller) && (
          <CallOverlay 
            token={activeCallToken} 
            serverUrl={activeCallUrl} 
            roomName={roomDetails.name} 
            roomType={roomDetails.room_type}
            callType={activeCallType}
            onDisconnect={handleCallDisconnect} 
            userPreferredLanguage={userPreferredLanguage}
            userId={userId}
            hidden={isCaller && isCallModalOpen} // Hide overlay while caller waits for answer
            onParticipantJoined={() => {
              // When a participant joins the call room, stop ringback (fallback if call_accepted signal failed)
              if (isCaller && ringbackRef.current) {
                console.log('📞 Participant joined call room, stopping ringback');
                stopRingback();
                if (callTimeoutRef.current) {
                  clearTimeout(callTimeoutRef.current);
                  callTimeoutRef.current = null;
                }
                setIsCallModalOpen(false);
                setIsCaller(false);
                
                // Update call record if needed
                if (callRecordIdRef.current && callStartTimeRef.current === null) {
                  updateCallRecord(callRecordIdRef.current, 'accepted');
                  setCallStartTime(Date.now());
                  callStartTimeRef.current = Date.now();
                }
              }
            }}
            onCallAccepted={(callId?: string) => {
              // Handle call_accepted signal received from call room DataChannel
              if (isCaller) {
                stopRingback();
                if (callTimeoutRef.current) {
                  clearTimeout(callTimeoutRef.current);
                  callTimeoutRef.current = null;
                }
                setIsCallModalOpen(false);
                setIsCaller(false);
                
                // Update call record if needed
                if (callRecordIdRef.current && callStartTimeRef.current === null) {
                  updateCallRecord(callRecordIdRef.current, 'accepted');
                  setCallStartTime(Date.now());
                  callStartTimeRef.current = Date.now();
                } else if (callId) {
                  updateCallRecordByCallId(callId, 'accepted');
                }
              }
            }}
          />
      )}

      <MediaDrawer isOpen={isMediaDrawerOpen} onClose={() => setIsMediaDrawerOpen(false)} messages={messages} roomName={roomDetails.name} />
      
      {/* Clear Chat Confirmation Modal */}
      <ConfirmModal
        isOpen={showClearChatConfirm}
        onClose={() => setShowClearChatConfirm(false)}
        onConfirm={handleConfirmClearChat}
        title="Clear Chat History"
        message="Are you sure you want to clear this chat? This will hide all messages for you, but the other user will still see them."
        confirmText="Clear Chat"
        cancelText="Cancel"
        confirmVariant="danger"
      />
    </div>
  );
};

export default ChatRoom;