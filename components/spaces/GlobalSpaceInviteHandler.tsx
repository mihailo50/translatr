"use client";

import React, { useEffect, useState, useRef } from "react";
import { createClient } from "../../utils/supabase/client";
import { useRouter } from "next/navigation";
import SpaceInviteBanner from "./SpaceInviteBanner";
import { acceptSpaceInvitation, declineSpaceInvitation } from "../../actions/spaces";

interface SpaceInviteNotification {
  id: string;
  recipient_id: string;
  type: "space_invite";
  content: {
    sender_name: string;
    space_name: string;
    avatar_url?: string;
  };
  related_id: string; // space_id
  created_at: string;
  is_read: boolean;
}

export default function GlobalSpaceInviteHandler() {
  const supabase = createClient();
  const router = useRouter();
  const [incomingInvite, setIncomingInvite] = useState<SpaceInviteNotification | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const processedInviteIdsRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const clearIncomingInviteUI = () => {
    setShowBanner(false);
    setIncomingInvite(null);
  };

  useEffect(() => {
    const setupInviteListener = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !mountedRef.current) return;

      // Fetch initial unread space invite notifications
      const { data: existingInvites } = await supabase
        .from("notifications")
        .select("*")
        .eq("recipient_id", user.id)
        .eq("type", "space_invite")
        .eq("is_read", false)
        .order("created_at", { ascending: false })
        .limit(1);

      if (existingInvites && existingInvites.length > 0 && mountedRef.current) {
        const latestInvite = existingInvites[0] as SpaceInviteNotification;

        if (!processedInviteIdsRef.current.has(latestInvite.id)) {
          processedInviteIdsRef.current.add(latestInvite.id);
          setIncomingInvite(latestInvite);
          setShowBanner(true);
        }
      }

      // Subscribe to new space invite notifications
      const channelName = `global-space-invites-${user.id}-${Date.now()}`;
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

            const notification = payload.new as SpaceInviteNotification;

            if (notification.type === "space_invite" && !notification.is_read) {
              const inviteNotif = notification;

              // Avoid processing the same invite twice
              if (processedInviteIdsRef.current.has(inviteNotif.id)) {
                return;
              }

              processedInviteIdsRef.current.add(inviteNotif.id);

              setIncomingInvite(inviteNotif);
              setShowBanner(true);
            }
          }
        )
        .subscribe();

      // Subscribe to notification updates/deletes so the banner closes if the invite is handled elsewhere
      const notifUpdatesChannelName = `global-space-invite-updates-${user.id}-${Date.now()}`;
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
            // If the current incoming invite notification was marked read, close banner
            if (incomingInvite && updated?.id === incomingInvite.id && updated?.is_read) {
              clearIncomingInviteUI();
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
            if (incomingInvite && deleted?.id === incomingInvite.id) {
              clearIncomingInviteUI();
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
          supabase.removeChannel(channel);
        } catch (_e) {
          // Ignore removeChannel errors
        }
        try {
          supabase.removeChannel(notifUpdatesChannel);
        } catch (_e) {
          // Ignore removeChannel errors
        }
      };
    };

    const cleanup = setupInviteListener();

    return () => {
      cleanup.then((cleanupFn) => cleanupFn?.());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]); // incomingInvite is intentionally omitted - it's managed by state updates

  const handleAccept = async () => {
    if (!incomingInvite) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // Get the invitation (most recent pending one for this space)
    const { data: invitations } = await supabase
      .from("space_invitations")
      .select("id")
      .eq("space_id", incomingInvite.related_id)
      .eq("invitee_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1);

    if (invitations && invitations.length > 0) {
      const result = await acceptSpaceInvitation(invitations[0].id);
      if (result.success) {
        // Navigate to the space
        router.push(`/space/${incomingInvite.related_id}`);
      }
    }

    // Clear banner
    clearIncomingInviteUI();
  };

  const handleDecline = async () => {
    if (!incomingInvite) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // Get the invitation (most recent pending one for this space)
    const { data: invitations } = await supabase
      .from("space_invitations")
      .select("id")
      .eq("space_id", incomingInvite.related_id)
      .eq("invitee_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1);

    if (invitations && invitations.length > 0) {
      await declineSpaceInvitation(invitations[0].id);
    }

    // Clear banner
    clearIncomingInviteUI();
  };

  if (!showBanner || !incomingInvite) return null;

  return (
    <SpaceInviteBanner
      spaceName={incomingInvite.content.space_name}
      inviterName={incomingInvite.content.sender_name}
      inviterAvatar={incomingInvite.content.avatar_url}
      onAccept={handleAccept}
      onDecline={handleDecline}
      onDismiss={handleDecline}
    />
  );
}
