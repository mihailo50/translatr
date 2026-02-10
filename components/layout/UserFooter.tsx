"use client";

import React, { useState } from "react";
import Image from "next/image";
import { LogOut, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import UserProfileModal from "../profile/UserProfileModal";
import { useUserStatus, UserStatus } from "../../hooks/useUserStatus";

// The modal expects a specific shape, so we create a type for it.
interface ModalUser {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  plan: string;
}

export default function UserFooter() {
  const { theme } = useTheme();
  const { user, profile, loading, logout } = useAuth();
  const [showProfile, setShowProfile] = useState(false);

  // Get current user's status from the user ID
  const { status } = useUserStatus(user ? { id: user.id } : null);

  const handleLogout = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent opening profile when clicking logout
    toast.promise(logout(), {
      loading: "Signing out...",
      success: "Signed out successfully.",
      error: "Failed to sign out.",
    });
  };
  
  // The UserProfileModal expects a user object with a different shape than our context.
  // We can create it on the fly.
  const modalUser: ModalUser | null = user && profile ? {
    id: user.id,
    name: profile.display_name || 'User',
    email: user.email || '',
    avatar: profile.avatar_url || null,
    plan: profile.plan === "pro" ? "Pro Plan" : "Free Tier",
  } : null;

  return (
    <>
      <div className="p-4 border-t border-white/5 mt-auto">
        {/* User Block */}
        <button
          onClick={() => setShowProfile(true)}
          className={`flex items-center gap-3 w-full p-3 rounded-xl transition-all group ${
            theme === "midnight" ? "hover:bg-white/10" : "hover:bg-white/5"
          }`}
          disabled={loading}
        >
          <div className="relative">
            {/* Avatar */}
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-white font-bold border border-white/10 overflow-hidden shadow-sm">
              {loading ? (
                <div className="w-full h-full bg-slate-700 animate-pulse" />
              ) : profile?.avatar_url ? (
                <Image
                  src={profile.avatar_url}
                  alt="User"
                  width={40}
                  height={40}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-sm">{profile?.display_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "U"}</span>
              )}
            </div>
            {/* Status Indicator */}
            {(() => {
              const getStatusColor = (s: UserStatus) => {
                switch (s) {
                  case "online":
                    return "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]";
                  case "busy":
                  case "dnd":
                    return "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]";
                  case "in-call":
                    return "bg-aurora-purple shadow-[0_0_8px_rgba(144,97,249,0.6)]";
                  case "invisible":
                  case "offline":
                  default:
                    return "bg-slate-500";
                }
              };
              return (
                <div
                  className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-aurora-slate ${getStatusColor(status || "offline")}`}
                ></div>
              );
            })()}
          </div>

          <div className="flex-1 text-left min-w-0">
            <p
              className={`text-sm font-semibold truncate transition-colors ${
                theme === "aurora" ? "text-white group-hover:text-aurora-indigo" : "text-white"
              }`}
            >
              {loading ? "Loading..." : profile?.display_name || user?.email}
            </p>
            <div className="flex items-center gap-1.5">
              <Sparkles
                size={10}
                className={`text-aurora-purple ${profile?.plan === "pro" ? "opacity-100" : "opacity-0"}`}
              />
              <p className="text-xs text-white/50 truncate">
                {profile ? (profile.plan === "pro" ? "Pro Plan" : "Free Tier") : '...'}
              </p>
            </div>
          </div>

          {/* Logout Button (Arrow Icon) */}
          {!loading && (
            <div
              onClick={handleLogout}
              className="p-2 rounded-lg text-white/40 hover:text-red-400 hover:bg-white/10 transition-colors"
              title="Sign Out"
            >
              <LogOut size={18} />
            </div>
          )}
        </button>
      </div>

      {/* Profile Modal */}
      <UserProfileModal isOpen={showProfile} onClose={() => setShowProfile(false)} user={modalUser} />
    </>
  );
}
