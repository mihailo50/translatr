"use client";

import React, { useState, useEffect, useTransition } from "react";
import {
  getProfile,
  updateProfile,
  signOutAction,
  updateSubscription,
} from "../../actions/settings";
import { useTheme } from "../../components/contexts/ThemeContext";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import {
  User,
  Save,
  LogOut,
  Loader2,
  Globe,
  Sparkles,
  CreditCard,
  CheckCircle2,
  Check,
  Sliders,
} from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";
import { uploadAvatar as uploadAvatarUtil, deleteAvatar } from "../../utils/avatarUpload";
import { uploadAvatarAction } from "../../actions/settings";
import { Camera, X as XIcon } from "lucide-react";

interface ProfileData {
  avatar_url?: string | null;
  id: string;
  display_name: string;
  email: string;
  bio?: string;
  preferred_language: string;
  theme: "aurora" | "midnight";
  plan?: "free" | "pro";
}

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "zh", label: "Chinese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "pt", label: "Portuguese" },
  { code: "ru", label: "Russian" },
  { code: "hi", label: "Hindi" },
];

function SettingsPage() {
  const { theme: appTheme, setTheme: setAppTheme } = useTheme();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Form State
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [language, setLanguage] = useState("en");
  const [localTheme, setLocalTheme] = useState<"aurora" | "midnight">("aurora");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

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
        const profileData = { ...data.profile, email: data.user.email };
        setProfile(profileData);
        setDisplayName(data.profile.display_name || "");
        setBio(data.profile.bio || "");
        setLanguage(data.profile.preferred_language || "en");
        setAvatarUrl(data.profile.avatar_url || null);
        // Use profile data if available, but app state takes precedence if changed in session
        const savedTheme = data.profile.theme || "aurora";
        setLocalTheme(savedTheme);
        setAppTheme(savedTheme);
      }
      setLoading(false);
    };
    init();
  }, [setAppTheme]);

  // Check for changes
  useEffect(() => {
    if (!profile) return;
    const hasChanged =
      displayName !== (profile.display_name || "") ||
      bio !== (profile.bio || "") ||
      language !== (profile.preferred_language || "en") ||
      localTheme !== (profile.theme || "aurora") ||
      avatarUrl !== (profile.avatar_url || null);

    setIsDirty(hasChanged);
  }, [displayName, bio, language, localTheme, avatarUrl, profile]);

  const handleThemeChange = (newTheme: "aurora" | "midnight") => {
    setLocalTheme(newTheme);
    setAppTheme(newTheme); // Apply instantly
  };

  // Handle Avatar Upload
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      // Reset input if no file selected
      e.target.value = "";
      return;
    }

    setIsUploadingAvatar(true);
    try {
      if (!profile?.id) {
        toast.error("User not found");
        e.target.value = "";
        setIsUploadingAvatar(false);
        return;
      }

      // Upload avatar
      const { url, error } = await uploadAvatarUtil(file, profile.id);

      if (error || !url) {
        toast.error(error || "Failed to upload avatar");
        e.target.value = "";
        setIsUploadingAvatar(false);
        return;
      }

      // Update profile with new avatar URL
      const formData = new FormData();
      formData.append("avatar_url", url);
      const result = await uploadAvatarAction(formData);

      if (result.success) {
        // Delete old avatar if exists (after successful update)
        if (profile.avatar_url && profile.avatar_url !== url) {
          try {
            await deleteAvatar(profile.avatar_url);
          } catch (deleteError) {
            // Silently handle deletion errors - avatar is already updated
            // Only log in development
            if (process.env.NODE_ENV === "development") {
              console.warn("Failed to delete old avatar:", deleteError);
            }
          }
        }

        setAvatarUrl(url);
        if (profile) {
          setProfile({ ...profile, avatar_url: url });
        }
        toast.success("Avatar updated successfully");
      } else {
        toast.error(result.error || "Failed to update avatar");
      }
    } catch (error) {
      // Always log errors for debugging, but they'll be minified in production
      console.error("Avatar upload error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to upload avatar");
    } finally {
      setIsUploadingAvatar(false);
      // Reset input
      e.target.value = "";
    }
  };

  // Handle Avatar Remove
  const handleAvatarRemove = async () => {
    if (!profile?.avatar_url) return;

    setIsUploadingAvatar(true);
    try {
      // Delete from storage
      await deleteAvatar(profile.avatar_url);

      // Update profile
      const formData = new FormData();
      formData.append("avatar_url", "");
      const result = await uploadAvatarAction(formData);

      if (result.success) {
        setAvatarUrl(null);
        if (profile) {
          setProfile({ ...profile, avatar_url: null });
        }
        toast.success("Avatar removed successfully");
      } else {
        toast.error(result.error || "Failed to remove avatar");
      }
    } catch (error) {
      toast.error("Failed to remove avatar");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // Handle Save
  const handleSave = () => {
    startTransition(async () => {
      const formData = new FormData();
      formData.append("display_name", displayName);
      formData.append("bio", bio);
      formData.append("preferred_language", language);
      formData.append("theme", localTheme);
      formData.append("avatar_url", avatarUrl || "");

      const result = await updateProfile(formData);

      if (result.success) {
        toast.success("Profile updated successfully");
        setIsDirty(false);
        if (profile) {
          setProfile({
            ...profile,
            display_name: displayName,
            bio,
            preferred_language: language,
            theme: localTheme,
            avatar_url: avatarUrl,
          });
        }
      } else {
        toast.error(result.error || "Failed to update profile");
      }
    });
  };

  const handleSignOut = async () => {
    try {
      const result = await signOutAction();
      if (result.success) {
        toast.success("Signed out successfully");
        try {
          window.history.pushState({}, "", "/auth/login");
        } catch (_e) {
          // Silently handle navigation errors
        }
        window.dispatchEvent(new CustomEvent("app-navigate", { detail: "/auth/login" }));
      }
    } catch (_e) {
      toast.error("Failed to sign out");
    }
  };

  const handleSubscriptionChange = (newPlan: "free" | "pro") => {
    startTransition(async () => {
      const result = await updateSubscription(newPlan);
      if (result.success) {
        toast.success(`Subscription updated to ${newPlan === "pro" ? "Pro" : "Free"} plan.`);
        if (profile) setProfile({ ...profile, plan: newPlan });
      } else {
        toast.error("Failed to update subscription");
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
    <div className="flex-1 overflow-y-auto p-4 md:p-6 scrollbar-thin">
      {/* Title Block */}
      <div className="w-full max-w-5xl mx-auto flex items-center justify-between mb-8">
        <h1 className="text-3xl font-display font-bold text-white tracking-wide">Settings</h1>
        <button
          onClick={handleSave}
          disabled={!isDirty || isPending}
          className={`
            flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold shadow-lg transition-all duration-300
            ${
              isDirty && !isPending
                ? "aurora-glass-premium hover:border-indigo-500/50 text-white hover:shadow-lg"
                : "bg-white/5 text-white/30 cursor-not-allowed border border-white/5"
            }
          `}
        >
          {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save size={20} />}
          Save Changes
        </button>
      </div>

      {/* Content Grid */}
      <div className="w-full max-w-5xl mx-auto space-y-8">

        {/* Profile Section */}
        <section className="aurora-glass-premium rounded-3xl p-8">
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <User
              className={localTheme === "midnight" ? "text-white" : "text-aurora-indigo"}
              size={24}
            />
            Public Profile
          </h2>

          <div className="flex flex-col md:flex-row gap-8 items-start">
            {/* Avatar Section */}
            <div className="flex flex-col items-center gap-4 flex-shrink-0">
              <div className="relative group">
                <div className="p-1 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 shadow-[0_0_30px_rgba(99,102,241,0.3)]">
                  <div className="w-24 h-24 rounded-full bg-[#050510]/80 flex items-center justify-center text-2xl font-bold text-white ring-4 ring-slate-950 overflow-hidden relative">
                    {avatarUrl ? (
                      <Image
                        src={avatarUrl}
                        alt={profile?.display_name || "Avatar"}
                        width={96}
                        height={96}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <span>{profile?.display_name?.[0]?.toUpperCase() || "?"}</span>
                    )}
                  </div>
                </div>
                {/* Upload Overlay */}
                <label
                  htmlFor="avatar-upload"
                  className="absolute inset-0 rounded-full bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                >
                  {isUploadingAvatar ? (
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  ) : (
                    <Camera className="w-6 h-6 text-white" />
                  )}
                </label>
                <input
                  id="avatar-upload"
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  onChange={handleAvatarUpload}
                  disabled={isUploadingAvatar}
                  className="hidden"
                />
                {/* Remove Button */}
                {avatarUrl && (
                  <button
                    onClick={handleAvatarRemove}
                    disabled={isUploadingAvatar}
                    className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-red-500/80 hover:bg-red-500 border-2 border-[#020205] flex items-center justify-center transition-colors disabled:opacity-50"
                    title="Remove avatar"
                  >
                    <XIcon className="w-4 h-4 text-white" />
                  </button>
                )}
              </div>
              <p className="text-xs text-white/40 text-center max-w-[120px]">
                Click to upload avatar
              </p>
            </div>

            {/* Editable Fields */}
            <div className="flex-1 w-full space-y-6">
              <div className="space-y-6">
                <div>
                <label className="text-xs uppercase tracking-widest text-indigo-400/80 font-bold mb-2 block">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="aurora-input w-full rounded-xl px-4 py-3"
                  placeholder="Enter your display name"
                />
              </div>

                <div>
                <label className="text-xs uppercase tracking-widest text-indigo-400/80 font-bold mb-2 block">
                  Bio
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  className="aurora-input w-full rounded-xl px-4 py-3 resize-none"
                  placeholder="Tell us about yourself"
                />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Subscription Section */}
        <section className="aurora-glass-premium rounded-3xl p-8 relative overflow-hidden">
          {/* Inner Glow */}
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent opacity-50 pointer-events-none" />

          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2 relative z-10">
            <CreditCard
              className={localTheme === "midnight" ? "text-white" : "text-aurora-pink"}
              size={24}
            />
            Subscription
          </h2>

          <div className="flex flex-col md:flex-row items-center gap-6 relative z-10">
            <div
              className={`flex-1 w-full p-6 rounded-2xl border transition-all relative overflow-hidden ${profile?.plan === "free" ? "bg-white/[0.02] backdrop-blur-2xl border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)]" : "bg-white/5 border-white/10 opacity-60"}`}
            >
              {profile?.plan === "free" && (
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent opacity-50 pointer-events-none" />
              )}
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-lg font-bold text-white">Free Plan</h3>
                  {profile?.plan === "free" && (
                    <span className="bg-white/10 border border-white/10 text-white px-3 py-1 rounded-full text-xs font-bold tracking-widest uppercase">
                      Current Plan
                    </span>
                  )}
                </div>
                <p className="text-white/50 text-sm mb-4">Basic translation features and chat.</p>
                <ul className="space-y-2 mb-6">
                  <li className="flex items-center gap-2 text-sm text-white/70">
                    <CheckCircle2 size={14} /> Unlimited Chat
                  </li>
                  <li className="flex items-center gap-2 text-sm text-white/70">
                    <CheckCircle2 size={14} /> Basic Translation
                  </li>
                </ul>
                {profile?.plan !== "free" && (
                  <button
                    onClick={() => handleSubscriptionChange("free")}
                    disabled={isPending}
                    className="w-full py-2 text-center text-sm font-bold text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
                  >
                    Downgrade
                  </button>
                )}
              </div>
            </div>

            <div
              className={`flex-1 w-full p-6 rounded-2xl border transition-all relative overflow-hidden ${profile?.plan === "pro" ? "bg-white/[0.02] backdrop-blur-2xl border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)]" : "bg-white/5 border-white/10"}`}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent opacity-50 pointer-events-none" />
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    Pro Plan <Sparkles size={16} className="text-aurora-pink" />
                  </h3>
                  {profile?.plan === "pro" && (
                    <span className="bg-white/10 border border-white/10 text-white px-3 py-1 rounded-full text-xs font-bold tracking-widest uppercase">
                      Active Plan
                    </span>
                  )}
                </div>
                <div className="text-2xl font-bold text-white mb-2">
                  $5<span className="text-sm font-normal text-white/50">/mo</span>
                </div>
                <p className="text-white/50 text-sm mb-4">Unlock premium features.</p>
                <ul className="space-y-2 mb-6">
                  <li className="flex items-center gap-2 text-sm text-white/70">
                    <CheckCircle2 size={14} className="text-aurora-pink" /> All Free Features
                  </li>
                  <li className="flex items-center gap-2 text-sm text-white/70">
                    <CheckCircle2 size={14} className="text-aurora-pink" /> Faster Translations
                  </li>
                  <li className="flex items-center gap-2 text-sm text-white/70">
                    <CheckCircle2 size={14} className="text-aurora-pink" /> Priority Support
                  </li>
                </ul>
                {profile?.plan !== "pro" && (
                  <button
                    onClick={() => handleSubscriptionChange("pro")}
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
        <section className="aurora-glass-premium rounded-3xl p-8">
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <Sliders
              className={localTheme === "midnight" ? "text-white" : "text-aurora-purple"}
              size={24}
            />
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
                {LANGUAGES.map((lang) => {
                  const isActive = language === lang.code;
                  return (
                    <button
                      key={lang.code}
                      onClick={() => setLanguage(lang.code)}
                      className={`
                                    relative group p-4 rounded-2xl transition-all duration-300 flex flex-col items-center justify-center gap-2 min-w-0 w-full
                                    ${
                                      isActive
                                        ? "aurora-glass-base border-indigo-500/50 shadow-[0_0_20px_rgba(99,102,241,0.2)]"
                                        : "aurora-glass-base hover:border-indigo-500/30"
                                    }
                                `}
                    >
                      <span className={`font-medium text-sm text-center ${isActive ? "text-white" : "text-white/70"}`}>
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
              <label className="block text-xs font-medium text-white/60 mb-3 ml-1 uppercase tracking-wider">
                App Theme
              </label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleThemeChange("aurora")}
                  className={`
                            relative group p-4 rounded-2xl transition-all duration-300 flex flex-col items-center gap-3 overflow-hidden
                            ${
                              localTheme === "aurora"
                                ? "aurora-glass-base border-indigo-500/50 shadow-[0_0_25px_rgba(99,102,241,0.2)]"
                                : "aurora-glass-base hover:border-indigo-500/30"
                            }
                        `}
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 shadow-lg" />
                  <span className="text-sm font-medium text-white">Aurora Dark</span>
                </button>

                <button
                  onClick={() => handleThemeChange("midnight")}
                  className={`
                            relative group p-4 rounded-2xl transition-all duration-300 flex flex-col items-center gap-3 overflow-hidden
                            ${
                              localTheme === "midnight"
                                ? "aurora-glass-base border-indigo-500/50 shadow-[0_0_25px_rgba(99,102,241,0.2)]"
                                : "aurora-glass-base hover:border-indigo-500/30"
                            }
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
        <section className="aurora-glass-base rounded-3xl p-6 border-red-500/20 bg-red-500/5 flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h3 className="text-lg font-bold text-red-200/90 mb-1">Sign Out</h3>
              <p className="text-sm text-red-200/70">
                Securely log out of your account on this device.
              </p>
            </div>
            <button
              onClick={handleSignOut}
              className="px-6 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-200 hover:text-white hover:shadow-[0_0_30px_rgba(239,68,68,0.4)] transition-all font-medium flex items-center gap-2"
            >
              <LogOut size={20} />
              Sign Out
            </button>
        </section>
      </div>
    </div>
  );
}

// Wrap the component with ProtectedRoute
const SettingsPageWithProtection = () => (
  <ProtectedRoute>
    <SettingsPage />
  </ProtectedRoute>
);

export default SettingsPageWithProtection;
