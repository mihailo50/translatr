"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { createClient } from "@/utils/supabase/client";
import { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";

// Based on supabase_schema.sql
export interface Profile {
  id: string;
  display_name: string | null;
  email: string | null;
  bio: string | null;
  preferred_language: string;
  theme: 'aurora' | 'midnight';
  status: 'online' | 'offline' | 'away' | 'invisible';
  plan: 'free' | 'pro';
  subscription_end_date: string | null;
  created_at: string;
  updated_at: string;
  avatar_url: string | null;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    
    const fetchProfile = async (user: User) => {
      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      if (error) {
        console.error("Error fetching profile:", error);
        setProfile(null);
      } else {
        setProfile(profileData as Profile);
      }
    };

    const handleAuthChange = async (session: { user: User } | null) => {
      const authUser = session?.user ?? null;
      setUser(authUser);
      if (authUser) {
        await fetchProfile(authUser);
      } else {
        setProfile(null);
      }
      setLoading(false);
    }

    const checkUser = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();
        
        if (error) {
          await handleAuthChange(null);
          return;
        }
        
        await handleAuthChange(session);
      } catch {
        await handleAuthChange(null);
      }
    };

    const {
      data: { subscription: authListener },
    } = supabase.auth.onAuthStateChange((event, session) => {
      handleAuthChange(session);

      // Only handle redirects for OAuth flows (not password login - server handles that)
      if (event === "SIGNED_IN" && window.location.pathname === "/auth/callback") {
        const redirectedFrom = new URLSearchParams(window.location.search).get("redirectedFrom");
        if (redirectedFrom) {
          router.push(redirectedFrom);
        } else {
          router.push("/");
        }
      } else if (event === "SIGNED_OUT") {
        // Only redirect if we're not already on an auth page to prevent loops
        const currentPath = window.location.pathname;
        if (!currentPath.startsWith("/auth/")) {
          router.push("/auth/login");
        }
      }
    });

    checkUser();

    return () => {
      authListener.unsubscribe();
    };
  }, [router]);

  const loginWithGoogle = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
  };
  
  const value = {
    user,
    profile,
    loading,
    loginWithGoogle,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
