"use client";

import React, { useState, useEffect } from 'react';
import { Settings, Plus, Hash, Mic, ArrowLeft, Lock, Edit2, X, Check, Radio } from 'lucide-react';
import Image from 'next/image';
import { checkChannelPermission } from '@/actions/spaces';
import { useAuth } from '@/components/contexts/AuthContext';
import { createChannel, renameChannel } from '@/actions/channels';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useVoiceChannel } from '@/components/contexts/VoiceChannelContext';

export interface SpaceChannel {
  id: string;
  name: string;
  type: 'text' | 'audio' | 'video';
  unread_count: number;
  is_private?: boolean;
  allowed_role_ids?: string[];
}

interface ChannelSidebarProps {
  spaceName?: string;
  spaceAvatarUrl?: string | null;
  spaceId?: string; // Required for creating/renaming channels
  isAdmin?: boolean;
  channels?: SpaceChannel[];
  activeChannelId?: string | null;
  onChannelClick?: (channelId: string) => void;
  onCreateChannel?: (type: 'text' | 'audio' | 'video') => void; // Optional callback for parent components
  onSettingsClick?: () => void;
  onSpaceClick?: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

const ChannelSidebar: React.FC<ChannelSidebarProps> = ({ 
  spaceName = 'Default Space',
  spaceAvatarUrl = null,
  spaceId,
  isAdmin = false,
  channels = [],
  activeChannelId = null,
  onChannelClick,
  onCreateChannel,
  onSettingsClick,
  onSpaceClick,
  isOpen = true,
  onClose
}) => {
  console.log('🔴 [COMPONENT] ChannelSidebar rendered with props:', {
    isAdmin,
    spaceId,
    spaceName,
    channelsCount: channels.length,
    isAdminType: typeof isAdmin,
    isAdminValue: isAdmin,
    isAdminBoolean: isAdmin === true,
  });
  
  const { user } = useAuth();
  const router = useRouter();
  const { voiceChannel, joinVoiceChannel, leaveVoiceChannel } = useVoiceChannel();
  const [channelPermissions, setChannelPermissions] = useState<Record<string, boolean>>({});
  const [permissionsLoading, setPermissionsLoading] = useState<Record<string, boolean>>({});
  
  // Channel creation state
  const [creatingType, setCreatingType] = useState<'text' | 'voice' | null>(null);
  const [newChannelName, setNewChannelName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  
  // Debug: Log state changes
  useEffect(() => {
    console.log('🟢 [STATE] creatingType changed:', creatingType);
    console.log('🟢 [STATE] Current props:', { isAdmin, spaceId, spaceName });
    console.log('🟢 [STATE] Form should render:', creatingType === 'text' || creatingType === 'voice');
  }, [creatingType, isAdmin, spaceId, spaceName]);
  
  // Log when component receives props
  useEffect(() => {
    console.log('🟡 [PROPS] ChannelSidebar received props:', {
      isAdmin,
      spaceId,
      spaceName,
      channelsCount: channels.length,
    });
  }, [isAdmin, spaceId, spaceName, channels.length]);
  
  // Channel renaming state
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [editingChannelName, setEditingChannelName] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  
  const textChannels = channels.filter(c => c.type === 'text');
  const voiceChannels = channels.filter(c => c.type === 'audio' || c.type === 'video');
  
  // Check permissions for voice channels
  useEffect(() => {
    if (!user || voiceChannels.length === 0) return;
    
    const checkPermissions = async () => {
      const permissionMap: Record<string, boolean> = {};
      const loadingMap: Record<string, boolean> = {};
      
      for (const channel of voiceChannels) {
        loadingMap[channel.id] = true;
        const { hasAccess } = await checkChannelPermission(channel.id, user.id);
        permissionMap[channel.id] = hasAccess;
        loadingMap[channel.id] = false;
      }
      
      setChannelPermissions(permissionMap);
      setPermissionsLoading(loadingMap);
    };
    
    checkPermissions();
  }, [user, voiceChannels, channels]);
  
  const hasChannelPermission = (channelId: string): boolean => {
    // If not a private channel, allow access
    const channel = channels.find(c => c.id === channelId);
    if (!channel?.is_private) return true;
    
    // Check cached permission
    return channelPermissions[channelId] ?? false;
  };
  
  const handleVoiceChannelClick = async (channelId: string, e?: React.MouseEvent) => {
    // Prevent navigation to chat page
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (!hasChannelPermission(channelId)) {
      toast.error("You don't have permission to join this voice channel");
      return; // Prevent action if no permission
    }
    
    // If already in this channel, disconnect
    if (voiceChannel.channelId === channelId && voiceChannel.isConnected) {
      leaveVoiceChannel();
      return;
    }
    
    // If in a different channel, leave it first
    if (voiceChannel.isConnected && voiceChannel.channelId !== channelId) {
      leaveVoiceChannel();
    }
    
    // Join the voice channel
    try {
      const channel = channels.find(c => c.id === channelId);
      if (!channel || !spaceId) {
        toast.error("Channel or space information missing");
        return;
      }
      
      await joinVoiceChannel(channelId, channel.name, spaceId, spaceName);
    } catch (error) {
      console.error('Error joining voice channel:', error);
      toast.error('Failed to join voice channel');
    }
  };
  
  // Handle create channel button click
  const handleCreateChannelClick = (type: 'text' | 'voice', e?: React.MouseEvent) => {
    console.log('🔵 [CHANNEL CREATE] handleCreateChannelClick START', { 
      type, 
      spaceId, 
      isAdmin,
      hasSpaceId: !!spaceId,
      currentCreatingType: creatingType,
      event: e ? 'provided' : 'not provided',
    });
    
    if (e) {
      console.log('🔵 [CHANNEL CREATE] Preventing default and stopping propagation');
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (!spaceId) {
      console.error('❌ [CHANNEL CREATE] No spaceId provided! Cannot create channel.');
      toast.error('Space ID is missing. Cannot create channel.');
      return;
    }
    
    console.log('🔵 [CHANNEL CREATE] Setting creatingType to:', type);
    console.log('🔵 [CHANNEL CREATE] Before setState - creatingType:', creatingType);
    
    setCreatingType(type);
    setNewChannelName('');
    
    // Use setTimeout to check state after React updates
    setTimeout(() => {
      console.log('🟢 [CHANNEL CREATE] After setState (async check) - creatingType should be:', type);
    }, 0);
    
    console.log('🔵 [CHANNEL CREATE] Calling parent onCreateChannel callback');
    // Call parent callback if provided (for backward compatibility)
    onCreateChannel?.(type === 'voice' ? 'audio' : type);
    
    console.log('🔵 [CHANNEL CREATE] handleCreateChannelClick END');
  };
  
  // Handle create channel submit
  const handleCreateChannelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!spaceId) {
      toast.error('Space ID is required');
      return;
    }
    
    if (!newChannelName.trim()) {
      toast.error('Channel name cannot be empty');
      return;
    }
    
    setIsCreating(true);
    try {
      const channelType = creatingType === 'voice' ? 'voice' : 'text';
      const { channelId, error } = await createChannel(spaceId, newChannelName.trim(), channelType);
      
      if (error) {
        toast.error(error);
      } else {
        toast.success(`${creatingType === 'voice' ? 'Voice' : 'Text'} channel "${newChannelName.trim()}" created successfully`);
        setCreatingType(null);
        setNewChannelName('');
        // Refresh the page to update channels list
        router.refresh();
        // Optionally navigate to the new channel
        if (channelId && channelType === 'text') {
          onChannelClick?.(channelId);
        }
      }
    } catch (error) {
      toast.error('Failed to create channel');
      console.error('Error creating channel:', error);
    } finally {
      setIsCreating(false);
    }
  };
  
  // Handle rename channel button click
  const handleRenameChannelClick = (channelId: string, currentName: string) => {
    setEditingChannelId(channelId);
    setEditingChannelName(currentName);
  };
  
  // Handle rename channel submit
  const handleRenameChannelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!editingChannelId) return;
    
