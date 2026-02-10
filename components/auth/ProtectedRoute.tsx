"use client";

import React, { useEffect } from "react";
import { useAuth } from "@/components/contexts/AuthContext";
import { useRouter } from "next/navigation";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Wait for auth to finish loading before checking
    if (!loading && !user) {
      const currentPath = window.location.pathname;
      // Don't redirect if we're already on an auth page
      if (!currentPath.startsWith("/auth/")) {
        router.push(`/auth/login?redirectedFrom=${encodeURIComponent(currentPath)}`);
      }
    }
  }, [user, loading, router]);

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0B0D12]">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  // If not authenticated, show nothing (redirect is handled in useEffect)
  if (!user) {
    return null;
  }

  return <>{children}</>;
};

export default ProtectedRoute;