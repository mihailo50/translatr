"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { Search, MessageSquare, Loader2, X } from "lucide-react";
import { globalSearch, GlobalSearchResults } from "../../app/actions/search";

export default function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResults | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounce search logic
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.trim().length >= 2) {
        setIsLoading(true);
        setIsOpen(true);
        try {
          const data = await globalSearch(query);
          setResults(data);
        } catch (_error) {
          // Search failed - silently handle
        } finally {
          setIsLoading(false);
        }
      } else {
        setResults(null);
        setIsOpen(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelectUser = (userId: string) => {
    // Using window.location to ensure robust navigation in this hybrid environment
    const navEvent = new CustomEvent("app-navigate", { detail: `/chat/${userId}` });
    window.dispatchEvent(navEvent);
    setIsOpen(false);
    setQuery("");
  };

  const handleSelectMessage = (roomId: string) => {
    const navEvent = new CustomEvent("app-navigate", { detail: `/chat/${roomId}` });
    window.dispatchEvent(navEvent);
    setIsOpen(false);
    setQuery("");
  };

  return (
    <div className="relative group w-full max-w-md hidden sm:block" ref={searchRef}>
      {/* Input Field */}
      <div className="relative z-50">
        <Search
          className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors ${isOpen ? "text-aurora-indigo" : "text-white/30 group-focus-within:text-aurora-indigo"}`}
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.length >= 2 && setIsOpen(true)}
          placeholder="Search messages, people..."
          className={`
                        w-full bg-white/5 border rounded-full py-2 pl-10 pr-10 text-sm text-white focus:outline-none focus:ring-2 focus:ring-aurora-indigo/50 transition-all
                        ${isOpen ? "border-aurora-indigo/50 bg-black/40" : "border-white/10"}
                    `}
        />

        {isLoading ? (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-aurora-indigo animate-spin" />
        ) : (
          query && (
            <button
              onClick={() => {
                setQuery("");
                setIsOpen(false);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white"
            >
              <X size={14} />
            </button>
          )
        )}
      </div>

      {/* Results Dropdown */}
      {isOpen && results && (
        <div className="absolute top-full left-0 right-0 mt-2 glass-strong rounded-2xl border border-white/10 overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200 z-50">
          <div className="max-h-[400px] overflow-y-auto scrollbar-thin">
            {/* Users Section */}
            {results.users.length > 0 && (
              <div className="p-2">
                <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider px-3 py-2">
                  People
                </h3>
                {results.users.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => handleSelectUser(user.id)}
                    className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/10 transition-colors text-left group/item"
                  >
                    <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center overflow-hidden border border-white/10 shrink-0">
                      {user.avatar_url ? (
                        <Image
                          src={user.avatar_url}
                          width={32}
                          height={32}
                          className="w-full h-full object-cover"
                          alt=""
                        />
                      ) : (
                        <span className="text-xs font-bold text-white">
                          {(user.display_name?.[0] || user.email?.[0] || "?").toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white group-hover/item:text-aurora-indigo transition-colors truncate">
                        {user.display_name || "Unknown"}
                      </p>
                      <p className="text-xs text-white/40 truncate">{user.email}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Messages Section */}
            {results.messages.length > 0 && (
              <div className="p-2 border-t border-white/5">
                <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider px-3 py-2">
                  Messages
                </h3>
                {results.messages.map((msg) => (
                  <button
                    key={msg.id}
                    onClick={() => handleSelectMessage(msg.room_id)}
                    className="w-full flex items-start gap-3 p-2 rounded-xl hover:bg-white/10 transition-colors text-left group/item"
                  >
                    <div className="mt-1 p-1.5 rounded-lg bg-aurora-indigo/10 text-aurora-indigo shrink-0">
                      <MessageSquare size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-0.5">
                        <span className="text-xs font-semibold text-white/70 truncate pr-2">
                          {msg.sender_name}
                        </span>
                        <span className="text-[10px] text-white/30 shrink-0">
                          {new Date(msg.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm text-white/60 truncate group-hover/item:text-white transition-colors">
                        {msg.text}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Empty State */}
            {results.users.length === 0 && results.messages.length === 0 && (
              <div className="p-8 text-center text-white/40">
                <Search size={24} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">No results found</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
