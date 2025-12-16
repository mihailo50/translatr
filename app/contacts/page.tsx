'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { 
  Search, 
  UserPlus, 
  MessageSquare, 
  Users, 
  Check, 
  X, 
  Loader2,
  Clock
} from 'lucide-react';
import { 
  getContactsData, 
  searchUsers, 
  sendContactRequest, 
  acceptContactRequest, 
  declineContactRequest,
  ContactUser 
} from '../../actions/contacts';
import { toast } from 'sonner';

export default function ContactsPage() {
  const [activeTab, setActiveTab] = useState<'friends' | 'search' | 'requests'>('friends');
  
  // Data State
  const [friends, setFriends] = useState<ContactUser[]>([]);
  const [requests, setRequests] = useState<ContactUser[]>([]);
  const [searchResults, setSearchResults] = useState<ContactUser[]>([]);
  
  // UI State
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Initial Load
  const refreshData = async () => {
    const data = await getContactsData();
    setFriends(data.friends);
    setRequests(data.requests);
    setLoading(false);
  };

  useEffect(() => {
    refreshData();
  }, []);

  // Handle Search Debounce
  useEffect(() => {
    if (activeTab !== 'search') return;
    
    const timer = setTimeout(async () => {
      if (searchQuery.trim().length >= 2) {
        startTransition(async () => {
          const results = await searchUsers(searchQuery);
          setSearchResults(results);
        });
      } else {
        setSearchResults([]);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery, activeTab]);

  // Navigation Handler
  const handleNavigation = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    try {
        if (window.location.pathname !== href) {
            window.history.pushState({}, '', href);
        }
    } catch (err) {
        console.warn('Navigation suppressed', err);
    }
    const navEvent = new CustomEvent('app-navigate', { detail: href });
    window.dispatchEvent(navEvent);
  };

  // Actions
  const handleSendRequest = (userId: string) => {
    startTransition(async () => {
      const res = await sendContactRequest(userId);
      if (res.success) {
        toast.success("Friend request sent!");
        // Update local state to show 'sent' status immediately
        setSearchResults(prev => prev.map(u => u.id === userId ? { ...u, status: 'pending_sent' } : u));
      } else {
        toast.error(res.error || "Failed to send request");
      }
    });
  };

  const handleAccept = (relationshipId?: string) => {
    if (!relationshipId) return;
    startTransition(async () => {
      const res = await acceptContactRequest(relationshipId);
      if (res.success) {
        toast.success("Contact added!");
        await refreshData();
      } else {
        toast.error("Failed to accept");
      }
    });
  };

  const handleDecline = (relationshipId?: string) => {
    if (!relationshipId) return;
    startTransition(async () => {
      const res = await declineContactRequest(relationshipId);
      if (res.success) {
        toast.success("Request removed");
        await refreshData();
      } else {
        toast.error("Failed to decline");
      }
    });
  };

  return (
      <div className="h-full w-full flex flex-col p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
        
        {/* Header & Tabs */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">Contacts</h1>
            <p className="text-white/50">Manage your circle.</p>
          </div>

          <div className="flex p-1 bg-white/5 backdrop-blur-md rounded-xl border border-white/10">
            <button
              onClick={() => setActiveTab('friends')}
              className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 ${
                activeTab === 'friends' 
                  ? 'bg-white/10 text-white shadow-lg' 
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              My Contacts
            </button>
            <button
              onClick={() => setActiveTab('requests')}
              className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 flex items-center gap-2 ${
                activeTab === 'requests' 
                  ? 'bg-white/10 text-white shadow-lg' 
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              Requests
              {requests.length > 0 && (
                <span className="bg-aurora-pink text-white text-[10px] px-1.5 py-0.5 rounded-full shadow-sm">
                  {requests.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('search')}
              className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 flex items-center gap-2 ${
                activeTab === 'search' 
                  ? 'bg-aurora-indigo text-white shadow-lg shadow-aurora-indigo/20' 
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              <UserPlus size={16} /> Add Contact
            </button>
          </div>
        </div>

        {/* --- VIEW: SEARCH --- */}
        {activeTab === 'search' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Search Input */}
            <div className="relative group max-w-3xl mx-auto w-full">
              <div className="absolute inset-0 bg-gradient-to-r from-aurora-indigo/30 to-aurora-purple/30 rounded-2xl blur-lg opacity-0 group-focus-within:opacity-100 transition-opacity duration-500" />
              <div className="relative glass-strong p-2 rounded-2xl flex items-center">
                <Search className="ml-4 text-white/40" size={24} />
                <input 
                  type="text"
                  placeholder="Search by display name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent border-none focus:ring-0 text-white placeholder-white/30 text-lg px-4 py-3"
                  autoFocus
                />
                {isPending && <Loader2 className="mr-4 text-aurora-indigo animate-spin" />}
              </div>
            </div>

            {/* Results Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {searchResults.map((user) => (
                <div key={user.id} className="glass p-5 rounded-2xl border border-white/5 flex items-center gap-4 hover:bg-white/10 transition-colors">
                  <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center text-lg font-bold text-white overflow-hidden border border-white/10">
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt={user.display_name || '?'} className="w-full h-full object-cover" />
                    ) : (
                      (user.display_name?.[0] || user.email?.[0] || '?').toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-semibold truncate">{user.display_name || 'Unknown'}</h3>
                    <p className="text-white/40 text-sm truncate">{user.email}</p>
                  </div>
                  
                  {/* Action Buttons */}
                  {user.status === 'none' && (
                    <button 
                      onClick={() => handleSendRequest(user.id)}
                      disabled={isPending}
                      className="p-2.5 rounded-xl bg-aurora-indigo/10 text-aurora-indigo hover:bg-aurora-indigo hover:text-white transition-all shadow-lg hover:shadow-aurora-indigo/25"
                    >
                      <UserPlus size={20} />
                    </button>
                  )}
                  {user.status === 'pending_sent' && (
                    <div className="px-3 py-1.5 rounded-lg bg-white/5 text-white/50 text-xs font-medium flex items-center gap-1.5 border border-white/5">
                      <Clock size={12} /> Sent
                    </div>
                  )}
                  {user.status === 'friends' && (
                    <div className="p-2.5 rounded-xl bg-green-500/10 text-green-400">
                      <Check size={20} />
                    </div>
                  )}
                  {user.status === 'pending_received' && (
                     <span className="text-xs text-aurora-pink">Check Requests</span>
                  )}
                </div>
              ))}
              
              {searchQuery.length >= 2 && searchResults.length === 0 && !isPending && (
                <div className="col-span-full text-center py-12 text-white/40">
                  No users found matching "{searchQuery}"
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- VIEW: FRIENDS --- */}
        {activeTab === 'friends' && (
          loading ? (
            <div className="flex justify-center py-20"><Loader2 className="animate-spin text-aurora-indigo w-8 h-8"/></div>
          ) : friends.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-500">
              {friends.map((friend) => (
                 <div key={friend.id} className="glass group p-6 rounded-3xl border border-white/5 hover:border-aurora-indigo/30 transition-all duration-300 relative">
                    <div className="flex items-start justify-between mb-4">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-2xl font-bold text-white border-2 border-white/5 group-hover:border-aurora-indigo/50 transition-all overflow-hidden shadow-lg">
                            {friend.avatar_url ? (
                                <img src={friend.avatar_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                                (friend.display_name?.[0] || '?').toUpperCase()
                            )}
                        </div>
                        <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
                    </div>
                    
                    <h3 className="text-xl font-bold text-white truncate mb-1">{friend.display_name}</h3>
                    <p className="text-sm text-white/40 truncate mb-6">{friend.email}</p>

                    <a 
                      href={`/chat/${friend.id}`} 
                      onClick={(e) => handleNavigation(e, `/chat/${friend.id}`)}
                      className="w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-medium transition-colors flex items-center justify-center gap-2 border border-white/5 group-hover:border-white/20 cursor-pointer"
                    >
                      <MessageSquare size={18} className="text-aurora-indigo" />
                      Message
                    </a>
                 </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center opacity-60">
              <Users size={64} className="mb-4 text-white/20" />
              <h3 className="text-xl font-bold text-white mb-2">No contacts yet</h3>
              <p className="max-w-md text-white/50 mb-6">Start building your network by searching for friends and colleagues.</p>
              <button onClick={() => setActiveTab('search')} className="text-aurora-indigo hover:underline">Find people to add</button>
            </div>
          )
        )}

        {/* --- VIEW: REQUESTS --- */}
        {activeTab === 'requests' && (
          <div className="max-w-2xl mx-auto w-full animate-in slide-in-from-right-4 duration-300">
             {requests.length > 0 ? (
                <div className="space-y-4">
                    {requests.map(req => (
                        <div key={req.id} className="glass-strong p-4 rounded-2xl flex items-center gap-4 border-l-4 border-l-aurora-pink">
                            <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-white font-bold border border-white/10 overflow-hidden">
                                {req.avatar_url ? (
                                    <img src={req.avatar_url} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    (req.display_name?.[0] || '?').toUpperCase()
                                )}
                            </div>
                            <div className="flex-1">
                                <h3 className="font-bold text-white">{req.display_name}</h3>
                                <p className="text-xs text-white/50">Wants to connect</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => handleDecline(req.relationship_id)}
                                    disabled={isPending}
                                    className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                                >
                                    <X size={20} />
                                </button>
                                <button 
                                    onClick={() => handleAccept(req.relationship_id)}
                                    disabled={isPending}
                                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 text-white font-semibold shadow-lg shadow-green-500/20 hover:scale-105 transition-transform"
                                >
                                    Accept
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
             ) : (
                <div className="text-center py-20 text-white/40">
                    <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                        <UserPlus size={32} className="opacity-50" />
                    </div>
                    <p>No pending requests.</p>
                </div>
             )}
          </div>
        )}

      </div>
  );
}