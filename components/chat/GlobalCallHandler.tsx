"use client";

import React, { useEffect, useState, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter, usePathname } from "next/navigation";
import CallNotificationBanner from "./CallNotificationBanner";
import { useNotification } from "../contexts/NotificationContext";
import { toast } from "sonner";
import { callLogger } from "@/utils/callLogger";
import { updateCallRecordByCallId } from "@/actions/callRecords";

interface CallNotification {
  id: string;
  recipient_id: string;
  type: "call";
  content: {
    sender_name: string;
    call_type: "audio" | "video";
    call_id: string;
    room_id: string;
  };
  related_id: string;
  created_at: string;
  is_read?: boolean;
}

export default function GlobalCallHandler() {
  const supabase = createClient();
  const router = useRouter();
  const pathname = usePathname();
  const { currentRoomId } = useNotification();
  const [incomingCall, setIncomingCall] = useState<CallNotification | null>(null);
  const incomingCallRef = useRef<CallNotification | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const processedCallIdsRef = useRef<Set<string>>(new Set());

  // Sync ref with state
  useEffect(() => {
    incomingCallRef.current = incomingCall;
  }, [incomingCall]);

  const mountedRef = useRef(true);
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);
  const ringtoneIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioUnlockedRef = useRef<boolean>(false);
  const pendingRingtoneRef = useRef<boolean>(false);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    // Initialize ringtone audio
    const audio = new Audio("/sounds/ringtone.mp3");
    audio.volume = 0.7;
    audio.loop = true;
    audio.preload = "auto";
    ringtoneRef.current = audio;

    // Unlock audio on user interaction
    const unlockAudio = async () => {
      try {
        audioUnlockedRef.current = true;
        // If we had a pending ringtone, start it now
        if (pendingRingtoneRef.current && ringtoneRef.current) {
          pendingRingtoneRef.current = false;
          try {
            await ringtoneRef.current.play();
          } catch {}
        }
      } catch (_e) {
        // Ringtone audio unlock error - silently handle
      }
    };

    const events = ["click", "touchstart", "keydown", "mousedown", "pointerdown"];
    const handlers: Array<() => void> = [];

    events.forEach((event) => {
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
      } catch (_err: unknown) {
        // Could not play ringtone - queue pending play until audio is unlocked via user interaction
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
    if (incomingCallRef.current) {
      callLogger.callUIHidden({
        callId: incomingCallRef.current.content.call_id,
        roomId: incomingCallRef.current.content.room_id,
        reason,
        deviceInfo: "GlobalCallHandler",
      });

      if (reason.includes("read") || reason.includes("deleted")) {
        callLogger.callCancelled({
          callId: incomingCallRef.current.content.call_id,
          roomId: incomingCallRef.current.content.room_id,
          reason,
          deviceInfo: "GlobalCallHandler",
        });
      }
    }

    stopRingtone();
    setShowBanner(false);
    setIncomingCall(null);
  };

  useEffect(() => {
    const setupCallListener = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !mountedRef.current) {
        return;
      }
      userIdRef.current = user.id;

      // Fetch initial unread call notifications
      const { data: existingCalls } = await supabase
        .from("notifications")
        .select("*")
        .eq("recipient_id", user.id)
        .eq("type", "call")
        .eq("is_read", false)
        .order("created_at", { ascending: false })
        .limit(1);

      if (existingCalls && existingCalls.length > 0 && mountedRef.current) {
        const latestCall = existingCalls[0] as CallNotification;

        if (!processedCallIdsRef.current.has(latestCall.id)) {
          // Check if user is currently in the chatroom for this call
          const callRoomId = latestCall.content.room_id;
          const isInChatroom = currentRoomId === callRoomId || pathname === `/chat/${callRoomId}`;

          if (isInChatroom) {
            // Don't mark as read here - let ChatRoom handle it
            // This prevents race condition where notification is marked read before ChatRoom can display it
            return; // Don't show banner if user is in the chatroom
          }

          processedCallIdsRef.current.add(latestCall.id);
          setIncomingCall(latestCall);
          setShowBanner(true);
          playRingtone();
        }
      }

      // Subscribe to new call notifications with unique channel name to avoid conflicts
      const channelName = `global-call-notifications-${user.id}-${Date.now()}`;
      const channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `recipient_id=eq.${user.id}`,
          },
          async (payload) => {
            if (!mountedRef.current) return;

            const notification = payload.new as CallNotification;

            if (notification.type === "call" && !notification.is_read) {
              const callNotif = notification;

              // Avoid processing the same call twice
              if (processedCallIdsRef.current.has(callNotif.id)) {
                return;
              }

              processedCallIdsRef.current.add(callNotif.id);

              // Check if user is currently in the chatroom for this call
              const callRoomId = callNotif.content.room_id;
              const isInChatroom =
                currentRoomId === callRoomId || pathname === `/chat/${callRoomId}`;

              if (isInChatroom) {
                // Don't mark as read here - let ChatRoom handle it
                // This prevents race condition where notification is marked read before ChatRoom can display it
                return; // Don't show banner if user is in the chatroom
              }

              setIncomingCall(callNotif);
              setShowBanner(true);

              // Play ringtone continuously
              playRingtone();

              callLogger.callUIShown({
                callId: callNotif.content.call_id,
                roomId: callNotif.content.room_id,
                initiatorName: callNotif.content.sender_name,
                receiverId: user.id,
                callType: callNotif.content.call_type,
                deviceInfo: "GlobalCallHandler",
              });

              callLogger.callRinging({
                callId: callNotif.content.call_id,
                roomId: callNotif.content.room_id,
                deviceInfo: "GlobalCallHandler",
              });

              toast.info(
                `Incoming ${callNotif.content.call_type} call from ${callNotif.content.sender_name}`
              );
            }
          }
        )
        .subscribe(() => {
          // Notification channel subscription status - silently handle
        });

      // Subscribe to notification updates/deletes so the banner closes if the call is ended elsewhere
      const notifUpdatesChannelName = `global-call-notification-updates-${user.id}-${Date.now()}`;
      const notifUpdatesChannel = supabase
        .channel(notifUpdatesChannelName)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "notifications",
            filter: `recipient_id=eq.${user.id}`,
          },
          async (payload) => {
            if (!mountedRef.current) return;
            const updated = payload.new as { id?: string; is_read?: boolean };
            // If the current incoming call notification was marked read, close banner
            const currentCall = incomingCallRef.current;
            if (currentCall && updated?.id === currentCall.id && updated?.is_read) {
              await clearIncomingCallUI("notification marked read");
            }
          }
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "notifications",
            filter: `recipient_id=eq.${user.id}`,
          },
          async (payload) => {
            if (!mountedRef.current) return;
            const deleted = payload.old as { id?: string };
            const currentCall = incomingCallRef.current;
            if (currentCall && deleted?.id === currentCall.id) {
              await clearIncomingCallUI("notification deleted");
            }
          }
        )
        .subscribe();

      // Also subscribe to call record updates to detect when calls end/timeout
      const callRecordsChannelName = `global-call-records-${user.id}-${Date.now()}`;
      const callRecordsChannel = supabase
        .channel(callRecordsChannelName)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "call_records",
            filter: `receiver_id=eq.${user.id}`,
          },
          async (payload) => {
            if (!mountedRef.current) return;

            const record = payload.new as { status?: string; call_id?: string; room_id?: string };
            // If call was marked as ended/missed/declined/accepted, clear the banner
            if (
              record.status === "missed" ||
              record.status === "ended" ||
              record.status === "declined" ||
              record.status === "accepted"
            ) {
              await clearIncomingCallUI(`call_records status=${record.status}`);

              // Mark related notification as read
              if (record.call_id) {
                await supabase
                  .from("notifications")
                  .update({ is_read: true, read_at: new Date().toISOString() })
                  .eq("type", "call")
                  .eq("recipient_id", user.id)
                  .eq("related_id", record.room_id)
                  .eq("is_read", false);
              }
            }
          }
        )
        .subscribe();

      return () => {
        try {
          channel.unsubscribe();
        } catch (_e) {
          // Ignore unsubscribe errors
        }
        try {
          notifUpdatesChannel.unsubscribe();
        } catch (_e) {
          // Ignore unsubscribe errors
        }
        try {
          callRecordsChannel.unsubscribe();
        } catch (_e) {
          // Ignore unsubscribe errors
        }
        try {
          supabase.removeChannel(channel);
        } catch (_e) {
          // Ignore removeChannel errors
        }
        try {
          supabase.removeChannel(notifUpdatesChannel);
        } catch (_e) {
          // Ignore removeChannel errors
        }
        try {
          supabase.removeChannel(callRecordsChannel);
        } catch (_e) {
          // Ignore removeChannel errors
        }
      };
    };

    const cleanup = setupCallListener();

    return () => {
      cleanup.then((cleanupFn) => cleanupFn?.());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, currentRoomId, pathname]);

  // Polling fallback: Check for new call notifications every 2 seconds
  // This handles cases where Realtime subscriptions fail or are delayed
  useEffect(() => {
    if (!userIdRef.current) return;

    const pollForCalls = async () => {
      if (!mountedRef.current || !userIdRef.current) return;

      try {
        const { data: calls } = await supabase
          .from("notifications")
          .select("*")
          .eq("recipient_id", userIdRef.current)
          .eq("type", "call")
          .eq("is_read", false)
          .order("created_at", { ascending: false })
          .limit(1);

        if (calls && calls.length > 0 && mountedRef.current) {
          const latestCall = calls[0] as CallNotification;

          // Skip if already processed
          if (processedCallIdsRef.current.has(latestCall.id)) return;

          // Check if user is in the chatroom
          const callRoomId = latestCall.content.room_id;
          const isInChatroom = currentRoomId === callRoomId || pathname === `/chat/${callRoomId}`;

          if (isInChatroom) {
            processedCallIdsRef.current.add(latestCall.id);
            return;
          }

          // Check if call notification is not too old (within 30 seconds)
          const callAge = Date.now() - new Date(latestCall.created_at).getTime();
          if (callAge > 30000) {
            // Polling: Call notification is too old, skipping
            processedCallIdsRef.current.add(latestCall.id);
            return;
          }

          processedCallIdsRef.current.add(latestCall.id);
          setIncomingCall(latestCall);
          setShowBanner(true);
          playRingtone();
        }
      } catch (_error) {
        // Error polling for call notifications - silently handle
      }
    };

    // Start polling
    const pollInterval = setInterval(pollForCalls, 2000);

    return () => {
      clearInterval(pollInterval);
    };
  }, [supabase, currentRoomId, pathname]);

  // When we have an incoming call, subscribe directly to that call_id updates too.
  // This covers edge cases where receiver_id is null or policy filters don't match.
  useEffect(() => {
    const callId = incomingCall?.content?.call_id;
    if (!callId) return;

    const channel = supabase
      .channel(`incoming-call-record-${callId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "call_records",
          filter: `call_id=eq.${callId}`,
        },
        async (payload) => {
          if (!mountedRef.current) return;
          const record = payload.new as { status?: string };
          if (
            record?.status === "missed" ||
            record?.status === "ended" ||
            record?.status === "declined" ||
            record?.status === "accepted"
          ) {
            await clearIncomingCallUI(`call_id subscription status=${record.status}`);
            const recipientId = userIdRef.current;
            if (recipientId) {
              await supabase
                .from("notifications")
                .update({ is_read: true, read_at: new Date().toISOString() })
                .eq("id", incomingCall.id)
                .eq("recipient_id", recipientId);
            }
          }
        }
      )
      .subscribe();

    return () => {
      try {
        channel.unsubscribe();
      } catch (_e) {
        // Ignore unsubscribe errors
      }
      try {
        supabase.removeChannel(channel);
      } catch (_e) {
        // Ignore removeChannel errors
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, incomingCall]); // clearIncomingCallUI is intentionally omitted - it's stable

  const handleAcceptCall = async () => {
    if (!incomingCall) return;

    // Stop ringtone
    stopRingtone();

    // Update call record status to 'accepted' before navigating
    const callId = incomingCall.content.call_id;
    if (callId) {
      await updateCallRecordByCallId(callId, "accepted");
    }

    // Mark notification as read (fire and forget for speed)
    const markReadPromise1 = supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", incomingCall.id)
      .select();
    Promise.resolve(markReadPromise1).catch((_err: unknown) => {
      // Error marking call notification as read - silently handle
    });

    // Navigate to chat room with call info in URL params so ChatRoom can auto-join (immediate)
    const roomId = incomingCall.content.room_id;
    const callType = incomingCall.content.call_type;
    router.push(`/chat/${roomId}?acceptCall=true&callId=${callId || ""}&callType=${callType}`);

    // Clear call state
    setShowBanner(false);
    setIncomingCall(null);
  };

  const handleDeclineCall = async () => {
    if (!incomingCall) return;

    // Stop ringtone
    stopRingtone();

    // Mark notification as read (fire and forget for speed)
    const markReadPromise2 = supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", incomingCall.id)
      .select();
    Promise.resolve(markReadPromise2).catch((_err: unknown) => {
      // Error marking call notification as read - silently handle
    });

    // Clear call state (immediate)
    setShowBanner(false);
    setIncomingCall(null);
  };

  const handleDeclineWithMessage = async () => {
    if (!incomingCall) return;

    // Stop ringtone
    stopRingtone();

    // Mark notification as read (fire and forget for speed)
    const markReadPromise3 = supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", incomingCall.id)
      .select();
    Promise.resolve(markReadPromise3).catch((_err: unknown) => {
      // Error marking call notification as read - silently handle
    });

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
