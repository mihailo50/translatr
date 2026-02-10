import { LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  active?: boolean;
}

export interface UserProfile {
  id: string;
  username: string;
  display_name?: string;
  full_name?: string;
  avatar_url: string | null;
  email?: string;
}

// These interfaces are defined locally in their respective components
// Keeping them here for reference, but they're not exported to avoid duplication
// interface UserProfile {
//   name: string;
//   email: string;
//   avatarUrl: string;
// }

// interface SidebarProps {
//   isOpen: boolean;
//   setIsOpen: (isOpen: boolean) => void;
// }
