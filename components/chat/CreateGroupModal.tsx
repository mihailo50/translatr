'use client';

import React, { useState, useEffect } from 'react';
import { X, Users, Plus, Check, Upload, ArrowRight, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { createGroupRoom } from '../../actions/groups';
import { ContactUser } from '../../actions/contacts';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  friends: ContactUser[];
}

export default function CreateGroupModal({ isOpen, onClose, friends }: CreateGroupModalProps) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState('');
  const [groupAvatar, setGroupAvatar] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setStep(1);
      setSelectedMembers(new Set());
      setGroupName('');
      setGroupAvatar(null);
      setAvatarPreview(null);
    }
  }, [isOpen]);

  const handleMemberToggle = (memberId: string) => {
    setSelectedMembers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(memberId)) {
        newSet.delete(memberId);
      } else {
        if (newSet.size < 10) {
          newSet.add(memberId);
        } else {
          toast.error('Maximum 10 members allowed');
        }
      }
      return newSet;
    });
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Avatar must be less than 5MB');
        return;
      }
      if (!file.type.startsWith('image/')) {
        toast.error('Please select an image file');
        return;
      }
      setGroupAvatar(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleNext = () => {
    if (selectedMembers.size === 0) {
      toast.error('Please select at least one member');
      return;
    }
    setStep(2);
  };

  const handleBack = () => {
    setStep(1);
  };

  const handleCreate = async () => {
    if (!groupName.trim()) {
      toast.error('Please enter a group name');
      return;
    }

    if (groupName.trim().length > 100) {
      toast.error('Group name must be 100 characters or less');
      return;
    }

    setIsCreating(true);
    try {
      const memberIds = Array.from(selectedMembers);
      const result = await createGroupRoom(groupName.trim(), memberIds);
      
      if (result.success && result.roomId) {
        toast.success('Group created successfully!');
        onClose();
        router.push(`/chat/${result.roomId}`);
      } else {
        toast.error(result.error || 'Failed to create group');
      }
    } catch (error: any) {
      console.error('Error creating group:', error);
      toast.error(error.message || 'An unexpected error occurred');
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div 
        className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-3xl border border-white/10 shadow-2xl animate-in fade-in zoom-in-95 duration-300"
        style={{
          background: 'rgba(5, 5, 16, 0.95)',
          backdropFilter: 'blur(25px)',
          WebkitBackdropFilter: 'blur(25px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ambient Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/20 rounded-full blur-[100px] pointer-events-none" />

        {/* Header */}
        <div className="relative p-6 border-b border-white/10 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">Create Group Chat</h2>
            <p className="text-white/50 text-sm">
              {step === 1 ? 'Select members' : 'Group details'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="relative p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          {/* Step 1: Select Members */}
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="grid grid-cols-1 gap-2 max-h-[400px] overflow-y-auto p-1 scrollbar-thin">
                {friends.map((friend) => {
                  const isSelected = selectedMembers.has(friend.id);
                  return (
                    <button
                      key={friend.id}
                      onClick={() => handleMemberToggle(friend.id)}
                      className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-all text-left ${
                        isSelected
                          ? 'bg-indigo-500/20 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.2)]'
                          : 'bg-white/5 border-white/5 hover:bg-white/10'
                      }`}
                    >
                      {/* Avatar */}
                      <div className="relative shrink-0">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500/50 to-purple-500/50 p-[1px]">
                          <div className="w-full h-full rounded-full bg-slate-800 flex items-center justify-center text-sm font-bold text-white overflow-hidden border-2 border-[#020205]">
                            {friend.avatar_url ? (
                              <img src={friend.avatar_url} alt={friend.display_name || '?'} className="w-full h-full object-cover" />
                            ) : (
                              (friend.display_name?.[0] || friend.email?.[0] || '?').toUpperCase()
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium text-white/90 truncate">
                          {friend.display_name || 'Unknown'}
                        </h3>
                        <p className="text-xs text-white/40 truncate">
                          {friend.email}
                        </p>
                      </div>

                      {/* CheckCircle2 Icon */}
                      <div className="shrink-0">
                        {isSelected ? (
                          <CheckCircle2 size={20} className="text-indigo-400 drop-shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
                        ) : (
                          <div className="w-5 h-5 rounded-full border-2 border-white/20" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {friends.length === 0 && (
                <div className="text-center py-12 text-white/40">
                  <Users size={48} className="mx-auto mb-4 opacity-50" />
                  <p>No contacts available. Add friends first!</p>
                </div>
              )}

              {/* Counter */}
              <div className="sticky bottom-0 pt-4 border-t border-white/10 bg-[#050510]/95 backdrop-blur-xl">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-white/50">
                    {selectedMembers.size}/10 Selected
                  </p>
                  <button
                    onClick={handleNext}
                    disabled={selectedMembers.size === 0}
                    className="px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-medium transition-all hover:shadow-[0_0_20px_rgba(99,102,241,0.4)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    Next
                    <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Group Info */}
          {step === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
              {/* Avatar Upload */}
              <div className="flex flex-col items-center">
                <label className="cursor-pointer">
                  <div className="w-24 h-24 rounded-full bg-white/5 border-2 border-dashed border-white/20 flex flex-col items-center justify-center hover:border-indigo-500 hover:bg-indigo-500/10 transition-all">
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Group avatar" className="w-full h-full rounded-full object-cover" />
                    ) : (
                      <>
                        <Upload size={24} className="text-white/40 mb-1" />
                        <span className="text-[10px] text-white/40">Upload</span>
                      </>
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                </label>
                <p className="text-xs text-white/40 mt-2">Click to upload group avatar (optional)</p>
              </div>

              {/* Group Name Input */}
              <div>
                <label className="block text-sm font-medium text-white/70 mb-2">
                  Group Name
                </label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Enter group name..."
                  maxLength={100}
                  className="aurora-input w-full rounded-xl px-4 py-3"
                  autoFocus
                />
                <p className="text-xs text-white/40 mt-1.5">
                  {groupName.length}/100 characters
                </p>
              </div>

              {/* Selected Members Preview */}
              <div>
                <label className="block text-sm font-medium text-white/70 mb-2">
                  Selected Members ({selectedMembers.size})
                </label>
                <div className="flex flex-wrap gap-2">
                  {Array.from(selectedMembers).map((memberId) => {
                    const friend = friends.find(f => f.id === memberId);
                    if (!friend) return null;
                    return (
                      <div
                        key={memberId}
                        className="px-3 py-1.5 bg-indigo-500/20 border border-indigo-500/30 rounded-lg flex items-center gap-2"
                      >
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500/50 to-purple-500/50 p-0.5">
                          <div className="w-full h-full rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-white overflow-hidden">
                            {friend.avatar_url ? (
                              <img src={friend.avatar_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              (friend.display_name?.[0] || '?').toUpperCase()
                            )}
                          </div>
                        </div>
                        <span className="text-sm text-white/90">
                          {friend.display_name || 'Unknown'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-3 pt-4 border-t border-white/10">
                <button
                  onClick={handleBack}
                  disabled={isCreating}
                  className="w-full px-6 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ArrowLeft size={18} />
                  Back
                </button>
                <button
                  onClick={handleCreate}
                  disabled={isCreating || !groupName.trim()}
                  className="w-full px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-medium transition-all shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isCreating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Users size={18} />
                      Create Group
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
