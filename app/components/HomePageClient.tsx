'use client';

import React, { useState } from 'react';
import { Users, ChevronRight, MessageSquare } from 'lucide-react';
import { Conversation, HomeStats } from '../actions/home';

interface HomePageClientProps {
  homeData: {
    user: {
      name: string;
      avatar: string | null;
    };
    conversations: Conversation[];
    stats: HomeStats;
  };
}

export default function HomePageClient({ homeData }: HomePageClientProps) {
  const [showAll, setShowAll] = useState(false);

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

  const displayedConversations = showAll ? homeData.conversations : homeData.conversations.slice(0, 3);

  // Format numbers for display
  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'k';
    }
    return num.toLocaleString();
  };

  return (
    <div className="space-y-6 pb-8">
      
      {/* Welcome Section */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
              <h1 className="text-3xl font-bold text-white mb-2">Welcome back, {homeData.user.name}</h1>
              <p className="text-white/50">Here's what's happening with your translations today.</p>
          </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glass-strong p-6 rounded-2xl relative overflow-hidden group hover:bg-white/10 transition-colors">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <svg className="w-24 h-24 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
              </div>
              <h3 className="text-white/60 font-medium mb-1">Total Translations</h3>
              <div className="text-3xl font-bold text-white mb-2">{formatNumber(homeData.stats.totalTranslations)}</div>
              <div className="text-xs text-green-400 font-semibold flex items-center gap-1">
                  <span>Active</span>
                  <span className="text-white/30">translations</span>
              </div>
          </div>

          <div className="glass-strong p-6 rounded-2xl relative overflow-hidden group hover:bg-white/10 transition-colors">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <svg className="w-24 h-24 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm4.24 16L12 15.45 7.77 18l1.12-4.81-3.73-3.23 4.92-.42L12 5l2.25 4.57 4.92.42-3.73 3.23L16.23 18z"/></svg>
              </div>
              <h3 className="text-white/60 font-medium mb-1">Active Minutes</h3>
              <div className="text-3xl font-bold text-white mb-2">{formatNumber(homeData.stats.activeMinutes)}</div>
              <div className="text-xs text-aurora-purple font-semibold flex items-center gap-1">
                  <span>Estimated</span>
                  <span className="text-white/30">activity</span>
              </div>
          </div>

          <div className="glass-strong p-6 rounded-2xl relative overflow-hidden group hover:bg-white/10 transition-colors">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <svg className="w-24 h-24 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z"/></svg>
              </div>
              <h3 className="text-white/60 font-medium mb-1">Messages Sent</h3>
              <div className="text-3xl font-bold text-white mb-2">{formatNumber(homeData.stats.messagesSent)}</div>
              <div className="text-xs text-white/40 font-semibold flex items-center gap-1">
                  <span>All time</span>
              </div>
          </div>
      </div>

      {/* Recent Activity */}
      {homeData.conversations.length > 0 ? (
        <div className={`glass p-1 rounded-3xl border border-white/10 transition-all duration-500 ease-in-out ${showAll ? 'bg-white/10' : ''}`}>
            <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <h2 className="text-lg font-bold text-white">{showAll ? 'All Conversations' : 'Recent Conversations'}</h2>
                    <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/50 text-xs font-medium">
                        {homeData.conversations.length}
                    </span>
                </div>
                {homeData.conversations.length > 3 && (
                  <button 
                    onClick={() => setShowAll(!showAll)}
                    className="text-sm font-semibold text-aurora-indigo hover:text-aurora-purple transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5 flex items-center gap-1"
                  >
                    {showAll ? 'Show Less' : 'View All'}
                  </button>
                )}
            </div>
            <div className="p-2 space-y-1">
                {displayedConversations.map((chat) => (
                    <a 
                      key={chat.id} 
                      href={`/chat/${chat.id}`} 
                      onClick={(e) => handleNavigation(e, `/chat/${chat.id}`)}
                      className="block group"
                    >
                      <div className="flex items-center gap-4 p-4 rounded-2xl hover:bg-white/5 transition-all duration-300 cursor-pointer border border-transparent hover:border-white/5 relative overflow-hidden">
                          
                          {/* Hover Effect Background */}
                          <div className="absolute inset-0 bg-gradient-to-r from-aurora-indigo/0 via-aurora-indigo/5 to-aurora-indigo/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                          <div className="relative">
                              <img 
                                src={chat.avatar} 
                                className="w-12 h-12 rounded-xl object-cover shadow-lg border border-white/10 group-hover:scale-105 transition-transform duration-300" 
                                alt={chat.name}
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.src = `https://picsum.photos/seed/${chat.id}/50/50`;
                                }}
                              />
                              {chat.type === 'group' && (
                                  <div className="absolute -bottom-1 -right-1 bg-slate-900 rounded-full p-0.5 border border-white/10">
                                      <div className="bg-aurora-purple/20 p-1 rounded-full">
                                          <Users size={8} className="text-aurora-purple" />
                                      </div>
                                  </div>
                              )}
                          </div>

                          <div className="flex-1 min-w-0 relative z-10">
                              <div className="flex items-center justify-between mb-1">
                                  <h4 className="font-semibold text-white truncate group-hover:text-aurora-indigo transition-colors flex-1 mr-2">
                                      {chat.name}
                                  </h4>
                                  <span className="text-xs text-white/40 font-medium whitespace-nowrap shrink-0">{chat.time}</span>
                              </div>
                              <p className={`text-sm truncate transition-colors ${chat.unread > 0 ? 'text-white font-medium' : 'text-white/50 group-hover:text-white/70'}`}>
                                  {chat.lastMessage}
                              </p>
                          </div>

                          {chat.unread > 0 && (
                              <div className="ml-2 px-2 py-0.5 rounded-full bg-aurora-pink text-[10px] font-bold text-white shadow-lg shadow-aurora-pink/30 animate-pulse">
                                  {chat.unread}
                              </div>
                          )}
                          
                          <ChevronRight size={16} className="text-white/20 group-hover:text-white/50 transition-colors ml-2" />
                      </div>
                    </a>
                ))}
                
                {showAll && (
                    <div className="pt-2 text-center">
                         <button onClick={() => setShowAll(false)} className="text-xs text-white/30 hover:text-white transition-colors">Collapse list</button>
                    </div>
                )}
            </div>
        </div>
      ) : (
        <div className="glass p-8 rounded-3xl border border-white/10 text-center">
          <MessageSquare size={48} className="text-white/20 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">No conversations yet</h3>
          <p className="text-white/50 mb-6">Start chatting with your contacts to see conversations here.</p>
          <a 
            href="/contacts"
            onClick={(e) => handleNavigation(e, '/contacts')}
            className="inline-flex items-center gap-2 text-sm font-semibold text-aurora-indigo hover:text-aurora-purple transition-colors"
          >
            Go to Contacts <ChevronRight size={16} />
          </a>
        </div>
      )}
    </div>
  );
}

