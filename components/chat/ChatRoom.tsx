import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Phone, Video, MoreVertical, Ban, Trash2, X, Unlock, Search, Users, Circle, Bell, Image as ImageIcon, Languages, ArrowLeft, ChevronDown } from 'lucide-react';
import { useLiveKitChat } from '../../hooks/useLiveKitChat';
import { useUserStatus, UserStatus } from '../../hooks/useUserStatus';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import LiveKitCallModal from './LiveKitCallModal';
import CallOverlay from './CallOverlay';
import MediaDrawer from './MediaDrawer';
import { initiateCall } from '../../actions/calls';
import { blockUserInRoom, unblockUserInRoom, getBlockStatus } from '../../actions/contacts';
import { RoomEvent } from 'livekit-client';
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
  if (!roomDetails) {
      return <div className="flex h-full items-center justify-center text-white/50">Loading room...</div>;
  }

  const { isConnected, messages, error, room: liveKitChatRoom, sendRealtimeMessage } = useLiveKitChat(roomId, userId, userName); 
  
  // Presence Hook
  const { onlineUsers, updateUserStatus } = useUserStatus({ id: userId });

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
  const directPartnerStatus: UserStatus = useMemo(() => {
      if (roomDetails.room_type === 'direct' && roomDetails.participants?.[0]) {
          const pid = roomDetails.participants[0].id;
          return onlineUsers[pid] || 'offline';
      }
      return 'offline';
  }, [roomDetails, onlineUsers]);

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
        setIsMenuOpen(false);
      }
      if (groupListRef.current && !groupListRef.current.contains(event.target as Node)) {
        setIsGroupMembersOpen(false);
      }
    };
    if (isMenuOpen || isGroupMembersOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen, isGroupMembersOpen]);

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
      const navEvent = new CustomEvent('app-navigate', { detail: '/' });
      window.dispatchEvent(navEvent);
      try { window.history.pushState({}, '', '/'); } catch (e) {}
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
          // Broadcast end signal to the chat room
          const payload = JSON.stringify({
              type: 'call_ended',
              senderId: userId,
              timestamp: Date.now()
          });
          const encoder = new TextEncoder();
          await liveKitChatRoom.localParticipant.publishData(encoder.encode(payload), { reliable: true });
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

  return (
    <div className="relative w-full h-full flex flex-col bg-transparent overflow-hidden rounded-3xl border border-white/5">
      
      {/* Header */}
      <div className="absolute top-4 left-4 right-4 h-auto min-h-[4.5rem] py-3 glass-strong rounded-2xl flex items-center justify-between px-6 z-30">
        {isSearchOpen ? (
            <div className="flex items-center w-full gap-3 animate-in fade-in duration-200">
                <Search className="text-aurora-indigo w-5 h-5 shrink-0" />
                <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search in conversation..." 
                    className="flex-1 bg-transparent border-none focus:ring-0 text-white placeholder-white/40 text-sm"
                    autoFocus
                />
                <button onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }} className="p-1 rounded-full hover:bg-white/10 text-white/50">
                    <X size={18} />
                </button>
            </div>
        ) : (
            <>
                <div className="flex items-center gap-4 animate-in fade-in duration-200">
                  <button onClick={handleBack} className="p-2 -ml-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors">
                    <ArrowLeft size={20} />
                  </button>
                  <div className="relative">
                    {roomDetails.room_type === 'group' ? (
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-aurora-purple to-aurora-pink flex items-center justify-center text-white shadow-lg">
                            <Users size={20} />
                        </div>
                    ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-aurora-indigo to-aurora-purple flex items-center justify-center text-white font-bold shadow-lg overflow-hidden">
                            {roomDetails.participants?.[0]?.avatar ? (
                                <img src={roomDetails.participants[0].avatar} className="w-full h-full object-cover" alt="" />
                            ) : (
                                roomDetails.name.substring(0,2).toUpperCase()
                            )}
                        </div>
                    )}
                    
                    {/* Status Indicator (Direct) */}
                    {!isBlocked && roomDetails.room_type === 'direct' && (
                        <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-aurora-slate ${getStatusColor(directPartnerStatus)} shadow-lg`}></div>
                    )}
                  </div>
                  <div>
                    <h2 className="text-white font-semibold text-lg leading-tight flex items-center gap-2">
                        {roomDetails.name}
                        {isBlocked && <Ban size={14} className="text-red-400" />}
                    </h2>
                    <div className="text-white/40 text-xs flex items-center gap-1.5 mt-0.5">
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

                             {/* Group Members Online Dropdown */}
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
                                            <div className="px-3 py-4 text-center text-xs text-white/30">
                                                No one else is online
                                            </div>
                                        )}
                                     </div>
                                 </div>
                             )}
                           </div>
                       ) : (
                           /* Direct Chat Status Text */
                           <>
                             {directPartnerStatus === 'offline' ? (
                                <span>Offline</span>
                             ) : (
                                <span className="flex items-center gap-1.5">
                                    <span className={`w-1.5 h-1.5 rounded-full ${getStatusColor(directPartnerStatus)} animate-pulse`}></span>
                                    {getStatusText(directPartnerStatus)}
                                </span>
                             )}
                           </>
                       )}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                    <button onClick={() => setIsSearchOpen(true)} className="p-2.5 rounded-xl hover:bg-white/10 text-white/70 hover:text-white transition-colors">
                        <Search size={20} />
                    </button>
                    {!isBlocked && (
                        <>
                            <button onClick={() => handleStartCall('audio')} className="p-2.5 rounded-xl hover:bg-white/10 text-white/70 hover:text-green-400 transition-colors hidden sm:block">
                                <Phone size={20} />
                            </button>
                            <button onClick={() => handleStartCall('video')} className="p-2.5 rounded-xl hover:bg-white/10 text-white/70 hover:text-aurora-indigo transition-colors hidden sm:block">
                                <Video size={20} />
                            </button>
                            <div className="w-px h-6 bg-white/10 mx-1 hidden sm:block" />
                        </>
                    )}
                    <div className="relative" ref={menuRef}>
                        <button onClick={() => setIsMenuOpen(!isMenuOpen)} className={`p-2.5 rounded-xl transition-colors ${isMenuOpen ? 'bg-white/10 text-white' : 'hover:bg-white/10 text-white/70'}`}>
                            <MoreVertical size={20} />
                        </button>
                        {isMenuOpen && (
                            <div className="absolute top-full right-0 mt-2 w-56 glass-strong rounded-xl border border-white/10 shadow-2xl py-1 overflow-hidden z-[60] animate-in fade-in zoom-in-95 duration-200">
                                <button className="w-full text-left px-4 py-3 hover:bg-white/5 text-sm text-white/80 flex items-center gap-3 transition-colors">
                                    <Bell size={16} /> Mute Notifications
                                </button>
                                <button onClick={() => { setIsTranslationEnabled(!isTranslationEnabled); setIsMenuOpen(false); }} className="w-full text-left px-4 py-3 hover:bg-white/5 text-sm text-white/80 flex items-center gap-3 transition-colors">
                                    <Languages size={16} className={isTranslationEnabled ? "text-aurora-indigo" : "text-white/50"} />
                                    <span className={isTranslationEnabled ? "text-white" : "text-white/70"}>{isTranslationEnabled ? 'Translation On' : 'Translate Messages'}</span>
                                </button>
                                <button onClick={() => { setIsMediaDrawerOpen(true); setIsMenuOpen(false); }} className="w-full text-left px-4 py-3 hover:bg-white/5 text-sm text-white/80 flex items-center gap-3 transition-colors">
                                    <ImageIcon size={16} /> Media & Files
                                </button>
                                {roomDetails.room_type === 'direct' && (
                                    <button onClick={handleBlockToggle} className="w-full text-left px-4 py-3 hover:bg-white/5 text-sm flex items-center gap-3 transition-colors text-white/80" disabled={isBlocked && !blockedByMe}>
                                        {isBlocked && blockedByMe ? <><Unlock size={16} className="text-green-400" /><span className="text-green-400">Unblock User</span></> : <><Ban size={16} className={isBlocked && !blockedByMe ? "text-white/30" : "text-red-400"} /><span className={isBlocked && !blockedByMe ? "text-white/30" : "text-red-400"}>{isBlocked && !blockedByMe ? 'Blocked by User' : 'Block User'}</span></>}
                                    </button>
                                )}
                                <div className="h-px bg-white/10 my-1 mx-2" />
                                <button onClick={handleClearChat} className="w-full text-left px-4 py-3 hover:bg-white/5 text-sm text-red-400/80 hover:text-red-400 flex items-center gap-3 transition-colors">
                                    <Trash2 size={16} /> Clear Chat
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </>
        )}
      </div>

      <MessageList messages={filteredMessages} userPreferredLanguage={userPreferredLanguage} isTranslationEnabled={isTranslationEnabled} />
      
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