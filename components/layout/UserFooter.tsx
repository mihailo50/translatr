'use client';

import React, { useState, useEffect } from 'react';
import { LogOut, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { signOutAction, getProfile } from '../../actions/settings';
import { useTheme } from '../contexts/ThemeContext';
import UserProfileModal from '../profile/UserProfileModal';

export default function UserFooter() {
  const { theme } = useTheme();
  const [user, setUser] = useState<any>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUser() {
        try {
            const data = await getProfile();
            if (data?.user) {
                setUser({
                    name: data.profile?.display_name || 'User',
                    email: data.user.email,
                    avatar: data.profile?.avatar_url || null,
                    plan: data.profile?.plan === 'pro' ? 'Pro Plan' : 'Free Tier'
                });
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }
    fetchUser();
  }, []);

  const handleLogout = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent opening profile when clicking logout
    
    try {
        const result = await signOutAction();
        if (result.success) {
            toast.success('Signed out successfully');
            
            // Use client-side navigation instead of hard reload to prevent 404s in environments without history fallback
            try {
                window.history.pushState({}, '', '/auth/login');
            } catch (err) {
                console.warn('History pushState failed', err);
            }
            const navEvent = new CustomEvent('app-navigate', { detail: '/auth/login' });
            window.dispatchEvent(navEvent);
        }
    } catch (error) {
        console.error(error);
        toast.error('Error signing out');
    }
  };

  return (
    <>
      <div className="p-4 border-t border-white/5 mt-auto">
        {/* User Block */}
        <button 
           onClick={() => setShowProfile(true)}
           className={`flex items-center gap-3 w-full p-3 rounded-xl transition-all group ${
               theme === 'midnight' 
               ? 'hover:bg-white/10' 
               : 'hover:bg-white/5'
           }`}
        >
          <div className="relative">
             {/* Avatar */}
             <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-white font-bold border border-white/10 overflow-hidden shadow-sm">
                {user?.avatar ? (
                    <img src={user.avatar} alt="User" className="w-full h-full object-cover" />
                ) : (
                    <span className="text-sm">{user?.name?.[0]?.toUpperCase() || 'U'}</span>
                )}
             </div>
             {/* Online Indicator */}
             <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-aurora-slate shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
          </div>
          
          <div className="flex-1 text-left min-w-0">
            <p className={`text-sm font-semibold truncate transition-colors ${
                theme === 'aurora' ? 'text-white group-hover:text-aurora-indigo' : 'text-white'
            }`}>
                {loading ? 'Loading...' : (user?.name || 'User')}
            </p>
            <div className="flex items-center gap-1.5">
                <Sparkles size={10} className={`text-aurora-purple ${user?.plan === 'Pro Plan' ? 'opacity-100' : 'opacity-0'}`} />
                <p className="text-xs text-white/50 truncate">{user?.plan || 'Free Tier'}</p>
            </div>
          </div>

          {/* Logout Button (Arrow Icon) */}
          <div 
            onClick={handleLogout}
            className="p-2 rounded-lg text-white/40 hover:text-red-400 hover:bg-white/10 transition-colors"
            title="Sign Out"
          >
            <LogOut size={18} />
          </div>
        </button>
      </div>

      {/* Profile Modal */}
      <UserProfileModal 
        isOpen={showProfile} 
        onClose={() => setShowProfile(false)} 
        user={user} 
      />
    </>
  );
}