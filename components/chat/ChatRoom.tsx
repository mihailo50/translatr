'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Phone, Video, MoreVertical, Ban, Trash2, X, Unlock, Search, Users, Circle, Bell, Image as ImageIcon, Languages, ArrowLeft, ChevronDown, ShieldCheck } from 'lucide-react';
import { useLiveKitChat } from '../../hooks/useLiveKitChat';
import { useUserStatus, UserStatus } from '../../hooks/useUserStatus';
import { createClient } from '../../utils/supabase/client';
import { useNotification } from '../contexts/NotificationContext';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import LiveKitCallModal from './LiveKitCallModal';
import CallOverlay from './CallOverlay';
import MediaDrawer from './MediaDrawer';
import { initiateCall } from '../../actions/calls';
import { blockUserInRoom, unblockUserInRoom, getBlockStatus } from '../../actions/contacts';
import { RoomEvent, ConnectionState } from 'livekit-client';
import { toast } from 'sonner';

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
  const supabase = createClient();
  const { isNotificationsOpen, setIsNotificationsOpen } = useNotification();
  // Debug logging
  useEffect(() => {
    console.log('ChatRoom - roomDetails:', {
      name: roomDetails?.name,
      room_type: roomDetails?.room_type,
      participants: roomDetails?.participants,
      participantsLength: roomDetails?.participants?.length,
      firstParticipant: roomDetails?.participants?.[0]
    });
  }, [roomDetails]);

  if (!roomDetails) {
      return <div className="flex h-full items-center justify-center text-white/50">Loading room...</div>;
  }

  const { isConnected, messages, error, room: liveKitChatRoom, sendRealtimeMessage } = useLiveKitChat(roomId, userId, userName); 
  
  // Presence Hook
  const { onlineUsers, updateUserStatus } = useUserStatus({ id: userId });
  const [partnerProfileStatus, setPartnerProfileStatus] = useState<UserStatus | null>(null);

  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [activeCallToken, setActiveCallToken] = useState<string | null>(null);
  const [activeCallUrl, setActiveCallUrl] = useState<string | null>(null);
  const [incomingCaller, setIncomingCaller] = useState('');
  const [callType, setCallType] = useState<'audio' | 'video'>('audio');
  
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMediaDrawerOpen, setIsMediaDrawerOpen] = useState(false);
  const [isGroupMembersOpen, setIsGroupMembersOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const groupListRef = useRef<HTMLDivElement>(null);

  const [isTranslationEnabled, setIsTranslationEnabled] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // --- Derived Status Logic ---
  const directPartnerId = roomDetails.room_type === 'direct' ? roomDetails.participants?.[0]?.id : undefined;

  // Fetch fallback status from profiles if presence hasn't loaded yet
  useEffect(() => {
      if (!directPartnerId) return;
      const fetchStatus = async () => {
          const { data, error } = await supabase
              .from('profiles')
              .select('status')
              .eq('id', directPartnerId)
              .single();
          if (!error && data?.status) {
              setPartnerProfileStatus(data.status as UserStatus);
          }
      };
      fetchStatus();
  }, [directPartnerId, supabase]);

  const directPartnerStatus: UserStatus = useMemo(() => {
      if (!directPartnerId) return 'online'; // default optimistic
      const presenceStatus = onlineUsers[directPartnerId];
      return presenceStatus || partnerProfileStatus || 'online';
  }, [directPartnerId, onlineUsers, partnerProfileStatus]);

  const onlineGroupMembers = useMemo(() => {
      if (roomDetails.room_type !== 'group' || !roomDetails.participants) return [];
      return roomDetails.participants.filter(p => {
          const status = onlineUsers[p.id];
          return status && status !== 'offline' && status !== 'invisible';
      });
  }, [roomDetails, onlineUsers]);

  // --- Call State Handling ---
  const handleCallDisconnect = (shouldSignalTerminate: boolean) => {
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
    if (!liveKitChatRoom) return;
    const handleData = (payload: Uint8Array) => {
        const decoder = new TextDecoder();
        try {
            const data = JSON.parse(decoder.decode(payload));
            
            // Handle Incoming Call
            if (data.type === 'call_invite' && data.senderId !== userId) {
                setIncomingCaller(data.senderName || 'Unknown');
                setCallType(data.callType || 'audio');
                setIsCallModalOpen(true);
            }
            
            // Handle Call Termination for 1-on-1
            if (data.type === 'call_ended' && data.senderId !== userId && roomDetails.room_type === 'direct') {
                if (activeCallToken || isCallModalOpen) {
                    toast.info("Call ended");
                    setActiveCallToken(null);
                    setActiveCallUrl(null);
                    setIsCallModalOpen(false);
                    setIncomingCaller('');
                    updateUserStatus('online');
                }
            }
        } catch (e) {}
    };
    liveKitChatRoom.on(RoomEvent.DataReceived, handleData);
    return () => { liveKitChatRoom.off(RoomEvent.DataReceived, handleData); };
  }, [liveKitChatRoom, userId, activeCallToken, isCallModalOpen, roomDetails.room_type, updateUserStatus]);

  const handleBack = () => {
      router.push('/');
  };

  const handleStartCall = async (type: 'audio' | 'video') => {
      if (isBlocked) {
          toast.error("You cannot call a blocked user.");
          return;
      }
      updateUserStatus('in-call');
      const toastId = toast.loading("Starting secure call...");
      const res = await initiateCall(roomId, userId, userName, type);
      if (res.success && res.token && res.serverUrl) {
          toast.dismiss(toastId);
          setActiveCallToken(res.token);
          setActiveCallUrl(res.serverUrl);
      } else {
          updateUserStatus('online'); // Revert on fail
          toast.error("Failed to start call", { id: toastId });
      }
  };

  const handleAnswerCall = async () => {
      updateUserStatus('in-call');
      const res = await initiateCall(roomId, userId, userName, callType);
      if (res.success && res.token && res.serverUrl) {
          setIsCallModalOpen(false);
          setActiveCallToken(res.token);
          setActiveCallUrl(res.serverUrl);
      } else {
          updateUserStatus('online');
          toast.error("Failed to join call");
      }
  };

  const handleDeclineCall = () => {
      setIsCallModalOpen(false);
      setIncomingCaller('');
      // Optionally notify sender of decline
  };

  const handleEndCall = async (shouldSignalTerminate: boolean) => {
      setActiveCallToken(null);
      setActiveCallUrl(null);
      
      if (shouldSignalTerminate && liveKitChatRoom) {
          try {
              // Check if room is still connected before attempting to publish
              if (liveKitChatRoom.state !== ConnectionState.Connected) {
                  console.log('Room is not connected, skipping call end signal');
                  return;
              }

              // Check if local participant exists and is available
              if (!liveKitChatRoom.localParticipant) {
                  console.log('Local participant not available, skipping call end signal');
                  return;
              }

              // Broadcast end signal to the chat room
              const payload = JSON.stringify({
                  type: 'call_ended',
                  senderId: userId,
                  timestamp: Date.now()
              });
              const encoder = new TextEncoder();
              await liveKitChatRoom.localParticipant.publishData(encoder.encode(payload), { reliable: true });
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
      toast.success("Chat history cleared (Local only)");
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
          case 'offline': default: return 'bg-slate-500';
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

  return (
    <div 
      ref={chatRoomRef}
      className="relative w-full h-full flex flex-col overflow-hidden rounded-3xl border border-white/5 bg-transparent"
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
      <div className="sticky top-0 left-0 right-0 z-50 w-full shrink-0 px-4 pt-2">
        <div 
          className="relative h-20 flex items-center mx-4 my-2 rounded-2xl border border-white/10 floating-header-pane"
          style={{
            background: 'rgba(3, 3, 11, 0.85)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}
        >
          {/* AURORA ANIMATION LAYER: Pulls from your globals.css */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute top-[-40%] left-[-10%] w-[250px] h-[250px] bg-indigo-500/15 blur-[60px] rounded-full animate-aurora-1" />
            <div className="absolute bottom-[-40%] right-[-10%] w-[250px] h-[250px] bg-purple-500/15 blur-[60px] rounded-full animate-aurora-2" />
          </div>

          {/* CONTENT: max-w-4xl matches MessageList for perfect alignment */}
          <div className="max-w-4xl mx-auto w-full px-6 flex items-center justify-between relative z-10">
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
                <div className="flex items-center gap-4">
                  <button onClick={handleBack} className="text-white/70 hover:text-white transition-colors">
                    <ArrowLeft size={22} />
                  </button>
                  <div className="flex items-center gap-3">
                    {roomDetails.room_type === 'group' ? (
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-aurora-purple/80 to-aurora-pink/80 flex items-center justify-center text-white shadow-lg border border-white/10">
                        <Users size={22} />
                      </div>
                    ) : (
                      <div className="relative">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500/40 to-purple-500/40 p-[1px]">
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
                    <div>
                      <h2 className="text-white font-bold text-base tracking-tight leading-none mb-1 flex items-center gap-2">
                        {(() => {
                          if (roomDetails.room_type === 'direct' && roomDetails.participants?.[0]?.name) {
                            return roomDetails.participants[0].name;
                          }
                          if (roomDetails.name && roomDetails.name !== 'Loading...' && roomDetails.name !== 'Unknown') {
                            return roomDetails.name;
                          }
                          return 'Loading...';
                        })()}
                        {isBlocked && <Ban size={14} className="text-red-400" />}
                        {/* Ambient Security Shield */}
                        <div className="relative group/shield">
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
                              className="flex items-center gap-1 hover:text-white transition-colors"
                            >
                              <span className="bg-aurora-purple/20 border border-aurora-purple/30 text-aurora-purple px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider">Group</span>
                              <span>• {roomDetails.members_count} members ({onlineGroupMembers.length} online)</span>
                              <ChevronDown size={10} />
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

                <div className="flex items-center gap-2">
                  <button onClick={() => setIsSearchOpen(true)} className="p-2 hover:bg-white/5 rounded-lg text-white/60 transition-colors"><Search size={20} /></button>
                  {!isBlocked && (
                    <>
                      <button onClick={() => handleStartCall('audio')} className="p-2 hover:bg-white/5 rounded-lg text-white/60 hover:text-green-400 transition-colors hidden sm:block">
                        <Phone size={20} />
                      </button>
                      <button onClick={() => handleStartCall('video')} className="p-2 hover:bg-white/5 rounded-lg text-white/60 hover:text-indigo-400 transition-colors hidden sm:block">
                        <Video size={20} />
                      </button>
                    </>
                  )}
                  <div className="relative" ref={menuRef}>
                    <button onClick={() => setIsMenuOpen(!isMenuOpen)} className={`p-2 hover:bg-white/5 rounded-lg text-white/60 transition-colors ${isMenuOpen ? 'bg-white/5 text-white' : ''}`}>
                      <MoreVertical size={20} />
                    </button>
                  </div>
                  {isMenuOpen && typeof document !== 'undefined' && createPortal(
                    <div 
                      className="menu-dropdown-portal fixed top-16 right-6 w-56 z-[100] rounded-xl py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top-right"
                      style={{
                        background: 'rgba(5, 5, 16, 0.9)',
                        backdropFilter: 'blur(24px) saturate(180%)',
                        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
                      }}
                    >
                      <button className="w-full text-left px-4 py-3.5 hover:bg-white/5 transition-colors text-white/80 hover:text-white text-sm flex items-center gap-3">
                        <Bell size={16} /> Mute Notifications
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
        userPreferredLanguage={userPreferredLanguage} 
        isTranslationEnabled={isTranslationEnabled}
        isNotificationsOpen={isNotificationsOpen}
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

      <LiveKitCallModal isOpen={isCallModalOpen} callerName={incomingCaller} callType={callType} onAnswer={handleAnswerCall} onDecline={handleDeclineCall} isCallActive={false} />
      
      {activeCallToken && activeCallUrl && (
          <CallOverlay 
            token={activeCallToken} 
            serverUrl={activeCallUrl} 
            roomName={roomDetails.name} 
            roomType={roomDetails.room_type}
            onDisconnect={handleCallDisconnect} 
            userPreferredLanguage={userPreferredLanguage} 
          />
      )}

      <MediaDrawer isOpen={isMediaDrawerOpen} onClose={() => setIsMediaDrawerOpen(false)} messages={messages} roomName={roomDetails.name} />
    </div>
  );
};

export default ChatRoom;