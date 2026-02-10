"use client";

import React, { useState, useTransition, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Cog, Users, Mail, Link as LinkIcon, Shield, MoreVertical, Camera, Search, Loader2, UserPlus, XCircle, Hash, Mic, Plus, Lock, UserCog, Palette } from "lucide-react";
import { toast } from "sonner";
import DeleteSpaceModal from "./DeleteSpaceModal";
import { updateMemberRole, removeMember, getSpaceMembers, inviteUserToSpace, getInvitableContacts, cancelSpaceInvitation } from "../../actions/spaces";

type Member = {
  id: string;
  name: string;
  avatar: string | null;
  role: "admin" | "moderator" | "member";
  joined_at: string;
};

type Role = "admin" | "moderator" | "member";

// Permission System Types
type Permission = 
  | "view_channels"
  | "send_messages"
  | "manage_channels"
  | "manage_members"
  | "manage_roles"
  | "manage_space";

interface SpaceRole {
  id: string;
  name: string;
  color: string; // Hex color for label
  permissions: Permission[];
  isSystem: boolean; // System roles (admin, moderator, member) can't be deleted
  memberCount?: number;
}

// Channel Management Types
type ChannelType = 'text' | 'voice';

interface Channel {
  id: string;
  spaceId: string;
  name: string;
  type: ChannelType;
  allowedRoleIds?: string[]; // Role IDs that can access this channel
  isPrivate?: boolean; // For private channels
}

interface SpaceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  spaceId: string;
  spaceName: string;
  isAdmin: boolean;
}

const tabs = [
    { id: "general", label: "General", icon: Cog },
    { id: "channels", label: "Channels", icon: Hash },
    { id: "roles", label: "Roles & Members", icon: UserCog },
    { id: "members", label: "Members", icon: Users },
    { id: "invites", label: "Invites", icon: Mail },
  ];

