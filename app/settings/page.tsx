'use client';

import React, { useState, useEffect, useRef, useTransition, useCallback } from 'react';
import { createClient } from '../../utils/supabase/client';
import { getProfile, updateProfile, signOutAction, updateSubscription } from '../../actions/settings';
import { useTheme } from '../../components/contexts/ThemeContext';
import { 
  Camera, 
  User, 
  Save, 
  LogOut, 
  Loader2, 
  Globe, 
  Sparkles,
  UploadCloud,
  CreditCard,
  CheckCircle2
} from 'lucide-react';
import { toast } from 'sonner';

interface ProfileData {
  id: string;
  display_name: string;
  email: string;
  avatar_url?: string;
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
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isDragging, setIsDragging] = useState(false);
  
  // Form State
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [language, setLanguage] = useState('en');
  const [localTheme, setLocalTheme] = useState<'aurora' | 'midnight'>('aurora');
  const [avatarUrl, setAvatarUrl] = useState('');
  
  const [isDirty, setIsDirty] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync local theme with app theme when app theme changes
  useEffect(() => {
    setLocalTheme(appTheme);
  }, [appTheme]);

  // Initial Fetch
  useEffect(() => {
    const init = async () => {
      const data = await getProfile();
      if (data?.profile) {
        setProfile({ ...data.profile, email: data.user.email });
        setDisplayName(data.profile.display_name || '');
        setBio(data.profile.bio || '');
        setLanguage(data.profile.preferred_language || 'en');
        // Use profile data if available, but app state takes precedence if changed in session
        const savedTheme = data.profile.theme || 'aurora';
        setLocalTheme(savedTheme);
        setAppTheme(savedTheme);
        setAvatarUrl(data.profile.avatar_url || '');
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
      localTheme !== (profile.theme || 'aurora') ||
      avatarUrl !== (profile.avatar_url || '');
    
    setIsDirty(hasChanged);
  }, [displayName, bio, language, localTheme, avatarUrl, profile]);

  // Handle File Upload Logic
  const uploadFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
        toast.error('Please upload an image file (JPG, PNG, GIF).');
        return;
    }
    
    if (file.size > 2 * 1024 * 1024) { // 2MB limit
        toast.error('File size must be less than 2MB.');
        return;
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `${profile?.id}/${fileName}`;

    setUploading(true);

    try {
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      setAvatarUrl(publicUrl);
      toast.success("Image uploaded successfully");
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast.error('Error uploading image');
    } finally {
      setUploading(false);
    }
  };

  // Drag and Drop Handlers
  const onDragOver = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
  }, []);

  const onDrop = useCallback(async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          await uploadFile(e.dataTransfer.files[0]);
      }
  }, [profile]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          uploadFile(e.target.files[0]);
      }
  };

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
      formData.append('avatar_url', avatarUrl);

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
                theme: localTheme,
                avatar_url: avatarUrl
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
    <div className="max-w-4xl mx-auto space-y-8 pb-10">
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">Settings</h1>
          <p className="text-white/50">Manage your identity and preferences.</p>
        </div>
        
        <button
          onClick={handleSave}
          disabled={!isDirty || isPending || uploading}
          className={`
            flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold shadow-lg transition-all duration-300
            ${isDirty && !isPending && !uploading
                ? 'bg-gradient-to-r from-aurora-indigo to-aurora-purple text-white hover:scale-105 shadow-aurora-indigo/20' 
                : 'bg-white/5 text-white/30 cursor-not-allowed border border-white/5'}
          `}
        >
          {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save size={20} />}
          Save Changes
        </button>
      </div>

      {/* Profile Section */}
      <section className="glass-strong rounded-3xl p-8 border-t border-white/20 relative overflow-hidden">
        {localTheme === 'aurora' && (
            <div className="absolute top-0 right-0 p-32 bg-aurora-indigo/10 blur-[100px] rounded-full pointer-events-none" />
        )}
        
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <User className={localTheme === 'midnight' ? 'text-white' : 'text-aurora-indigo'} size={24} />
            Public Profile
        </h2>

        <div className="flex flex-col md:flex-row gap-8 items-start">
            {/* Avatar Dropzone */}
            <div className="flex flex-col items-center gap-4">
                <div 
                    className={`
                        relative group cursor-pointer w-32 h-32 rounded-full border-4 overflow-hidden shadow-2xl transition-all duration-300
                        ${isDragging 
                            ? 'border-aurora-pink scale-110 shadow-aurora-pink/30' 
                            : 'border-white/10 hover:border-aurora-indigo/50 bg-slate-800'}
                    `}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                >
                    {avatarUrl ? (
                        <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/20">
                            <User size={48} />
                        </div>
                    )}
                    
                    {/* Hover/Drag Overlay */}
                    <div className={`
                        absolute inset-0 bg-black/60 flex items-center justify-center flex-col gap-1 text-white transition-opacity duration-300
                        ${isDragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
                    `}>
                        {uploading ? (
                            <Loader2 className="w-8 h-8 text-aurora-indigo animate-spin" />
                        ) : isDragging ? (
                             <>
                                <UploadCloud size={24} className="text-aurora-pink" />
                                <span className="text-[10px] uppercase font-bold tracking-wide">Drop Here</span>
                             </>
                        ) : (
                             <>
                                <Camera size={24} />
                                <span className="text-[10px] uppercase font-bold tracking-wide">Change</span>
                             </>
                        )}
                    </div>
                </div>
                
                <input 
                    type="file" 
                    ref={fileInputRef}
                    className="hidden" 
                    accept="image/*"
                    onChange={handleFileSelect}
                />
            </div>

            {/* Editable Fields */}
            <div className="flex-1 w-full space-y-6">
                <div className="group">
                    <label className="block text-xs font-medium text-white/60 mb-2 ml-1 uppercase tracking-wider">Display Name</label>
                    <input 
                        type="text" 
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-aurora-indigo/50 focus:border-transparent transition-all"
                    />
                </div>

                <div className="group">
                    <label className="block text-xs font-medium text-white/60 mb-2 ml-1 uppercase tracking-wider">Bio</label>
                    <textarea 
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        rows={3}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-aurora-indigo/50 focus:border-transparent transition-all resize-none"
                    />
                </div>
            </div>
        </div>
      </section>

      {/* Subscription Section */}
      <section className="glass rounded-3xl p-8 border border-white/5 relative overflow-hidden">
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <CreditCard className={localTheme === 'midnight' ? 'text-white' : 'text-aurora-pink'} size={24} />
            Subscription
        </h2>
        
        <div className="flex flex-col md:flex-row items-center gap-6">
            <div className={`flex-1 w-full p-6 rounded-2xl border transition-all ${profile?.plan === 'free' ? 'bg-white/10 border-aurora-indigo/50' : 'bg-white/5 border-white/10 opacity-60'}`}>
                <h3 className="text-lg font-bold text-white mb-2">Free Plan</h3>
                <p className="text-white/50 text-sm mb-4">Basic translation features and chat.</p>
                <ul className="space-y-2 mb-6">
                    <li className="flex items-center gap-2 text-sm text-white/70"><CheckCircle2 size={14} /> Unlimited Chat</li>
                    <li className="flex items-center gap-2 text-sm text-white/70"><CheckCircle2 size={14} /> Basic Translation</li>
                </ul>
                {profile?.plan === 'free' ? (
                     <div className="w-full py-2 text-center text-sm font-bold text-white bg-white/10 rounded-xl">Current Plan</div>
                ) : (
                     <button 
                        onClick={() => handleSubscriptionChange('free')}
                        disabled={isPending}
                        className="w-full py-2 text-center text-sm font-bold text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
                     >
                         Downgrade
                     </button>
                )}
            </div>

            <div className={`flex-1 w-full p-6 rounded-2xl border transition-all relative overflow-hidden ${profile?.plan === 'pro' ? 'bg-gradient-to-br from-aurora-indigo/20 to-aurora-purple/20 border-aurora-indigo' : 'bg-white/5 border-white/10'}`}>
                {profile?.plan === 'pro' && <div className="absolute top-0 right-0 p-20 bg-aurora-indigo/20 blur-3xl rounded-full" />}
                <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                    Pro Plan <Sparkles size={16} className="text-aurora-pink" />
                </h3>
                <div className="text-2xl font-bold text-white mb-2">$5<span className="text-sm font-normal text-white/50">/mo</span></div>
                <p className="text-white/50 text-sm mb-4">Unlock premium features.</p>
                <ul className="space-y-2 mb-6">
                    <li className="flex items-center gap-2 text-sm text-white/70"><CheckCircle2 size={14} className="text-aurora-pink" /> All Free Features</li>
                    <li className="flex items-center gap-2 text-sm text-white/70"><CheckCircle2 size={14} className="text-aurora-pink" /> Faster Translations</li>
                    <li className="flex items-center gap-2 text-sm text-white/70"><CheckCircle2 size={14} className="text-aurora-pink" /> Priority Support</li>
                </ul>
                 {profile?.plan === 'pro' ? (
                     <div className="w-full py-2 text-center text-sm font-bold text-white bg-aurora-indigo rounded-xl shadow-lg shadow-aurora-indigo/20">Active Plan</div>
                ) : (
                     <button 
                        onClick={() => handleSubscriptionChange('pro')}
                        disabled={isPending}
                        className="w-full py-2 text-center text-sm font-bold text-white bg-gradient-to-r from-aurora-indigo to-aurora-purple hover:scale-[1.02] transition-transform rounded-xl shadow-lg"
                     >
                         Upgrade Now
                     </button>
                )}
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
            {/* Language */}
            <div>
                <label className="block text-xs font-medium text-white/60 mb-3 ml-1 uppercase tracking-wider">Native Language</label>
                <div className="relative">
                    <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" size={20} />
                    <select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        className="w-full appearance-none bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-aurora-purple/50 focus:border-transparent transition-all cursor-pointer"
                    >
                        {LANGUAGES.map(lang => (
                            <option key={lang.code} value={lang.code} className="bg-slate-900 text-white">
                                {lang.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Theme */}
            <div>
                <label className="block text-xs font-medium text-white/60 mb-3 ml-1 uppercase tracking-wider">App Theme</label>
                <div className="grid grid-cols-2 gap-4">
                    <button
                        onClick={() => handleThemeChange('aurora')}
                        className={`
                            relative p-4 rounded-xl border flex flex-col items-center gap-2 transition-all duration-300
                            ${localTheme === 'aurora' 
                                ? 'bg-gradient-to-br from-aurora-indigo/20 to-aurora-purple/20 border-aurora-indigo/50 ring-1 ring-aurora-indigo/50' 
                                : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'}
                        `}
                    >
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-aurora-indigo to-aurora-pink shadow-lg" />
                        <span className="text-sm font-medium text-white">Aurora Dark</span>
                    </button>

                    <button
                        onClick={() => handleThemeChange('midnight')}
                        className={`
                            relative p-4 rounded-xl border flex flex-col items-center gap-2 transition-all duration-300
                            ${localTheme === 'midnight' 
                                ? 'bg-black border-white/30 ring-1 ring-white/30' 
                                : 'bg-black/40 border-white/5 hover:bg-black/60 hover:border-white/10'}
                        `}
                    >
                        <div className="w-8 h-8 rounded-full bg-black border border-white/20 shadow-lg" />
                        <span className="text-sm font-medium text-white">Midnight</span>
                    </button>
                </div>
            </div>
        </div>
      </section>

      {/* Danger Zone */}
      <section className="glass rounded-3xl p-8 border border-red-500/20 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-red-500/5 pointer-events-none" />
        <div className="relative">
            <h3 className="text-lg font-bold text-white mb-1">Sign Out</h3>
            <p className="text-sm text-white/50">Securely log out of your account on this device.</p>
        </div>
        <button 
            onClick={handleSignOut}
            className="relative flex items-center gap-2 px-6 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-200 border border-red-500/30 hover:border-red-500/50 transition-all shadow-lg shadow-red-500/5"
        >
            <LogOut size={20} />
            Sign Out
        </button>
      </section>

    </div>
  );
}