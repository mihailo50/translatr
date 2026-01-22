"use client";

import React from "react";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { NavItem } from "../../types";
import { MessageSquare, Settings, Users, Globe, X, Moon, Sun } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";
import UserFooter from "./UserFooter";
import { AetherLogo } from "../ui/AetherLogo";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const navItems: NavItem[] = [
  { label: "Chats", href: "/", icon: MessageSquare },
  { label: "Contacts", href: "/contacts", icon: Users },
  { label: "Translate", href: "/translate", icon: Globe },
  { label: "Settings", href: "/settings", icon: Settings },
];

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  const handleNavigation = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    router.push(href);
    if (window.innerWidth < 768) onClose();
  };

  // Helper to determine if link is active
  const isLinkActive = (href: string) => {
    if (href === "/") {
      return pathname === "/" || pathname?.startsWith("/chat");
    }
    return pathname?.startsWith(href);
  };

  return (
    <>
      {/* Mobile Overlay */}
      <div
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300 md:hidden ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-72 transform transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:h-screen flex flex-col glass-strong border-r border-white/10 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } ${theme === "midnight" ? "border-midnight-border" : ""}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/5">
          <div
            className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => {
              router.push("/");
              if (window.innerWidth < 768) onClose();
            }}
          >
            <Image
              src="/logo/logo.svg"
              alt="Aether"
              width={58}
              height={58}
              className="w-[57.6px] h-[57.6px]"
            />
            <AetherLogo />
          </div>
          <button
            onClick={onClose}
            className="md:hidden p-1 rounded-md hover:bg-white/10 text-white/70 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto scrollbar-thin">
          <div className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-4 px-2">
            Menu
          </div>
          {navItems.map((item) => {
            const isActive = isLinkActive(item.href);

            return (
              <a
                key={item.label}
                href={item.href}
                onClick={(e) => handleNavigation(e, item.href)}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group cursor-pointer ${
                  isActive
                    ? theme === "midnight"
                      ? "bg-white/10 text-white border border-white/20"
                      : "bg-aurora-indigo/10 text-aurora-indigo border border-aurora-indigo/20 shadow-lg shadow-aurora-indigo/5"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <item.icon
                  size={20}
                  className={`${
                    isActive
                      ? theme === "midnight"
                        ? "text-white"
                        : "text-aurora-indigo"
                      : "text-slate-400 group-hover:text-white"
                  } transition-colors`}
                />
                <span className="font-medium">{item.label}</span>
                {isActive && theme === "aurora" && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-aurora-indigo shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                )}
              </a>
            );
          })}
        </nav>

        {/* Footer Actions */}
        <div className="px-4 pb-2 space-y-2">
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm text-white/50 hover:bg-white/5 hover:text-white transition-colors mb-2"
          >
            <span className="flex items-center gap-2">
              {theme === "aurora" ? <Moon size={16} /> : <Sun size={16} />}
              {theme === "aurora" ? "Dark Mode" : "Light Mode"}
            </span>
            <div
              className={`w-8 h-4 rounded-full relative transition-colors ${theme === "midnight" ? "bg-white/20" : "bg-aurora-indigo/30"}`}
            >
              <div
                className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${theme === "midnight" ? "left-4.5 translate-x-4" : "left-0.5"}`}
              />
            </div>
          </button>
        </div>

        {/* User Profile Footer */}
        <UserFooter />
      </aside>
    </>
  );
};

export default Sidebar;
