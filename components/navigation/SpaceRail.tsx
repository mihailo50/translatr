"use client";

import React from 'react';
import { Home, Plus, Users, Globe, Download, Settings, ArrowLeft } from 'lucide-react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';
import { useUserStatus } from '../../hooks/useUserStatus';
import UserProfileModal from '../profile/UserProfileModal';

interface Space {
  id: string;
  name: string;
  imageUrl?: string | null;
  avatar_url?: string | null;
}

interface SpaceRailProps {
  spaces?: Space[];
  activeSpaceId?: string | null;
  onSpaceSelect: (spaceId: string) => void;
  onHomeClick: () => void;
  onAddSpace: () => void;
  onBackClick?: () => void;
  showBackButton?: boolean;
}

const SpaceRail: React.FC<SpaceRailProps> = ({ 
  spaces = [], 
  activeSpaceId = null,
  onSpaceSelect,
  onHomeClick,
  onAddSpace,
  onBackClick,
  showBackButton = false
}) => {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const [showProfile, setShowProfile] = React.useState(false);
  
  // Get current user's status
  const { status } = useUserStatus(user ? { id: user.id } : null);

  // Determine active route
  const isActive = (path: string) => {
    if (path === "/") {
      return pathname === "/" || pathname?.startsWith("/chat");
    }
    return pathname?.startsWith(path);
  };

  // Handle navigation
  const handleNavigate = (path: string) => {
    router.push(path);
  };

  // User profile modal data
  const modalUser = user && profile ? {
    id: user.id,
    name: profile.display_name || 'User',
    email: user.email || '',
    avatar: profile.avatar_url || null,
    plan: profile.plan === "pro" ? "Pro Plan" : "Free Tier",
  } : null;

  // Get status color
  const getStatusColor = (status: string | undefined) => {
    switch (status) {
      case "online":
        return "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]";
      case "busy":
      case "dnd":
        return "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]";
      case "in-call":
        return "bg-purple-500 shadow-[0_0_8px_rgba(144,97,249,0.6)]";
      case "invisible":
      case "offline":
      default:
        return "bg-slate-500";
    }
  };

  const isHomeActive = isActive("/");

  return (
    <>
      <div className="h-full w-[72px] md:w-[72px] flex flex-col items-center py-4 z-50 bg-transparent md:bg-slate-950/80 md:backdrop-blur-2xl text-white">
        {/* Mobile Back Button - Only show on mobile when showBackButton is true */}
        {showBackButton && onBackClick && (
          <div className="md:hidden w-full flex items-center justify-center pb-4 border-b border-white/10 mb-2">
            <button
              onClick={onBackClick}
              className="p-2 rounded-xl hover:bg-white/10 text-white/70 hover:text-white transition-all min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Close navigation"
            >
              <ArrowLeft size={20} />
            </button>
          </div>
        )}
        
        {/* Middle Section - Nebulas/Spaces (Scrollable) */}
        <div className="flex-1 flex flex-col items-center space-y-3 overflow-y-auto overflow-x-visible scrollbar-none w-full px-2">
          {spaces.map((space) => {
            const isActiveSpace = activeSpaceId === space.id;
            const avatarUrl = space.avatar_url || space.imageUrl;
            
            const isValidImageUrl = avatarUrl && (
              avatarUrl.startsWith('http://') || 
              avatarUrl.startsWith('https://') ||
              avatarUrl.startsWith('/')
            );
            const isColorString = avatarUrl && avatarUrl.startsWith('#');
            
            return (
              <div key={space.id} className="group relative flex items-center justify-center" style={{ padding: '8px' }}>
                <div className="relative">
                  {isActiveSpace && (
                    <div className="absolute inset-0 rounded-full border-2 border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.5)] z-10" style={{ margin: '-8px' }} />
                  )}
                  <button
                    onClick={() => onSpaceSelect(space.id)}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 relative min-w-[44px] min-h-[44px] z-20
                      ${isActiveSpace 
                        ? 'bg-transparent' 
                        : 'opacity-70 hover:opacity-100 hover:scale-105 bg-transparent hover:bg-white/5'
                      }`}
                  >
                    <div className="w-full h-full rounded-full overflow-hidden">
                      {isColorString ? (
                        <div 
                          className="w-full h-full rounded-full"
                          style={{ backgroundColor: avatarUrl }}
                        />
                      ) : (
                        <Image
                          src={isValidImageUrl ? avatarUrl : `https://avatar.vercel.sh/${space.id}.png`}
                          alt={space.name}
                          width={40}
                          height={40}
                          className="w-full h-full rounded-full object-cover"
                          unoptimized
                        />
                      )}
                    </div>
                  </button>
                </div>
                {/* Tooltip */}
                <div className="absolute left-full ml-4 px-2 py-1 bg-[#0B0D12] border border-white/10 text-white text-sm rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  {space.name}
                </div>
              </div>
            );
          })}
          
          {/* Create Space Button */}
          <button 
            onClick={onAddSpace}
            className="w-10 h-10 rounded-full flex items-center justify-center group mt-2 opacity-70 hover:opacity-100 hover:scale-105 transition-all duration-200 hover:bg-white/5 min-w-[44px] min-h-[44px]"
            title="Create Space"
          >
            <Plus className="w-5 h-5 text-slate-400 group-hover:text-green-400 transition-colors" />
          </button>
        </div>

        {/* Bottom Section - System Tray */}
        <div className="shrink-0 flex flex-col items-center space-y-2 pt-2 pb-4">
          {/* Divider */}
          <div className="w-10 border-t border-white/10 mb-2" />

          {/* Home */}
          <button
            onClick={onHomeClick}
            className={`relative w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-200 group min-w-[44px] min-h-[44px]
              ${isHomeActive
                ? 'text-indigo-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            title="Home"
          >
            {isHomeActive && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-indigo-400 rounded-r-full shadow-[0_0_10px_indigo]" />
            )}
            <Home className="w-5 h-5" />
          </button>

          {/* Contacts */}
          <button
            onClick={() => handleNavigate('/contacts')}
            className={`relative w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-200 group min-w-[44px] min-h-[44px]
              ${isActive('/contacts')
                ? 'text-indigo-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            title="Contacts"
          >
            {isActive('/contacts') && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-indigo-400 rounded-r-full shadow-[0_0_10px_indigo]" />
            )}
            <Users className="w-5 h-5" />
          </button>

          {/* Translate */}
          <button
            onClick={() => handleNavigate('/translate')}
            className={`relative w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-200 group min-w-[44px] min-h-[44px]
              ${isActive('/translate')
                ? 'text-indigo-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            title="Translate"
          >
            {isActive('/translate') && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-indigo-400 rounded-r-full shadow-[0_0_10px_indigo]" />
            )}
            <Globe className="w-5 h-5" />
          </button>

          {/* Downloads */}
          <button
            onClick={() => handleNavigate('/download')}
            className={`relative w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-200 group min-w-[44px] min-h-[44px]
              ${isActive('/download')
                ? 'text-indigo-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            title="Downloads"
          >
            {isActive('/download') && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-indigo-400 rounded-r-full shadow-[0_0_10px_indigo]" />
            )}
            <Download className="w-5 h-5" />
          </button>

          {/* Settings */}
          <button
            onClick={() => handleNavigate('/settings')}
            className={`relative w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-200 group min-w-[44px] min-h-[44px]
              ${isActive('/settings')
                ? 'text-indigo-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            title="Settings"
          >
            {isActive('/settings') && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-indigo-400 rounded-r-full shadow-[0_0_10px_indigo]" />
            )}
            <Settings className="w-5 h-5" />
          </button>

          {/* User Profile Avatar - Very Bottom */}
          <div className="pt-2 mt-2">
            <button
              onClick={() => setShowProfile(true)}
              className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-white/10 hover:border-indigo-500/50 transition-all group min-w-[44px] min-h-[44px]"
              disabled={loading}
              title={profile?.display_name || user?.email || "Profile"}
            >
              {loading ? (
                <div className="w-full h-full bg-slate-700 animate-pulse" />
              ) : profile?.avatar_url ? (
                <Image
                  src={profile.avatar_url}
                  alt="User"
                  width={40}
                  height={40}
                  className="w-full h-full object-cover"
                  unoptimized
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center">
                  <span className="text-xs font-bold text-white">
                    {profile?.display_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "U"}
                  </span>
                </div>
              )}
              {/* Status Indicator */}
              {/* {!loading && (
                <div
                  className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#0B0D12] ${getStatusColor(status)}`}
                />
              )} */}
            </button>
          </div>
        </div>
      </div>

      {/* User Profile Modal */}
      {modalUser && (
        <UserProfileModal 
          isOpen={showProfile} 
          onClose={() => setShowProfile(false)} 
          user={modalUser} 
        />
      )}
    </>
  );
};

export default SpaceRail;
