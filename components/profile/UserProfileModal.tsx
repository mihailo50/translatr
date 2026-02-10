"use client";

import React, { useState, useRef, useTransition, useEffect } from "react";
import { X, User, Shield, Activity, Check, Upload, Loader2 } from "lucide-react";
import { useUserStatus, UserStatus } from "../../hooks/useUserStatus";
import { uploadAvatar } from "../../actions/settings";
import { toast } from "sonner";
import Image from "next/image";
import { useAuth } from "../contexts/AuthContext";
import { processFileForUpload } from "../../utils/fileSecurity";

interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string | null;
  plan?: string;
}

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
}

const STATUS_OPTIONS: { value: UserStatus; label: string; color: string }[] = [
  { value: "online", label: "Online", color: "bg-green-500" },
  { value: "busy", label: "Busy", color: "bg-red-500" },
  { value: "dnd", label: "Do Not Disturb", color: "bg-red-500 border border-white/20" },
  { value: "invisible", label: "Invisible", color: "bg-slate-500" },
];

const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose, user }) => {
  // Hook for handling real-time status update
  const { status, updateUserStatus } = useUserStatus({ id: user?.id || "" });
  const { user: currentUser } = useAuth();
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isUploading, startUploadTransition] = useTransition();
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatar || null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isCurrentUser = currentUser?.id === user?.id;

  // Update preview when user changes
  useEffect(() => {
    setAvatarPreview(user?.avatar || null);
  }, [user?.avatar]);

  const handleAvatarClick = () => {
    if (isCurrentUser && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size must be less than 5MB");
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Process and upload
    startUploadTransition(async () => {
      try {
        // Process file (strip metadata, compress)
        const { file: processedFile } = await processFileForUpload(file);

        const formData = new FormData();
        formData.append("avatar", processedFile);

        const result = await uploadAvatar(formData);

        if (result.success && result.avatarUrl) {
          toast.success("Avatar updated successfully");
          setAvatarPreview(result.avatarUrl);
          // Refresh the page to update avatar everywhere
          window.location.reload();
        } else {
          toast.error(result.error || "Failed to upload avatar");
          // Revert preview on error
          setAvatarPreview(user?.avatar || null);
        }
      } catch (error) {
        toast.error("Failed to upload avatar");
        setAvatarPreview(user?.avatar || null);
      } finally {
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    });
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="aurora-glass-deep w-full max-w-sm p-6 rounded-3xl relative overflow-hidden m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>

        {/* Header */}
        <div className="flex flex-col items-center mb-6">
          <div className="relative">
            <button
              onClick={handleAvatarClick}
              disabled={isUploading || !isCurrentUser}
              className="w-24 h-24 rounded-full ring-4 ring-slate-950 mb-4 shadow-lg hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed group relative"
            >
              <div className="w-full h-full rounded-full bg-slate-900 overflow-hidden relative flex items-center justify-center">
                {avatarPreview ? (
                  <Image
                    src={avatarPreview}
                    alt={user?.name || "User"}
                    width={96}
                    height={96}
                    className="w-full h-full object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="text-4xl font-bold text-white">
                    {user?.name?.[0]?.toUpperCase() || "U"}
                  </div>
                )}
                {/* Upload Overlay - Only show for current user */}
                {isCurrentUser && (
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full">
                    {isUploading ? (
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                    ) : (
                      <Upload className="w-6 h-6 text-white" />
                    )}
                  </div>
                )}
              </div>
            </button>
            {/* Hidden File Input */}
            {isCurrentUser && (
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            )}
            {/* Status Indicator / Selector Trigger */}
            <button
              onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
              className="absolute bottom-4 right-0 bg-slate-900 rounded-full p-1 border border-white/10 hover:scale-110 transition-transform cursor-pointer"
            >
              <div
                className={`w-5 h-5 rounded-full ${STATUS_OPTIONS.find((o) => o.value === status)?.color || "bg-green-500"}`}
              ></div>
            </button>

            {/* Status Dropdown */}
            {isStatusDropdownOpen && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 rounded-2xl overflow-hidden z-20 shadow-[0_20px_40px_rgba(0,0,0,0.6)] animate-in fade-in zoom-in-95 duration-200 aurora-glass-premium backdrop-blur-3xl">
                <div className="p-1.5">
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        updateUserStatus(opt.value);
                        setIsStatusDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 transition-all duration-200 ${
                        status === opt.value
                          ? "bg-white/5 text-white"
                          : "text-white/80 hover:text-white hover:bg-indigo-500/20"
                      }`}
                    >
                      <div className={`w-3 h-3 rounded-full ${opt.color}`}></div>
                      <span className="text-sm font-medium flex-1">{opt.label}</span>
                      {status === opt.value && <Check size={14} className="text-white" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <h2 className="text-2xl font-display font-bold text-white tracking-wide mb-1">{user?.name}</h2>
          <p className="text-sm text-slate-400 font-mono">{user?.email}</p>
          <div className="mt-3 aurora-glass-base text-xs px-3 py-1 rounded-full text-indigo-300 border-indigo-500/30">
            {user?.plan || "Pro Plan"}
          </div>
        </div>

        {/* Details List */}
        <div className="space-y-3">
          <div className="aurora-glass-base p-3 rounded-xl hover:border-indigo-500/30 transition-colors flex items-center gap-3">
            <User size={18} className="text-indigo-400" />
            <div className="flex-1">
              <p className="text-xs text-white/40 uppercase">Full Name</p>
              <p className="text-sm text-white font-medium">{user?.name}</p>
            </div>
          </div>

          <div className="aurora-glass-base p-3 rounded-xl hover:border-indigo-500/30 transition-colors flex items-center gap-3">
            <Activity size={18} className="text-indigo-400" />
            <div className="flex-1">
              <p className="text-xs text-white/40 uppercase">Current Status</p>
              <p className="text-sm text-white font-medium capitalize">
                {STATUS_OPTIONS.find((o) => o.value === status)?.label || "Online"}
              </p>
            </div>
          </div>

          <div className="aurora-glass-base p-3 rounded-xl hover:border-indigo-500/30 transition-colors flex items-center gap-3">
            <Shield size={18} className="text-indigo-400" />
            <div className="flex-1">
              <p className="text-xs text-white/40 uppercase">Account Status</p>
              <p className="text-sm text-green-400 font-medium flex items-center gap-1">
                Active <span className="w-1.5 h-1.5 rounded-full bg-green-500 ml-1"></span>
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-white/10 flex flex-col gap-3">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl aurora-glass-base hover:bg-white/10 text-slate-200 font-semibold transition-all"
          >
            Close
          </button>
          <button className="text-xs text-slate-500 hover:text-indigo-400 underline decoration-indigo-500/30 underline-offset-4 transition-colors">
            Manage Subscription
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserProfileModal;
