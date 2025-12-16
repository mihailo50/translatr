import { LucideIcon } from 'lucide-react';

export interface NavItem {
    label: string;
    href: string;
    icon: LucideIcon;
    active?: boolean;
}

export interface UserProfile {
    name: string;
    email: string;
    avatarUrl: string;
}

export interface SidebarProps {
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
}