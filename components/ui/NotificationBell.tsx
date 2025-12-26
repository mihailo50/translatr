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
  const { isNotificationsOpen, setIsNotificationsOpen } = useNotification();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; right: number } | null>(null);
  const supabase = createClient();

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
    const fetchNotifications = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (data) {
        setNotifications(data as any);
        setUnreadCount(data.filter((n: any) => !n.is_read).length);
      }

      // Real-time Subscription
      const channel = supabase
        .channel('notifications_channel')
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
            
            // Add to state
            setNotifications((prev) => [newNotification, ...prev]);
            setUnreadCount((prev) => prev + 1);

            // Show Toast
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
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    };

    fetchNotifications();
  }, []);

  const handleNotificationClick = async (notification: Notification) => {
    // 1. Mark as read in DB
    if (!notification.is_read) {
        await supabase
            .from('notifications')
            .update({ is_read: true })
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
        .update({ is_read: true })
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