    if (!editingChannelName.trim()) {
      toast.error('Channel name cannot be empty');
      return;
    }
    
    setIsRenaming(true);
    try {
      const { success, error } = await renameChannel(editingChannelId, editingChannelName.trim());
      
      if (error) {
        toast.error(error);
      } else {
        toast.success('Channel renamed successfully');
        setEditingChannelId(null);
        setEditingChannelName('');
        // Refresh the page to update channels list
        router.refresh();
      }
    } catch (error) {
      toast.error('Failed to rename channel');
      console.error('Error renaming channel:', error);
    } finally {
      setIsRenaming(false);
    }
  };
  
  // Cancel create/rename
  const handleCancel = () => {
    setCreatingType(null);
    setNewChannelName('');
    setEditingChannelId(null);
    setEditingChannelName('');
  };

  // Check if avatarUrl is a valid URL or a color string
  const isValidImageUrl = spaceAvatarUrl && (
    spaceAvatarUrl.startsWith('http://') || 
    spaceAvatarUrl.startsWith('https://') ||
    spaceAvatarUrl.startsWith('/')
  );
  const isColorString = spaceAvatarUrl && spaceAvatarUrl.startsWith('#');

  // Shared channels list component
  const renderChannelsList = () => {
    console.log('🟡 [RENDER] renderChannelsList called', {
      isAdmin,
      spaceId,
      creatingType,
      textChannelsCount: textChannels.length,
      voiceChannelsCount: voiceChannels.length,
    });
    console.log('🟡 [RENDER] isAdmin value:', isAdmin, typeof isAdmin);
    console.log('🟡 [RENDER] Button will render?', isAdmin === true);
    
    return (
      <div className="flex-1 overflow-y-auto">
        {/* Text Channels */}
        <div className="mb-4">
          <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 px-3">
            <span>Text Channels</span>
            {isAdmin ? (
              <button 
                onClick={(e) => {
                  console.log('🔵 [BUTTON CLICK] Text channel + button clicked', {
                    event: e,
                    currentTarget: e.currentTarget,
                    spaceId,
                    isAdmin,
                  });
                  e.preventDefault();
                  e.stopPropagation();
                  handleCreateChannelClick('text', e);
                }}
                onMouseDown={(e) => {
                  console.log('🟣 [BUTTON] MouseDown event on + button');
                }}
                onMouseEnter={() => {
                  console.log('🟣 [BUTTON] Mouse entered + button');
                }}
                className="hover:text-slate-200 transition-colors p-1 min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer z-50 relative"
                title="Create Text Channel"
                type="button"
                style={{ pointerEvents: 'auto', position: 'relative', zIndex: 50 }}
              >
                <Plus className="w-4 h-4" />
              </button>
            ) : (
              <div style={{ minWidth: '44px', minHeight: '44px' }}>
                {/* Placeholder to maintain layout */}
              </div>
            )}
          </div>
          
          {/* Create Text Channel Input */}
          {(() => {
            const shouldShow = creatingType === 'text';
            console.log('🟡 [RENDER] Text channel form check:', { 
              creatingType, 
              shouldShow,
              creatingTypeIsText: creatingType === 'text',
            });
            if (!shouldShow) {
              return null;
            }
            console.log('✅ [RENDER] Rendering text channel form');
            return (
              <form 
                onSubmit={handleCreateChannelSubmit} 
                className="px-3 mb-2" 
                style={{ display: 'block', visibility: 'visible', opacity: 1 }}
                onClick={(e) => {
                  console.log('🟣 [FORM] Text form clicked');
                  e.stopPropagation();
                }}
              >
              <div className="flex items-center gap-2 p-2 bg-white/5 rounded-lg">
                <input
                  type="text"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  placeholder="Channel name"
                  className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder:text-slate-500"
                  autoFocus
                  disabled={isCreating}
                />
                <button
                  type="submit"
                  disabled={isCreating || !newChannelName.trim()}
                  className="p-1 text-green-400 hover:text-green-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Create"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={isCreating}
                  className="p-1 text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
                  title="Cancel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </form>
            );
          })()}
          
          <ul className="space-y-1">
            {textChannels.length > 0 ? (
              textChannels.map((channel) => {
                const isActive = activeChannelId === channel.id;
                const isEditing = editingChannelId === channel.id;
                
                return (
                  <li key={channel.id} className="group">
                    {isEditing ? (
                      <form onSubmit={handleRenameChannelSubmit} className="px-3 py-1.5">
                        <div className="flex items-center gap-2 p-2 bg-white/5 rounded-lg">
                          <input
                            type="text"
                            value={editingChannelName}
                            onChange={(e) => setEditingChannelName(e.target.value)}
                            className="flex-1 bg-transparent border-none outline-none text-sm text-white"
                            autoFocus
                            disabled={isRenaming}
                          />
                          <button
                            type="submit"
                            disabled={isRenaming || !editingChannelName.trim()}
                            className="p-1 text-green-400 hover:text-green-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            title="Save"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={handleCancel}
                            disabled={isRenaming}
                            className="p-1 text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
                            title="Cancel"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        onClick={() => onChannelClick?.(channel.id)}
                        className={`w-full flex items-center gap-2 px-3 py-3 md:py-1.5 rounded-lg transition-all text-left min-h-[44px] relative
                          ${isActive
                            ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20'
                            : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                          }`}
                      >
                        <Hash className="w-4 h-4" />
                        <span className="flex-1 truncate">{channel.name}</span>
                        {channel.unread_count > 0 && (
                          <span className="px-2 py-0.5 bg-indigo-500 text-white text-xs rounded-full">
                            {channel.unread_count}
                          </span>
                        )}
                        {isAdmin && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRenameChannelClick(channel.id, channel.name);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-white transition-all"
                            title="Rename channel"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        )}
                      </button>
                    )}
                  </li>
                );
              })
            ) : (
              <li className="text-xs text-slate-500 px-3 py-1.5">No text channels</li>
            )}
          </ul>
        </div>

        {/* Voice Channels */}
        <div>
          <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 px-3">
            <span>Voice Channels</span>
            {isAdmin && (
              <button 
                onClick={(e) => {
                  console.log('🔵 [BUTTON CLICK] Voice channel + button clicked');
                  handleCreateChannelClick('voice', e);
                }}
                className="hover:text-slate-200 transition-colors p-1 min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer z-10 relative"
                title="Create Voice Channel"
                type="button"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>
          
          {/* Create Voice Channel Input */}
          {(() => {
            const shouldShow = creatingType === 'voice';
            console.log('🟡 [RENDER] Voice channel form check:', { 
              creatingType, 
              shouldShow,
              creatingTypeIsVoice: creatingType === 'voice',
            });
            if (!shouldShow) {
              return null;
            }
            console.log('✅ [RENDER] Rendering voice channel form');
            return (
              <form 
                onSubmit={handleCreateChannelSubmit} 
                className="px-3 mb-2" 
                style={{ display: 'block', visibility: 'visible', opacity: 1 }}
                onClick={(e) => {
                  console.log('🟣 [FORM] Voice form clicked');
                  e.stopPropagation();
                }}
              >
              <div className="flex items-center gap-2 p-2 bg-white/5 rounded-lg">
                <input
                  type="text"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  placeholder="Channel name"
                  className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder:text-slate-500"
                  autoFocus
                  disabled={isCreating}
                />
                <button
                  type="submit"
                  disabled={isCreating || !newChannelName.trim()}
                  className="p-1 text-green-400 hover:text-green-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Create"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={isCreating}
                  className="p-1 text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
                  title="Cancel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </form>
            );
          })()}
          
          <ul className="space-y-1">
            {voiceChannels.length > 0 ? (
              voiceChannels.map((channel) => {
                const isActive = activeChannelId === channel.id;
                const canAccess = hasChannelPermission(channel.id);
                const isLoading = permissionsLoading[channel.id];
                const isEditing = editingChannelId === channel.id;
                const isInVoiceChannel = voiceChannel.channelId === channel.id && voiceChannel.isConnected;
                
                return (
                  <li key={channel.id} className="group">
                    {isEditing ? (
                      <form onSubmit={handleRenameChannelSubmit} className="px-3 py-1.5">
                        <div className="flex items-center gap-2 p-2 bg-white/5 rounded-lg">
                          <input
                            type="text"
                            value={editingChannelName}
                            onChange={(e) => setEditingChannelName(e.target.value)}
                            className="flex-1 bg-transparent border-none outline-none text-sm text-white"
                            autoFocus
                            disabled={isRenaming}
                          />
                          <button
                            type="submit"
                            disabled={isRenaming || !editingChannelName.trim()}
                            className="p-1 text-green-400 hover:text-green-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            title="Save"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={handleCancel}
                            disabled={isRenaming}
                            className="p-1 text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
                            title="Cancel"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        onClick={(e) => canAccess ? handleVoiceChannelClick(channel.id, e) : undefined}
                        disabled={!canAccess || isLoading}
                        className={`w-full flex items-center gap-2 px-3 py-3 md:py-1.5 rounded-lg transition-all text-left min-h-[44px] relative
                          ${!canAccess || isLoading
                            ? 'opacity-50 cursor-not-allowed text-slate-600'
                            : isInVoiceChannel
                            ? 'bg-green-500/10 text-green-300 border border-green-500/20'
                            : isActive
                            ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20'
                            : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                          }`}
                        title={!canAccess ? "You do not have permission to join this voice channel" : isInVoiceChannel ? "Connected - Click to disconnect" : "Click to join voice channel"}
                      >
                        <Mic className={`w-4 h-4 ${isInVoiceChannel ? 'text-green-400' : ''}`} />
                        <span className={`flex-1 truncate ${isInVoiceChannel ? 'text-green-300 font-semibold' : ''}`}>
                          {channel.name}
                        </span>
                        {isInVoiceChannel && (
                          <div className="flex items-center gap-1">
                            <div className="flex gap-0.5">
                              <span className="w-1 h-3 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: "0ms" }} />
                              <span className="w-1 h-4 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: "150ms" }} />
                              <span className="w-1 h-2 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: "300ms" }} />
                            </div>
                            <Radio className="w-3 h-3 text-green-400" />
                          </div>
                        )}
                        {channel.is_private && !canAccess && (
                          <Lock className="w-3 h-3 text-slate-500" />
                        )}
                        {isAdmin && !isInVoiceChannel && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRenameChannelClick(channel.id, channel.name);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-white transition-all"
                            title="Rename channel"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        )}
                      </button>
                    )}
                  </li>
                );
              })
            ) : (
              <li className="text-xs text-slate-500 px-3 py-1.5">No voice channels</li>
            )}
          </ul>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Mobile: Deep Aurora Sidebar - Only render when isOpen is true */}
      {/* Full-screen drawer with Deep Aurora Glass for total background isolation */}
      {isOpen && (
        <>
          {/* Mobile Backdrop */}
          <div
            className="md:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-[55]"
            onClick={onClose}
          />
          <div
            className="md:hidden fixed inset-y-0 left-0 w-full aurora-glass-deep text-white flex-shrink-0 flex flex-col z-[60] transition-transform duration-300 ease-in-out translate-x-0 animate-in slide-in-from-left"
          >
        {/* Mobile Back Button */}
        <div className="flex items-center gap-3 p-4 border-b border-white/10">
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Back to spaces"
          >
            <ArrowLeft size={20} />
          </button>
          <h2 className="font-display font-bold text-base text-white tracking-wide truncate">
            {spaceName}
          </h2>
        </div>

        {/* Mobile Content - Only Channels List */}
        <div className="flex-1 overflow-y-auto p-4">
          {renderChannelsList()}
        </div>
        </div>
        </>
      )}

      {/* Desktop: Regular Sidebar */}
      <div className="hidden md:flex h-full w-64 bg-slate-900/60 backdrop-blur-xl text-white p-4 border-r border-white/5 flex-shrink-0 flex flex-col">
      {/* Space Header with Avatar and Name */}
      <div className="mb-6">
        <div className="flex flex-col items-center gap-3 mb-4 px-2">
          {/* Space Circle/Avatar - Clickable */}
          <div className="p-1">
            <button
              onClick={onSpaceClick}
                className="w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200 ease-in-out relative ring-4 ring-white/5 shadow-2xl hover:ring-indigo-500/50 hover:scale-105 group overflow-visible min-w-[44px] min-h-[44px]"
              title={`Click to go back to ${spaceName}`}
            >
              <div className="w-full h-full rounded-full overflow-hidden">
                {isColorString ? (
                  <div 
                    className="w-full h-full rounded-full"
                    style={{ backgroundColor: spaceAvatarUrl }}
                  />
                ) : spaceAvatarUrl && isValidImageUrl ? (
                  <Image
                    src={spaceAvatarUrl}
                    alt={spaceName}
                    width={64}
                    height={64}
                    className="w-full h-full rounded-full object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="w-full h-full rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                    <span className="text-2xl font-bold text-white">
                      {spaceName?.[0]?.toUpperCase() || 'S'}
                    </span>
                  </div>
                )}
              </div>
            </button>
          </div>
          {/* Space Name Below Circle */}
          <div className="flex items-center gap-2">
            <h2 className="font-display font-bold text-lg text-white tracking-wide truncate text-center">{spaceName}</h2>
            {isAdmin && (
              <button 
                onClick={onSettingsClick}
                  className="text-slate-400 hover:text-white transition-colors p-1 flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center"
                title="Space Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
        {renderChannelsList()}
      </div>
    </>
  );
};

export default ChannelSidebar;
