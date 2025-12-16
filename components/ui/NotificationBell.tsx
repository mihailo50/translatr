import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, MessageSquare, UserPlus, Info } from 'lucide-react';
import { createClient } from '../../utils/supabase/client';
import { toast } from 'sonner';

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
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    setIsOpen(false);
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
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2 rounded-full transition-colors ${isOpen ? 'bg-white/10 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-aurora-pink rounded-full border-2 border-aurora-slate animate-pulse"></span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-4 w-80 glass-strong rounded-2xl border border-white/10 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200 shadow-2xl shadow-black/50">
            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/5">
                <h3 className="font-semibold text-white">Notifications</h3>
                {unreadCount > 0 && (
                    <button 
                        onClick={markAllRead}
                        className="text-xs text-aurora-indigo hover:text-aurora-purple transition-colors flex items-center gap-1"
                    >
                        <Check size={12} /> Mark all read
                    </button>
                )}
            </div>

            <div className="max-h-[400px] overflow-y-auto scrollbar-thin">
                {notifications.length === 0 ? (
                    <div className="p-8 text-center opacity-40">
                        <Bell size={32} className="mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No notifications yet</p>
                    </div>
                ) : (
                    notifications.map((n) => (
                        <div 
                            key={n.id}
                            onClick={() => handleNotificationClick(n)}
                            className={`
                                p-4 flex gap-3 cursor-pointer transition-colors border-b border-white/5 last:border-0
                                ${n.is_read ? 'hover:bg-white/5 opacity-60 hover:opacity-100' : 'bg-aurora-indigo/5 hover:bg-aurora-indigo/10'}
                            `}
                        >
                            <div className="flex-shrink-0 mt-1">
                                {n.content.avatar_url ? (
                                    <img src={n.content.avatar_url} alt="" className="w-8 h-8 rounded-full bg-slate-800 object-cover" />
                                ) : (
                                    <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-white/10">
                                        {getIcon(n.type)}
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start mb-0.5">
                                    <p className="text-sm font-semibold text-white truncate pr-2">
                                        {n.content.sender_name || 'System'}
                                    </p>
                                    <span className="text-[10px] text-white/30 whitespace-nowrap">
                                        {getTimeAgo(n.created_at)}
                                    </span>
                                </div>
                                <p className="text-xs text-white/60 line-clamp-2 leading-relaxed">
                                    {n.content.preview}
                                </p>
                            </div>
                            {!n.is_read && (
                                <div className="self-center w-2 h-2 rounded-full bg-aurora-indigo shadow-[0_0_8px_rgba(99,102,241,0.5)]"></div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
      )}
    </div>
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