const SpaceSettingsModal: React.FC<SpaceSettingsModalProps> = ({
  isOpen,
  onClose,
  spaceId,
  spaceName,
  isAdmin,
}) => {
  const [activeTab, setActiveTab] = useState("general");
  const [isPending, startTransition] = useTransition();
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [invitableContacts, setInvitableContacts] = useState<Array<{id: string, name: string, avatar: string | null, email: string | null}>>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactSearchQuery, setContactSearchQuery] = useState("");
  const [pendingInvites, setPendingInvites] = useState<Array<{id: string, invitee_id: string, invitee_name: string, invitee_avatar: string | null}>>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  
  // Channel Management State
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [isCreateChannelOpen, setIsCreateChannelOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelType, setNewChannelType] = useState<ChannelType>("text");
  const [newChannelPrivate, setNewChannelPrivate] = useState(false);
  const [newChannelAllowedRoles, setNewChannelAllowedRoles] = useState<string[]>([]);
  
  // Roles Management State
  const [roles, setRoles] = useState<SpaceRole[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [isCreateRoleOpen, setIsCreateRoleOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleColor, setNewRoleColor] = useState("#6366f1");
  const [newRolePermissions, setNewRolePermissions] = useState<Permission[]>([]);
  const [editingMemberRole, setEditingMemberRole] = useState<{memberId: string, currentRole: string} | null>(null);

  // Fetch members when modal opens and members tab is active
  useEffect(() => {
    if (isOpen && activeTab === "members") {
      loadMembers();
    }
  }, [isOpen, activeTab, spaceId]);

  // Fetch invitable contacts and pending invites when invites tab is active
  useEffect(() => {
    if (isOpen && activeTab === "invites") {
      loadInvitableContacts();
      loadPendingInvites();
    }
  }, [isOpen, activeTab, spaceId]);

  // Fetch channels when channels tab is active
  useEffect(() => {
    if (isOpen && activeTab === "channels") {
      loadChannels();
    }
  }, [isOpen, activeTab, spaceId]);

  const loadMembers = async () => {
    setMembersLoading(true);
    try {
      const { members: fetchedMembers, error } = await getSpaceMembers(spaceId);
      if (error) {
        toast.error(error);
        setMembers([]);
      } else {
        setMembers(fetchedMembers || []);
      }
    } catch (err) {
      toast.error("Failed to load members");
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  };

  const handleUpdateRole = (userId: string, newRole: Role) => {
    if (!isAdmin) {
      toast.error("You don't have permission to do that.");
      return;
    }
    startTransition(async () => {
      toast.info(`Promoting user to ${newRole}...`);
      const result = await updateMemberRole(spaceId, userId, newRole);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Member role updated.");
        // Refetch members to show updated role
        await loadMembers();
      }
    });
  };

  const handleRemoveMember = (userId: string) => {
    if (!isAdmin) {
      toast.error("You don't have permission to do that.");
      return;
    }
    startTransition(async () => {
      toast.info("Removing member...");
      const result = await removeMember(spaceId, userId);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Member removed.");
        // Refetch members to remove from list
        await loadMembers();
      }
    });
  };

  const loadInvitableContacts = async () => {
    if (!isAdmin) return;
    setContactsLoading(true);
    try {
      const { contacts, error } = await getInvitableContacts(spaceId);
      if (error) {
        toast.error(error);
        setInvitableContacts([]);
      } else {
        setInvitableContacts(contacts || []);
      }
    } catch (err) {
      toast.error("Failed to load contacts");
      setInvitableContacts([]);
    } finally {
      setContactsLoading(false);
    }
  };

  const loadPendingInvites = async () => {
    if (!isAdmin) return;
    setInvitesLoading(true);
    try {
      const { createClient } = await import("../../utils/supabase/client");
      const supabase = createClient();
      
      // First get invitation IDs
      const { data: invitesData, error: invitesError } = await supabase
        .from("space_invitations")
        .select("id, invitee_id")
        .eq("space_id", spaceId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (invitesError) {
        throw new Error(invitesError.message);
      }

      if (!invitesData || invitesData.length === 0) {
        setPendingInvites([]);
        return;
      }

      // Fetch profiles for invitees
      const inviteeIds = invitesData.map(i => i.invitee_id);
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", inviteeIds);

      if (profilesError) {
        throw new Error(profilesError.message);
      }

      // Create map for O(1) lookup
      const profilesMap = new Map(
        (profilesData || []).map(p => [p.id, p])
      );

      // Combine data
      const invites = invitesData.map((invite) => {
        const profile = profilesMap.get(invite.invitee_id);
        return {
          id: invite.id,
          invitee_id: invite.invitee_id,
          invitee_name: profile?.display_name || "Unknown User",
          invitee_avatar: profile?.avatar_url || null,
        };
      });

      setPendingInvites(invites);
    } catch (err) {
      toast.error("Failed to load pending invites");
      setPendingInvites([]);
    } finally {
      setInvitesLoading(false);
    }
  };

  const handleInviteContact = async (contactId: string) => {
    if (!isAdmin) {
      toast.error("You don't have permission to do that.");
      return;
    }
    startTransition(async () => {
      toast.info("Sending invitation...");
      const result = await inviteUserToSpace(spaceId, contactId);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Invitation sent!");
        // Reload contacts and pending invites
        await loadInvitableContacts();
        await loadPendingInvites();
      }
    });
  };

  const handleCancelInvite = async (inviteeId: string) => {
    if (!isAdmin) {
      toast.error("You don't have permission to do that.");
      return;
    }
    startTransition(async () => {
      toast.info("Cancelling invitation...");
      const result = await cancelSpaceInvitation(spaceId, inviteeId);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Invitation cancelled.");
        // Reload pending invites
        await loadPendingInvites();
        await loadInvitableContacts();
      }
    });
  };

  // Channel Management Functions
  const loadChannels = async () => {
    setChannelsLoading(true);
    try {
      // Mock API call - replace with actual API call later
      // For now, we'll use mock data
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate API delay
      
      // Mock channels data - replace with actual API call
      const mockChannels: Channel[] = [
        { id: "1", spaceId, name: "general", type: "text", isPrivate: false },
        { id: "2", spaceId, name: "announcements", type: "text", isPrivate: false },
        { id: "3", spaceId, name: "voice-lobby", type: "voice", isPrivate: false },
      ];
      
      setChannels(mockChannels);
    } catch (err) {
      toast.error("Failed to load channels");
      setChannels([]);
    } finally {
      setChannelsLoading(false);
    }
  };

  const handleCreateChannel = async () => {
    if (!isAdmin) {
      toast.error("You don't have permission to do that.");
      return;
    }

    if (!newChannelName.trim() || newChannelName.trim().length < 2) {
      toast.error("Channel name must be at least 2 characters long.");
      return;
    }

    startTransition(async () => {
      try {
        // Mock API call - replace with actual API call later
        toast.info("Creating channel...");
        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate API delay
        
        // Mock channel creation - replace with actual API call
        const newChannel: Channel = {
          id: Date.now().toString(), // Mock ID
          spaceId,
          name: newChannelName.trim(),
          type: newChannelType,
          isPrivate: newChannelPrivate,
          allowedRoleIds: newChannelPrivate ? newChannelAllowedRoles : undefined,
        };
        
        setChannels([...channels, newChannel]);
        toast.success(`Channel "${newChannelName}" created successfully!`);
        
        // Reset form
        setNewChannelName("");
        setNewChannelType("text");
        setNewChannelPrivate(false);
        setNewChannelAllowedRoles([]);
        setIsCreateChannelOpen(false);
      } catch (err) {
        toast.error("Failed to create channel");
      }
    });
  };

  // Roles Management Functions
  const loadRoles = async () => {
    setRolesLoading(true);
    try {
      // Mock API call - replace with actual API call later
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Mock roles - system roles + custom roles
      const mockRoles: SpaceRole[] = [
        { id: "admin", name: "Admin", color: "#ef4444", permissions: ["view_channels", "send_messages", "manage_channels", "manage_members", "manage_roles", "manage_space"], isSystem: true, memberCount: 1 },
        { id: "moderator", name: "Moderator", color: "#f59e0b", permissions: ["view_channels", "send_messages", "manage_channels", "manage_members"], isSystem: true, memberCount: 2 },
        { id: "member", name: "Member", color: "#6366f1", permissions: ["view_channels", "send_messages"], isSystem: true, memberCount: 10 },
      ];
      
      setRoles(mockRoles);
    } catch (err) {
      toast.error("Failed to load roles");
      setRoles([]);
    } finally {
      setRolesLoading(false);
    }
  };

  const handleCreateRole = async () => {
    if (!isAdmin) {
      toast.error("You don't have permission to do that.");
      return;
    }

    if (!newRoleName.trim() || newRoleName.trim().length < 2) {
      toast.error("Role name must be at least 2 characters long.");
      return;
    }

    startTransition(async () => {
      try {
        // Mock API call - replace with actual API call later
        toast.info("Creating role...");
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const newRole: SpaceRole = {
          id: `role_${Date.now()}`,
          name: newRoleName.trim(),
          color: newRoleColor,
          permissions: newRolePermissions,
          isSystem: false,
          memberCount: 0,
        };
        
        setRoles([...roles, newRole]);
        toast.success(`Role "${newRoleName}" created successfully!`);
        
        // Reset form
        setNewRoleName("");
        setNewRoleColor("#6366f1");
        setNewRolePermissions([]);
        setIsCreateRoleOpen(false);
      } catch (err) {
        toast.error("Failed to create role");
      }
    });
  };

  const handleDeleteSpace = () => {
    toast.success("Space deleted successfully");
  }

  // Handle click outside to close menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    };

    if (openMenuId) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [openMenuId]);

  const toggleMenu = (memberId: string) => {
    setOpenMenuId(openMenuId === memberId ? null : memberId);
  };

  if (!isOpen) return null;

  return (
    <>
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="aurora-glass-deep rounded-3xl w-full max-w-4xl h-[700px] flex flex-col shadow-2xl shadow-indigo-500/10 backdrop-blur-[64px]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Cog className="w-6 h-6 text-white/70" />
            <h2 className="text-xl font-bold text-white">
              {spaceName} Settings
            </h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar for Tabs */}
          <nav className="w-56 p-4 border-r border-white/5 flex flex-col justify-between">
            <div className="space-y-1">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-3 ${
                    activeTab === tab.id
                      ? "text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="active-pill"
                      className="absolute inset-0 aurora-glass-premium rounded-lg"
                      style={{ borderRadius: 8 }}
                      transition={{ type: "spring", duration: 0.6 }}
                    />
                  )}
                  <tab.icon className="w-5 h-5 z-10" />
                  <span className="z-10">{tab.label}</span>
                </button>
              ))}
            </div>
            {/* Can add footer items to nav here if needed */}
          </nav>

          {/* Tab Content */}
          <main className="flex-1 p-6 overflow-y-auto">
          <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
            {activeTab === "general" && (
              <div>
                  <h3 className="text-2xl font-bold text-white mb-6">General Settings</h3>
                  <div className="space-y-8">
                    {/* Avatar Uploader */}
                    <div>
                      <span className="text-sm font-medium text-white/80 mb-2 block">Space Icon</span>
                      <div className="flex items-center gap-4">
                        <div className="w-20 h-20 rounded-full bg-black/30 flex items-center justify-center border border-dashed border-white/20">
                           <Camera className="w-8 h-8 text-white/40" />
                        </div>
                        <button className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white font-semibold text-sm">Upload Image</button>
                      </div>
                    </div>
                    
                    <label className="block">
                      <span className="text-sm font-medium text-white/80">Space Name</span>
                      <input
                        type="text"
                        defaultValue={spaceName}
                        className="aurora-input mt-2 block w-full rounded-lg px-3 py-2.5"
                      />
                    </label>
                    <button className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-white font-semibold transition-colors">Save Changes</button>
                  </div>

                  {/* Danger Zone */}
                  <div className="mt-12 pt-6 border-t border-red-500/20">
                      <h4 className="text-lg font-semibold text-red-400 mb-2">Danger Zone</h4>
                      <div className="border border-red-500/20 bg-red-500/5 rounded-2xl p-6 flex items-center justify-between">
                          <div>
                              <p className="font-semibold text-red-200">Delete this space</p>
                              <p className="text-sm text-red-200/80">Once deleted, it's gone forever. Please be certain.</p>
                          </div>
                          <button onClick={() => setIsDeleteModalOpen(true)} className="aurora-glass-base border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white px-4 py-2 rounded-lg font-bold transition-colors">
                              Delete Space
                          </button>
                      </div>
                  </div>
              </div>
            )}
            {activeTab === "channels" && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-bold text-white">Channels</h3>
                  {isAdmin && (
                    <button
                      onClick={() => setIsCreateChannelOpen(true)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-white font-semibold text-sm transition-colors flex items-center gap-2"
                    >
                      <Plus size={16} />
                      Create Channel
                    </button>
                  )}
                </div>

                {channelsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Text Channels Section */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Hash className="w-4 h-4 text-slate-400" />
                        <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Text Channels</h4>
                      </div>
                      <div className="space-y-2">
                        {channels.filter(c => c.type === 'text').length > 0 ? (
                          channels.filter(c => c.type === 'text').map(channel => (
                            <div
                              key={channel.id}
                              className="aurora-glass-base flex items-center justify-between p-3 rounded-xl"
                            >
                              <div className="flex items-center gap-3">
                                <Hash className="w-5 h-5 text-slate-400" />
                                <div>
                                  <span className="text-sm font-semibold text-slate-200">{channel.name}</span>
                                  {channel.isPrivate && (
                                    <div className="flex items-center gap-1 mt-1">
                                      <Lock className="w-3 h-3 text-slate-400" />
                                      <span className="text-xs text-slate-400">Private</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-8 text-slate-400 text-sm">
                            No text channels yet.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Voice Channels Section */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Mic className="w-4 h-4 text-slate-400" />
                        <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Voice Channels</h4>
                      </div>
                      <div className="space-y-2">
                        {channels.filter(c => c.type === 'voice').length > 0 ? (
                          channels.filter(c => c.type === 'voice').map(channel => (
                            <div
                              key={channel.id}
                              className="aurora-glass-base flex items-center justify-between p-3 rounded-xl"
                            >
                              <div className="flex items-center gap-3">
                                <Mic className="w-5 h-5 text-slate-400" />
                                <div>
                                  <span className="text-sm font-semibold text-slate-200">{channel.name}</span>
                                  {channel.isPrivate && (
                                    <div className="flex items-center gap-1 mt-1">
                                      <Lock className="w-3 h-3 text-slate-400" />
                                      <span className="text-xs text-slate-400">Private</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-8 text-slate-400 text-sm">
                            No voice channels yet.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            {activeTab === "roles" && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-bold text-white">Roles & Members</h3>
                  {isAdmin && (
                    <button
                      onClick={() => setIsCreateRoleOpen(true)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-white font-semibold text-sm transition-colors flex items-center gap-2"
                    >
                      <Plus size={16} />
                      Create Role
                    </button>
                  )}
                </div>

                {rolesLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* System Roles */}
                    <div>
                      <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">System Roles</h4>
                      <div className="space-y-2">
                        {roles.filter(r => r.isSystem).map(role => (
                          <div
                            key={role.id}
                            className="aurora-glass-base flex items-center justify-between p-4 rounded-xl"
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className="w-4 h-4 rounded-full"
                                style={{ backgroundColor: role.color }}
                              />
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-slate-200">{role.name}</span>
                                  <span className="text-xs text-slate-400">({role.memberCount} members)</span>
                                </div>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {role.permissions.map(perm => (
                                    <span
                                      key={perm}
                                      className="text-[10px] px-2 py-0.5 bg-white/5 rounded text-slate-400"
                                    >
                                      {perm.replace(/_/g, ' ')}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Custom Roles */}
                    {roles.filter(r => !r.isSystem).length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">Custom Roles</h4>
                        <div className="space-y-2">
                          {roles.filter(r => !r.isSystem).map(role => (
                            <div
                              key={role.id}
                              className="aurora-glass-base flex items-center justify-between p-4 rounded-xl"
                            >
                              <div className="flex items-center gap-3">
                                <div
                                  className="w-4 h-4 rounded-full"
                                  style={{ backgroundColor: role.color }}
                                />
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-slate-200">{role.name}</span>
                                    <span className="text-xs text-slate-400">({role.memberCount} members)</span>
                                  </div>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {role.permissions.map(perm => (
                                      <span
                                        key={perm}
                                        className="text-[10px] px-2 py-0.5 bg-white/5 rounded text-slate-400"
                                      >
                                        {perm.replace(/_/g, ' ')}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              {isAdmin && (
                                <button className="text-red-400 hover:text-red-300 text-sm">
                                  Delete
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Assign Roles to Members Section */}
                    <div className="mt-8 pt-6 border-t border-white/10">
                      <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">Assign Roles to Members</h4>
                      <div className="space-y-2">
                        {members.slice(0, 5).map(member => (
                          <div
                            key={member.id}
                            className="aurora-glass-base flex items-center justify-between p-3 rounded-xl"
                          >
                            <div className="flex items-center gap-3">
                              {member.avatar ? (
                                <img src={member.avatar} alt={member.name} className="w-8 h-8 rounded-full border border-white/10 object-cover" />
                              ) : (
                                <div className="w-8 h-8 rounded-full border border-white/10 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center text-white font-semibold text-xs">
                                  {member.name.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <span className="text-sm font-semibold text-slate-200">{member.name}</span>
                            </div>
                            {isAdmin && (
                              <select
                                value={member.role}
                                onChange={(e) => {
                                  // Mock role assignment - replace with actual API call
                                  handleUpdateRole(member.id, e.target.value as Role);
                                }}
                                className="aurora-input rounded-lg px-3 py-1.5 text-sm"
                              >
                                {roles.map(role => (
                                  <option key={role.id} value={role.id}>
                                    {role.name}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            {activeTab === "members" && (
              <div>
                <h3 className="text-2xl font-bold text-white mb-6">Members</h3>
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search members..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="aurora-input w-full rounded-xl pl-10 pr-4 py-2.5 text-sm"
                  />
                </div>
                {membersLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    {members
                      .filter(member => 
                        member.name.toLowerCase().includes(searchQuery.toLowerCase())
                      )
                      .map(member => (
                    <div key={member.id} className={`aurora-glass-base flex items-center justify-between p-3 rounded-xl transition-all hover:border-white/20 relative ${openMenuId === member.id ? "z-50 ring-1 ring-white/10" : "z-0"}`}>
                      <div className="flex items-center gap-4">
                        {member.avatar ? (
                          <img src={member.avatar} alt={member.name} className="w-10 h-10 rounded-full border border-white/10 object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full border border-white/10 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center text-white font-semibold text-sm">
                            {member.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <span className="text-sm font-semibold text-slate-200">{member.name}</span>
                          <div className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ml-2 align-middle inline-block ${
                            member.role === 'admin' ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' :
                            member.role === 'moderator' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                            'bg-slate-500/20 text-slate-400 border-slate-500/30'
                          }`}>{member.role}</div>
                        </div>
                      </div>
                      {isAdmin && (
                        <div className="relative" ref={menuRef}>
                           <button 
                             onClick={(e) => {
                               e.stopPropagation();
                               toggleMenu(member.id);
                             }}
                             className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                           >
                               <MoreVertical size={20} />
                           </button>
                           {openMenuId === member.id && (
                             <div 
                               className="absolute right-0 mt-2 w-56 bg-slate-950/90 backdrop-blur-[40px] rounded-xl border border-white/10 shadow-2xl z-[100] overflow-hidden animate-in fade-in zoom-in-95 duration-200 pointer-events-auto cursor-default"
                               onClick={(e) => e.stopPropagation()}
                             >
                               <ul className="py-1">
                                   <li>
                                     <button 
                                       onClick={(e) => {
                                         e.stopPropagation();
                                         handleUpdateRole(member.id, 'moderator');
                                         setOpenMenuId(null);
                                       }} 
                                       className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-all duration-200 flex items-center gap-2 cursor-pointer active:scale-[0.98] pointer-events-auto"
                                     >
                                       Promote to Moderator
                                     </button>
                                   </li>
                                   <li>
                                     <button 
                                       onClick={(e) => {
                                         e.stopPropagation();
                                         handleUpdateRole(member.id, 'admin');
                                         setOpenMenuId(null);
                                       }} 
                                       className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-all duration-200 flex items-center gap-2 cursor-pointer active:scale-[0.98] pointer-events-auto"
                                     >
                                       Promote to Admin
                                     </button>
                                   </li>
                                   <li><hr className="h-px bg-white/10 my-1"/></li>
                                   <li>
                                     <button 
                                       onClick={(e) => {
                                         e.stopPropagation();
                                         handleRemoveMember(member.id);
                                         setOpenMenuId(null);
                                       }} 
                                       className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/20 hover:text-red-200 transition-all duration-200 flex items-center gap-2 cursor-pointer active:scale-[0.98] pointer-events-auto"
                                     >
                                       Kick Member
                                     </button>
                                   </li>
                                   <li>
                                     <button 
                                       onClick={(e) => {
                                         e.stopPropagation();
                                         setOpenMenuId(null);
                                       }} 
                                       className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/20 hover:text-red-200 transition-all duration-200 flex items-center gap-2 cursor-pointer active:scale-[0.98] pointer-events-auto"
                                     >
                                       Ban Member
                                     </button>
                                   </li>
                               </ul>
                           </div>
                           )}
                        </div>
                      )}
                    </div>
                      ))}
                    {members.filter(member => 
                      member.name.toLowerCase().includes(searchQuery.toLowerCase())
                    ).length === 0 && (
                      <div className="text-center py-12 text-slate-400">
                        {searchQuery ? "No members found matching your search." : "No members yet."}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            {activeTab === "invites" && (
              <div>
                <h3 className="text-2xl font-bold text-white mb-6">Invites</h3>
                <div className="space-y-6">
                  {/* Invite by Contact Search */}
                  {isAdmin && (
                    <div>
                      <label className="text-sm font-medium text-white/80 mb-2 block">Invite from Contacts</label>
                      <div className="relative mb-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search contacts..."
                          value={contactSearchQuery}
                          onChange={(e) => setContactSearchQuery(e.target.value)}
                          className="aurora-input w-full rounded-xl pl-10 pr-4 py-2.5 text-sm"
                        />
                      </div>
                      {contactsLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {invitableContacts
                            .filter(contact =>
                              contact.name.toLowerCase().includes(contactSearchQuery.toLowerCase()) ||
                              contact.email?.toLowerCase().includes(contactSearchQuery.toLowerCase())
                            )
                            .map(contact => (
                              <div key={contact.id} className="aurora-glass-base flex items-center justify-between p-3 rounded-xl">
                                <div className="flex items-center gap-3">
                                  {contact.avatar ? (
                                    <img src={contact.avatar} alt={contact.name} className="w-10 h-10 rounded-full border border-white/10 object-cover" />
                                  ) : (
                                    <div className="w-10 h-10 rounded-full border border-white/10 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center text-white font-semibold text-sm">
                                      {contact.name.charAt(0).toUpperCase()}
                                    </div>
                                  )}
                                  <div>
                                    <p className="text-sm font-semibold text-slate-200">{contact.name}</p>
                                    {contact.email && (
                                      <p className="text-xs text-slate-400">{contact.email}</p>
                                    )}
                                  </div>
                                </div>
                                <button
                                  onClick={() => handleInviteContact(contact.id)}
                                  className="px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2"
                                >
                                  <UserPlus size={16} />
                                  Invite
                                </button>
                              </div>
                            ))}
                          {invitableContacts.filter(contact =>
                            contact.name.toLowerCase().includes(contactSearchQuery.toLowerCase()) ||
                            contact.email?.toLowerCase().includes(contactSearchQuery.toLowerCase())
                          ).length === 0 && (
                            <div className="text-center py-8 text-slate-400">
                              {contactSearchQuery ? "No contacts found." : "No contacts available to invite."}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Pending Invitations */}
                  {isAdmin && (
                    <div>
                      <label className="text-sm font-medium text-white/80 mb-2 block">Pending Invitations</label>
                      {invitesLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {pendingInvites.map(invite => (
                            <div key={invite.id} className="aurora-glass-base flex items-center justify-between p-3 rounded-xl">
                              <div className="flex items-center gap-3">
                                {invite.invitee_avatar ? (
                                  <img src={invite.invitee_avatar} alt={invite.invitee_name} className="w-10 h-10 rounded-full border border-white/10 object-cover" />
                                ) : (
                                  <div className="w-10 h-10 rounded-full border border-white/10 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center text-white font-semibold text-sm">
                                    {invite.invitee_name.charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <div>
                                  <p className="text-sm font-semibold text-slate-200">{invite.invitee_name}</p>
                                  <p className="text-xs text-slate-400">Pending invitation</p>
                                </div>
                              </div>
                              <button
                                onClick={() => handleCancelInvite(invite.invitee_id)}
                                className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 hover:text-red-300 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2"
                              >
                                <XCircle size={16} />
                                Cancel
                              </button>
                            </div>
                          ))}
                          {pendingInvites.length === 0 && (
                            <div className="text-center py-8 text-slate-400">
                              No pending invitations.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Invite Link (Future feature) */}
                  <div>
                    <label className="text-sm font-medium text-white/80">Invite Link</label>
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        type="text"
                        readOnly
                        value="https://aether.gg/join/aB3xZ9P"
                        className="aurora-input flex-1 rounded-lg px-3 py-2.5 opacity-60"
                      />
                      <button className="aurora-glass-base px-4 py-2.5 rounded-lg text-white font-semibold text-sm hover:text-indigo-400 transition-colors">Copy</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </div>
    
    {/* Create Channel Modal */}
    <AnimatePresence>
      {isCreateChannelOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60]"
            onClick={() => setIsCreateChannelOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-[70] flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="aurora-glass-deep rounded-2xl w-full max-w-md p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white">Create Channel</h3>
                <button
                  onClick={() => setIsCreateChannelOpen(false)}
                  className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleCreateChannel();
                }}
                className="space-y-6"
              >
                {/* Channel Name Input */}
                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 block">
                    Channel Name
                  </label>
                  <input
                    type="text"
                    value={newChannelName}
                    onChange={(e) => setNewChannelName(e.target.value)}
                    placeholder="e.g., general, announcements"
                    className="aurora-input w-full rounded-lg px-3 py-2.5"
                    autoFocus
                  />
                </div>

                {/* Channel Type Selection */}
                <div>
                  <label className="text-sm font-medium text-white/80 mb-3 block">
                    Channel Type
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Text Channel Option */}
                    <button
                      type="button"
                      onClick={() => setNewChannelType("text")}
                      className={`aurora-glass-base p-4 rounded-xl border-2 transition-all ${
                        newChannelType === "text"
                          ? "border-indigo-500 bg-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.3)]"
                          : "border-white/10 hover:border-white/20"
                      }`}
                    >
                      <div className="flex flex-col items-center gap-2">
                        <Hash className={`w-6 h-6 ${newChannelType === "text" ? "text-indigo-300" : "text-slate-400"}`} />
                        <span className={`text-sm font-semibold ${newChannelType === "text" ? "text-indigo-300" : "text-slate-300"}`}>
                          Text
                        </span>
                        <span className="text-xs text-slate-400 text-center">
                          Send messages, images, and files
                        </span>
                      </div>
                    </button>

                    {/* Voice Channel Option */}
                    <button
                      type="button"
                      onClick={() => setNewChannelType("voice")}
                      className={`aurora-glass-base p-4 rounded-xl border-2 transition-all ${
                        newChannelType === "voice"
                          ? "border-indigo-500 bg-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.3)]"
                          : "border-white/10 hover:border-white/20"
                      }`}
                    >
                      <div className="flex flex-col items-center gap-2">
                        <Mic className={`w-6 h-6 ${newChannelType === "voice" ? "text-indigo-300" : "text-slate-400"}`} />
                        <span className={`text-sm font-semibold ${newChannelType === "voice" ? "text-indigo-300" : "text-slate-300"}`}>
                          Voice
                        </span>
                        <span className="text-xs text-slate-400 text-center">
                          Hang out together with voice
                        </span>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Private Channel Toggle */}
                <div className="flex items-center justify-between p-4 aurora-glass-base rounded-xl">
                  <div className="flex items-center gap-3">
                    <Lock className="w-5 h-5 text-slate-400" />
                    <div>
                      <span className="text-sm font-semibold text-slate-200 block">Private Channel</span>
                      <span className="text-xs text-slate-400">Only selected roles can access this channel</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setNewChannelPrivate(!newChannelPrivate);
                      if (!newChannelPrivate) {
                        // When enabling private, select all roles by default
                        setNewChannelAllowedRoles(roles.map(r => r.id));
                      } else {
                        setNewChannelAllowedRoles([]);
                      }
                    }}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      newChannelPrivate ? "bg-indigo-600" : "bg-slate-700"
                    }`}
                  >
                    <span
                      className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        newChannelPrivate ? "translate-x-6" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {/* Role Selection (only shown when private is enabled) */}
                {newChannelPrivate && roles.length > 0 && (
                  <div>
                    <label className="text-sm font-medium text-white/80 mb-3 block">
                      Allowed Roles
                    </label>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {roles.map(role => (
                        <label
                          key={role.id}
                          className="flex items-center gap-3 p-3 aurora-glass-base rounded-xl cursor-pointer hover:bg-white/5 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={newChannelAllowedRoles.includes(role.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNewChannelAllowedRoles([...newChannelAllowedRoles, role.id]);
                              } else {
                                setNewChannelAllowedRoles(newChannelAllowedRoles.filter(id => id !== role.id));
                              }
                            }}
                            className="w-4 h-4 rounded border-white/20 bg-white/5 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
                          />
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: role.color }}
                          />
                          <span className="text-sm font-semibold text-slate-200 flex-1">{role.name}</span>
                          {role.isSystem && (
                            <span className="text-xs text-slate-400">System</span>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreateChannelOpen(false);
                      setNewChannelName("");
                      setNewChannelType("text");
                      setNewChannelPrivate(false);
                      setNewChannelAllowedRoles([]);
                    }}
                    className="flex-1 px-4 py-2.5 aurora-glass-base rounded-lg text-white font-semibold text-sm hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!newChannelName.trim() || isPending}
                    className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 disabled:cursor-not-allowed rounded-lg text-white font-semibold text-sm transition-colors"
                  >
                    {isPending ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating...
                      </span>
                    ) : (
                      "Create Channel"
                    )}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>

    {/* Create Role Modal */}
    <AnimatePresence>
      {isCreateRoleOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60]"
            onClick={() => setIsCreateRoleOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-[70] flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="aurora-glass-deep rounded-2xl w-full max-w-md p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white">Create Role</h3>
                <button
                  onClick={() => setIsCreateRoleOpen(false)}
                  className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleCreateRole();
                }}
                className="space-y-6"
              >
                {/* Role Name */}
                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 block">
                    Role Name
                  </label>
                  <input
                    type="text"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    placeholder="e.g., Developer, Designer"
                    className="aurora-input w-full rounded-lg px-3 py-2.5"
                    autoFocus
                  />
                </div>

                {/* Role Color */}
                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 block">
                    Role Color
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={newRoleColor}
                      onChange={(e) => setNewRoleColor(e.target.value)}
                      className="w-16 h-16 rounded-lg border border-white/10 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={newRoleColor}
                      onChange={(e) => setNewRoleColor(e.target.value)}
                      placeholder="#6366f1"
                      className="aurora-input flex-1 rounded-lg px-3 py-2.5"
                    />
                  </div>
                </div>

                {/* Permissions */}
                <div>
                  <label className="text-sm font-medium text-white/80 mb-3 block">
                    Permissions
                  </label>
                  <div className="space-y-2">
                    {([
                      "view_channels",
                      "send_messages",
                      "manage_channels",
                      "manage_members",
                      "manage_roles",
                      "manage_space",
                    ] as Permission[]).map(permission => (
                      <label
                        key={permission}
                        className="flex items-center gap-3 p-3 aurora-glass-base rounded-xl cursor-pointer hover:bg-white/5 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={newRolePermissions.includes(permission)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewRolePermissions([...newRolePermissions, permission]);
                            } else {
                              setNewRolePermissions(newRolePermissions.filter(p => p !== permission));
                            }
                          }}
                          className="w-4 h-4 rounded border-white/20 bg-white/5 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
                        />
                        <span className="text-sm font-semibold text-slate-200 flex-1">
                          {permission.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreateRoleOpen(false);
                      setNewRoleName("");
                      setNewRoleColor("#6366f1");
                      setNewRolePermissions([]);
                    }}
                    className="flex-1 px-4 py-2.5 aurora-glass-base rounded-lg text-white font-semibold text-sm hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!newRoleName.trim() || isPending}
                    className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 disabled:cursor-not-allowed rounded-lg text-white font-semibold text-sm transition-colors"
                  >
                    {isPending ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating...
                      </span>
                    ) : (
                      "Create Role"
                    )}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>

    <DeleteSpaceModal 
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteSpace}
        spaceName={spaceName}
    />
    </>
  );
};

export default SpaceSettingsModal;