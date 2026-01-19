'use client';

import React, { useEffect, useState, useRef } from 'react';
import { createClient } from '../../utils/supabase/client';
import { useRouter } from 'next/navigation';
import ContactRequestBanner from './ContactRequestBanner';
import { acceptContactRequest, declineContactRequest } from '../../actions/contacts';

interface ContactRequestNotification {
  id: string;
  recipient_id: string;
  type: 'contact_request';
  content: {
    sender_name: string;
    preview: string;
    avatar_url?: string;
  };
  related_id: string; // sender_id
  created_at: string;
  is_read: boolean;
}

export default function GlobalContactRequestHandler() {
  const supabase = createClient();
  const router = useRouter();
  const [incomingRequest, setIncomingRequest] = useState<ContactRequestNotification | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const processedRequestIdsRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const clearIncomingRequestUI = () => {
    setShowBanner(false);
    setIncomingRequest(null);
  };

  useEffect(() => {
    const setupRequestListener = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mountedRef.current) return;

      // Fetch initial unread contact request notifications
      const { data: existingRequests } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', user.id)
        .eq('type', 'contact_request')
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(1);

      if (existingRequests && existingRequests.length > 0 && mountedRef.current) {
        const latestRequest = existingRequests[0] as ContactRequestNotification;
        
        if (!processedRequestIdsRef.current.has(latestRequest.id)) {
          processedRequestIdsRef.current.add(latestRequest.id);
          setIncomingRequest(latestRequest);
          setShowBanner(true);
        }
      }

      // Subscribe to new contact request notifications
      const channelName = `global-contact-requests-${user.id}-${Date.now()}`;
      const channel = supabase
        .channel(channelName)
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
            
            if (notification.type === 'contact_request' && !notification.is_read) {
              const requestNotif = notification as ContactRequestNotification;
              
              // Avoid processing the same request twice
              if (processedRequestIdsRef.current.has(requestNotif.id)) {
                return;
              }
              
              processedRequestIdsRef.current.add(requestNotif.id);
              
              setIncomingRequest(requestNotif);
              setShowBanner(true);
            }
          }
        )
        .subscribe();

      // Subscribe to notification updates/deletes so the banner closes if the request is handled elsewhere
      const notifUpdatesChannelName = `global-contact-request-updates-${user.id}-${Date.now()}`;
      const notifUpdatesChannel = supabase
        .channel(notifUpdatesChannelName)
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
            // If the current incoming request notification was marked read, close banner
            if (incomingRequest && updated?.id === incomingRequest.id && updated?.is_read) {
              clearIncomingRequestUI();
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
            if (incomingRequest && deleted?.id === incomingRequest.id) {
              clearIncomingRequestUI();
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
          notifUpdatesChannel.unsubscribe();
        } catch (e) {
          // Ignore unsubscribe errors
        }
        try {
          supabase.removeChannel(channel);
        } catch (e) {
          // Ignore removeChannel errors
        }
        try {
          supabase.removeChannel(notifUpdatesChannel);
        } catch (e) {
          // Ignore removeChannel errors
        }
      };
    };

    const cleanup = setupRequestListener();
    
    return () => {
      cleanup.then(cleanupFn => cleanupFn?.());
    };
  }, [supabase]);

  const handleAccept = async () => {
    if (!incomingRequest) return;
    
    // Get the relationship ID from contacts table
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Find the contact relationship
    const { data: contact } = await supabase
      .from('contacts')
      .select('id')
      .eq('user_id', incomingRequest.related_id)
      .eq('contact_id', user.id)
      .eq('status', 'pending')
      .single();

    if (contact?.id) {
      const result = await acceptContactRequest(contact.id);
      if (result.success) {
        // Mark notification as read (fire and forget for speed)
        supabase
          .from('notifications')
          .update({ is_read: true, read_at: new Date().toISOString() })
          .eq('id', incomingRequest.id)
          .select()
          .catch((err) => {
            console.error('Error marking contact request notification as read:', err);
          });
        
        // Navigate to contacts page (immediate)
        router.push('/contacts');
      }
    }
    
    // Clear banner
    clearIncomingRequestUI();
  };

  const handleDecline = async () => {
    if (!incomingRequest) return;
    
    // Get the relationship ID from contacts table
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Find the contact relationship
    const { data: contact } = await supabase
      .from('contacts')
      .select('id')
      .eq('user_id', incomingRequest.related_id)
      .eq('contact_id', user.id)
      .eq('status', 'pending')
      .single();

    if (contact?.id) {
      const result = await declineContactRequest(contact.id);
      if (result.success) {
        // Mark notification as read (fire and forget for speed)
        supabase
          .from('notifications')
          .update({ is_read: true, read_at: new Date().toISOString() })
          .eq('id', incomingRequest.id)
          .select()
          .catch((err) => {
            console.error('Error marking contact request notification as read:', err);
          });
      }
    }
    
    // Clear banner
    clearIncomingRequestUI();
  };

  if (!showBanner || !incomingRequest) return null;

  return (
    <ContactRequestBanner
      senderName={incomingRequest.content.sender_name}
      senderAvatar={incomingRequest.content.avatar_url}
      onAccept={handleAccept}
      onDecline={handleDecline}
      onDismiss={handleDecline}
    />
  );
}
