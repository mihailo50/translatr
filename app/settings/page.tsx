'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { getProfile, updateProfile, signOutAction, updateSubscription } from '../../actions/settings';
import { useTheme } from '../../components/contexts/ThemeContext';
import { 
  User, 
  Save, 
  LogOut, 
  Loader2, 
  Globe, 
  Sparkles,
  CreditCard,
  CheckCircle2,
  Check
} from 'lucide-react';
import { toast } from 'sonner';

interface ProfileData {
  id: string;
  display_name: string;
  email: string;
  bio?: string;
  preferred_language: string;
  theme: 'aurora' | 'midnight';
  plan?: 'free' | 'pro';
}

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ru', label: 'Russian' },
  { code: 'hi', label: 'Hindi' },
];

export default function SettingsPage() {
  const { theme: appTheme, setTheme: setAppTheme } = useTheme();
  
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  
  // Form State
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [language, setLanguage] = useState('en');
  const [localTheme, setLocalTheme] = useState<'aurora' | 'midnight'>('aurora');
  
  const [isDirty, setIsDirty] = useState(false);

  // Sync local theme with app theme when app theme changes
  useEffect(() => {
    setLocalTheme(appTheme);
  }, [appTheme]);

  // Initial Fetch
  useEffect(() => {
    const init = async () => {
      const data = await getProfile();
      if (data?.profile && data?.user) {
        setProfile({ ...data.profile, email: data.user.email });
        setDisplayName(data.profile.display_name || '');
        setBio(data.profile.bio || '');
        setLanguage(data.profile.preferred_language || 'en');
        // Use profile data if available, but app state takes precedence if changed in session
        const savedTheme = data.profile.theme || 'aurora';
        setLocalTheme(savedTheme);
        setAppTheme(savedTheme);
      }
      setLoading(false);
    };
    init();
  }, []);

  // Check for changes
  useEffect(() => {
    if (!profile) return;
    const hasChanged = 
      displayName !== (profile.display_name || '') ||
      bio !== (profile.bio || '') ||
      language !== (profile.preferred_language || 'en') ||
      localTheme !== (profile.theme || 'aurora');
    
    setIsDirty(hasChanged);
  }, [displayName, bio, language, localTheme, profile]);


  const handleThemeChange = (newTheme: 'aurora' | 'midnight') => {
    setLocalTheme(newTheme);
    setAppTheme(newTheme); // Apply instantly
  };

  // Handle Save
  const handleSave = () => {
    startTransition(async () => {
      const formData = new FormData();
      formData.append('display_name', displayName);
      formData.append('bio', bio);
      formData.append('preferred_language', language);
      formData.append('theme', localTheme);

      const result = await updateProfile(formData);
      
      if (result.success) {
        toast.success('Profile updated successfully');
        setIsDirty(false);
        if (profile) {
            setProfile({
                ...profile,
                display_name: displayName,
                bio,
                preferred_language: language,
                theme: localTheme
            });
        }
      } else {
        toast.error(result.error || 'Failed to update profile');
      }
    });
  };

  const handleSignOut = async () => {
      try {
          const result = await signOutAction();
          if (result.success) {
              toast.success('Signed out successfully');
              try { window.history.pushState({}, '', '/auth/login'); } catch (e) { console.warn(e); }
              window.dispatchEvent(new CustomEvent('app-navigate', { detail: '/auth/login' }));
          }
      } catch (e) {
          toast.error('Failed to sign out');
      }
  };

  const handleSubscriptionChange = (newPlan: 'free' | 'pro') => {
      startTransition(async () => {
          const result = await updateSubscription(newPlan);
          if (result.success) {
              toast.success(`Subscription updated to ${newPlan === 'pro' ? 'Pro' : 'Free'} plan.`);
              if (profile) setProfile({ ...profile, plan: newPlan });
          } else {
              toast.error('Failed to update subscription');
          }
      });
  };

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-aurora-indigo animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020205] relative overflow-hidden">
      {/* Nebula Background Layers */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        {/* Top-Right Nebula */}
        <div className="absolute top-[-20%] right-[-10%] w-[800px] h-[800px] bg-indigo-600/10 rounded-full blur-[120px] animate-pulse" />
        {/* Bottom-Left Nebula */}
        <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-[100px] animate-pulse delay-1000" />
      </div>

      {/* Content Container */}
      <div className="relative z-10 max-w-4xl mx-auto space-y-8 pb-10 pt-8 px-4 md:px-8">
        {/* Header Actions */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white via-indigo-100 to-white/70 mb-2 relative z-10">
              Settings
            </h1>
            <p className="text-white/40 text-lg relative z-10 mb-10">Manage your identity and preferences.</p>
          </div>
        
        <button
          onClick={handleSave}
          disabled={!isDirty || isPending}
          className={`
            flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold shadow-lg transition-all duration-300
            ${isDirty && !isPending
                ? 'bg-gradient-to-r from-aurora-indigo to-aurora-purple text-white hover:scale-105 shadow-aurora-indigo/20' 
                : 'bg-white/5 text-white/30 cursor-not-allowed border border-white/5'}
          `}
        >
          {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save size={20} />}
          Save Changes
        </button>
      </div>

      {/* Profile Section */}
      <section className="relative z-10 bg-white/[0.02] backdrop-blur-2xl border border-white/5 rounded-3xl p-8 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <User className={localTheme === 'midnight' ? 'text-white' : 'text-aurora-indigo'} size={24} />
            Public Profile
        </h2>

        <div className="flex flex-col md:flex-row gap-8 items-start">
            {/* Avatar Section */}
            <div className="flex flex-col items-center gap-4 flex-shrink-0">
                <div className="p-1 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 shadow-[0_0_30px_rgba(99,102,241,0.3)]">
                    <div className="w-24 h-24 rounded-full bg-[#050510]/80 flex items-center justify-center text-2xl font-bold text-white border-4 border-[#020205] overflow-hidden">
                        {profile?.display_name?.[0]?.toUpperCase() || '?'}
                    </div>
                </div>
            </div>

            {/* Editable Fields */}
            <div className="flex-1 w-full space-y-6">
                <div className="group">
                    <label className="text-xs uppercase tracking-widest text-indigo-400/80 font-bold mb-2 block">
                        Display Name
                    </label>
                    <input 
                        type="text" 
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 transition-all focus:bg-white/[0.08] focus:border-indigo-500/50 focus:shadow-[0_0_20px_rgba(99,102,241,0.2)] focus:outline-none"
                        placeholder="Enter your display name"
                    />
                </div>

                <div className="group">
                    <label className="text-xs uppercase tracking-widest text-indigo-400/80 font-bold mb-2 block">
                        Bio
                    </label>
                    <textarea 
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        rows={3}
                        className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 transition-all focus:bg-white/[0.08] focus:border-indigo-500/50 focus:shadow-[0_0_20px_rgba(99,102,241,0.2)] focus:outline-none resize-none"
                        placeholder="Tell us about yourself"
                    />
                </div>
            </div>
        </div>
      </section>

      {/* Subscription Section */}
      <section className="relative z-10 bg-white/[0.02] backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative overflow-hidden">
        {/* Inner Glow */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent opacity-50 pointer-events-none" />
        
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2 relative z-10">
            <CreditCard className={localTheme === 'midnight' ? 'text-white' : 'text-aurora-pink'} size={24} />
            Subscription
        </h2>
        
        <div className="flex flex-col md:flex-row items-center gap-6 relative z-10">
            <div className={`flex-1 w-full p-6 rounded-2xl border transition-all relative overflow-hidden ${profile?.plan === 'free' ? 'bg-white/[0.02] backdrop-blur-2xl border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)]' : 'bg-white/5 border-white/10 opacity-60'}`}>
                {profile?.plan === 'free' && (
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent opacity-50 pointer-events-none" />
                )}
                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg font-bold text-white">Free Plan</h3>
                        {profile?.plan === 'free' && (
                            <span className="bg-white/10 border border-white/10 text-white px-3 py-1 rounded-full text-xs font-bold tracking-widest uppercase">
                                Current Plan
                            </span>
                        )}
                    </div>
                    <p className="text-white/50 text-sm mb-4">Basic translation features and chat.</p>
                    <ul className="space-y-2 mb-6">
                        <li className="flex items-center gap-2 text-sm text-white/70"><CheckCircle2 size={14} /> Unlimited Chat</li>
                        <li className="flex items-center gap-2 text-sm text-white/70"><CheckCircle2 size={14} /> Basic Translation</li>
                    </ul>
                    {profile?.plan !== 'free' && (
                         <button 
                            onClick={() => handleSubscriptionChange('free')}
                            disabled={isPending}
                            className="w-full py-2 text-center text-sm font-bold text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
                         >
                             Downgrade
                         </button>
                    )}
                </div>
            </div>

            <div className={`flex-1 w-full p-6 rounded-2xl border transition-all relative overflow-hidden ${profile?.plan === 'pro' ? 'bg-white/[0.02] backdrop-blur-2xl border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)]' : 'bg-white/5 border-white/10'}`}>
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent opacity-50 pointer-events-none" />
                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            Pro Plan <Sparkles size={16} className="text-aurora-pink" />
                        </h3>
                        {profile?.plan === 'pro' && (
                            <span className="bg-white/10 border border-white/10 text-white px-3 py-1 rounded-full text-xs font-bold tracking-widest uppercase">
                                Active Plan
                            </span>
                        )}
                    </div>
                    <div className="text-2xl font-bold text-white mb-2">$5<span className="text-sm font-normal text-white/50">/mo</span></div>
                    <p className="text-white/50 text-sm mb-4">Unlock premium features.</p>
                    <ul className="space-y-2 mb-6">
                        <li className="flex items-center gap-2 text-sm text-white/70"><CheckCircle2 size={14} className="text-aurora-pink" /> All Free Features</li>
                        <li className="flex items-center gap-2 text-sm text-white/70"><CheckCircle2 size={14} className="text-aurora-pink" /> Faster Translations</li>
                        <li className="flex items-center gap-2 text-sm text-white/70"><CheckCircle2 size={14} className="text-aurora-pink" /> Priority Support</li>
                    </ul>
                     {profile?.plan !== 'pro' && (
                         <button 
                            onClick={() => handleSubscriptionChange('pro')}
                            disabled={isPending}
                            className="w-full py-2 text-center text-sm font-bold bg-white text-[#020205] hover:bg-indigo-50 shadow-[0_0_20px_rgba(255,255,255,0.3)] transition-all transform hover:scale-105 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                         >
                             Upgrade Now
                         </button>
                     )}
                </div>
            </div>
        </div>
      </section>

      {/* Preferences Section */}
      <section className="glass rounded-3xl p-8 border border-white/5">
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <Sparkles className={localTheme === 'midnight' ? 'text-white' : 'text-aurora-purple'} size={24} />
            Preferences
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Language & Region */}
            <div>
                <h3 className="text-xl font-semibold text-white/90 mb-6 flex items-center gap-2">
                    <Globe className="text-indigo-400" size={20} />
                    Language & Region
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {LANGUAGES.map(lang => {
                        const isActive = language === lang.code;
                        return (
                            <button
                                key={lang.code}
                                onClick={() => setLanguage(lang.code)}
                                className={`
                                    relative group p-4 rounded-2xl border transition-all duration-300 flex flex-col items-center justify-center gap-2
                                    ${isActive
                                        ? 'bg-indigo-600/20 border-indigo-500/50 shadow-[0_0_20px_rgba(99,102,241,0.2)]'
                                        : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/10'}
                                `}
                            >
                                <span className={`font-medium ${isActive ? 'text-white' : 'text-white/70'}`}>
                                    {lang.label}
                                </span>
                                {isActive && (
                                    <Check className="absolute top-2 right-2 text-indigo-400" size={16} />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Theme */}
            <div>
                <label className="block text-xs font-medium text-white/60 mb-3 ml-1 uppercase tracking-wider">App Theme</label>
                <div className="grid grid-cols-2 gap-4">
                    <button
                        onClick={() => handleThemeChange('aurora')}
                        className={`
                            relative group p-4 rounded-2xl border transition-all duration-300 flex flex-col items-center gap-3 overflow-hidden
                            ${localTheme === 'aurora' 
                                ? 'bg-indigo-500/20 border-indigo-400/50 shadow-[0_0_25px_rgba(99,102,241,0.2)]' 
                                : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/10'}
                        `}
                    >
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 shadow-lg" />
                        <span className="text-sm font-medium text-white">Aurora Dark</span>
                    </button>

                    <button
                        onClick={() => handleThemeChange('midnight')}
                        className={`
                            relative group p-4 rounded-2xl border transition-all duration-300 flex flex-col items-center gap-3 overflow-hidden
                            ${localTheme === 'midnight' 
                                ? 'bg-indigo-500/20 border-indigo-400/50 shadow-[0_0_25px_rgba(99,102,241,0.2)]' 
                                : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/10'}
                        `}
                    >
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#050510] to-[#020205] border border-white/20 shadow-lg" />
                        <span className="text-sm font-medium text-white">Midnight</span>
                    </button>
                </div>
            </div>
        </div>
      </section>

      {/* Danger Zone */}
      <section className="mt-12 p-1 rounded-3xl bg-gradient-to-r from-red-500/20 to-orange-500/20">
        <div className="bg-red-950/10 backdrop-blur-2xl border border-red-500/10 rounded-[20px] p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-[inset_0_0_50px_rgba(220,38,38,0.05)]">
          <div>
            <h3 className="text-lg font-bold text-red-200/90 mb-1">Sign Out</h3>
            <p className="text-sm text-red-200/70">Securely log out of your account on this device.</p>
          </div>
          <button 
            onClick={handleSignOut}
            className="px-6 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-200 hover:text-white hover:shadow-[0_0_30px_rgba(239,68,68,0.4)] transition-all font-medium flex items-center gap-2"
          >
            <LogOut size={20} />
            Sign Out
          </button>
        </div>
      </section>

      </div>
    </div>
  );
}