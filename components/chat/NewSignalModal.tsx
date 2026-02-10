"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, Users, ArrowRight, MessageSquarePlus, Loader2 } from "lucide-react";
import { UserProfile } from "../../types";
import { searchUsers, ContactUser } from "../../actions/contacts";
import Image from "next/image";

interface NewSignalModalProps {
  isOpen: boolean;
  onClose: () => void;
  // eslint-disable-next-line no-unused-vars
  createConversation: (args: {
    participants: string[];
    groupName?: string;
    initialMessage?: string;
  }) => Promise<{ chatId?: string; error?: string }>;
}

export default function NewSignalModal({ isOpen, onClose, createConversation }: NewSignalModalProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedContacts, setSelectedContacts] = useState<UserProfile[]>([]);
  const [groupName, setGroupName] = useState("");
  const [initialMessage, setInitialMessage] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<ContactUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Debounced real-time search
  useEffect(() => {
    if (searchTerm.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchUsers(searchTerm.trim());
        // searchUsers already returns ContactUser[], no conversion needed
        setSearchResults(results);
      } catch (err) {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const filteredContacts = useMemo(() => {
    return searchResults.filter(
      (contact) => !selectedContacts.find((sc) => sc.id === contact.id)
    );
  }, [searchResults, selectedContacts]);

  const isGroup = selectedContacts.length > 1;

  const handleSelectContact = (contact: ContactUser) => {
    // Convert ContactUser to UserProfile format for selectedContacts
    const userProfile: UserProfile = {
      id: contact.id,
      username: contact.display_name || contact.email?.split("@")[0] || "Unknown",
      avatar_url: contact.avatar_url || null,
      full_name: contact.display_name || contact.email?.split("@")[0] || "Unknown",
      display_name: contact.display_name ?? undefined,
      email: contact.email ?? undefined,
    };
    setSelectedContacts((prev) => [...prev, userProfile]);
    setSearchTerm("");
  };

  const handleRemoveContact = (contactId: string) => {
    setSelectedContacts((prev) => prev.filter((c) => c.id !== contactId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedContacts.length === 0) {
        setError("Please select at least one contact.");
        return;
    }
    if (isGroup && !groupName.trim()) {
        setError("A group name is required for group chats.");
        return;
    }
    setIsCreating(true);
    setError(null);
    
    const result = await createConversation({
        participants: selectedContacts.map(c => c.id),
        groupName: isGroup ? groupName : undefined,
        initialMessage: initialMessage || undefined,
    });

    setIsCreating(false);
    if (result.error) {
        setError(result.error);
    } else {
        // Success handled by redirect in parent component
        resetAndClose();
    }
  };

  const resetAndClose = () => {
    setSearchTerm("");
    setSelectedContacts([]);
    setGroupName("");
    setInitialMessage("");
    setError(null);
    setIsCreating(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[50]"
          onClick={resetAndClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 20, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="aurora-glass-deep w-full max-w-lg p-6 rounded-3xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <MessageSquarePlus size={24} className="text-indigo-400" />
                New Signal
              </h2>
              <button
                onClick={resetAndClose}
                className="p-2 rounded-full hover:bg-white/10 transition-colors"
                aria-label="Close modal"
              >
                <X size={20} className="text-white/70" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* --- CONTACTS INPUT --- */}
              <div className="border border-white/10 rounded-xl bg-white/5 p-2 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                    {selectedContacts.map((contact) => (
                        <motion.div
                            key={contact.id}
                            layout
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            className="flex items-center gap-2 bg-indigo-500/20 text-indigo-300 rounded-full pl-3 pr-1 py-1 text-sm font-medium"
                        >
                            <span>{contact.username}</span>
                            <button
                                type="button"
                                onClick={() => handleRemoveContact(contact.id)}
                                className="p-1 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
                            >
                                <X size={14} />
                            </button>
                        </motion.div>
                    ))}
                    <div className="relative flex-1 min-w-[150px]">
                        <Search
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
                            size={18}
                        />
                        <input
                            type="text"
                            placeholder={selectedContacts.length > 0 ? "Add more..." : "Search contacts..."}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-transparent py-2 pl-10 pr-4 text-white placeholder-white/30 focus:outline-none"
                        />
                    </div>
                </div>

                {/* --- FILTERED CONTACTS LIST --- */}
                {searchTerm.length >= 2 && (
                    <div className="max-h-32 overflow-y-auto scrollbar-thin p-1">
                        {isSearching ? (
                            <div className="flex items-center justify-center py-4">
                                <Loader2 className="w-5 h-5 animate-spin text-white/40" />
                            </div>
                        ) : filteredContacts.length > 0 ? (
                            filteredContacts.map((contact) => (
                                <div
                                    key={contact.id}
                                    onClick={() => handleSelectContact(contact)}
                                    className="flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-white/10 transition-colors"
                                >
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center overflow-hidden border border-white/10 flex-shrink-0">
                                        {contact.avatar_url ? (
                                            <Image
                                                src={contact.avatar_url}
                                                alt={contact.display_name || contact.email?.split("@")[0] || "User"}
                                                width={32}
                                                height={32}
                                                className="w-full h-full rounded-full object-cover"
                                                unoptimized
                                            />
                                        ) : (
                                            <span className="text-xs font-bold text-white">
                                                {(contact.display_name || contact.email?.split("@")[0] || "U")[0]?.toUpperCase()}
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-white/80">{contact.display_name || contact.email?.split("@")[0] || "Unknown"}</span>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-4 text-white/40 text-sm">
                                No users found
                            </div>
                        )}
                    </div>
                )}
              </div>

              {/* --- GROUP NAME INPUT --- */}
              <AnimatePresence>
                {isGroup && (
                  <motion.div
                    initial={{ height: 0, opacity: 0, marginTop: 0 }}
                    animate={{ height: "auto", opacity: 1, marginTop: '1rem' }}
                    exit={{ height: 0, opacity: 0, marginTop: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                     <div className="group">
                        <label className="block text-xs font-medium text-white/60 mb-1.5 ml-1 uppercase tracking-wider">
                          Group Name
                        </label>
                        <div className="relative border border-white/10 rounded-xl bg-white/5 focus-within:border-indigo-500/50 transition-colors duration-300">
                          <Users
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-indigo-400 transition-colors"
                            size={20}
                          />
                          <input
                            type="text"
                            placeholder="e.g. Project Team"
                            value={groupName}
                            onChange={(e) => setGroupName(e.target.value)}
                            className="w-full bg-transparent py-3 pl-10 pr-4 text-white placeholder-white/30 focus:outline-none"
                            required
                          />
                        </div>
                      </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* --- INITIAL MESSAGE --- */}
              <div>
                  <textarea
                    value={initialMessage}
                    onChange={(e) => setInitialMessage(e.target.value)}
                    placeholder="Send an initial message... (optional)"
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50 transition-colors duration-300 min-h-[80px]"
                    rows={3}
                  ></textarea>
              </div>
              
              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-200 text-sm text-center">
                  {error}
                </div>
              )}

              {/* --- SUBMIT BUTTON --- */}
              <button
                type="submit"
                disabled={isCreating || selectedContacts.length === 0}
                className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-90 text-white font-semibold rounded-xl shadow-lg shadow-indigo-500/30 transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isCreating ? (
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                        <Users size={20} />
                    </motion.div>
                ) : (
                  <>
                    <span>
                      {isGroup ? `Create Group Chat` : `Start Chat with ${selectedContacts[0]?.username || ''}`}
                    </span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
