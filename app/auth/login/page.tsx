"use client";

import React, { useState, useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import AuroraBackground from "../../../components/ui/AuroraBackground";
import GoogleAuthButton from "../../../components/ui/GoogleAuthButton";
import { login } from "../actions";
import { Mail, Lock, ArrowRight, Loader2, Eye, EyeOff } from "lucide-react";
import { createClient } from "../../../utils/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);
  
  const [state, formAction, isPending] = useActionState(login, null);

  // Handle successful login - only redirect if server redirect didn't work
  useEffect(() => {
    // Only check auth if we're still on the login page, login was successful, and no error
    // The server action should handle the redirect via redirect("/"), but this is a fallback
    // Also check if we've already checked auth to prevent multiple redirect attempts
    if (!isPending && !state?.error && !hasCheckedAuth && typeof window !== "undefined" && window.location.pathname === "/auth/login") {
      const checkAuthAndRedirect = async () => {
        try {
          setHasCheckedAuth(true); // Mark as checked to prevent multiple attempts
          const supabase = createClient();
          // Use getSession instead of getUser for client-side check
          const { data: { session }, error } = await supabase.auth.getSession();
          
          // Only redirect if we have a valid session and we're still on login page
          // This prevents redirect loops
          if (session?.user && !error && typeof window !== "undefined" && window.location.pathname === "/auth/login") {
            // Check if there's a redirect parameter
            const params = new URLSearchParams(window.location.search);
            const redirectTo = params.get("redirectedFrom") || "/";
            
            // Use replace to avoid adding to history and prevent loops
            router.replace(redirectTo);
            // Small delay before refresh to ensure navigation completes
            setTimeout(() => router.refresh(), 100);
          }
        } catch (err) {
          // Silently handle - might be redirect in progress, network issue, or cookie problem
          // Only log in development
          if (process.env.NODE_ENV === "development") {
            console.debug("Auth check failed (may be expected):", err);
          }
          setHasCheckedAuth(false); // Reset on error so we can try again if needed
        }
      };
      
      // Longer delay to allow server redirect to complete first
      // Server redirect should happen immediately, so this is only a fallback
      const timer = setTimeout(checkAuthAndRedirect, 1000);
      return () => clearTimeout(timer);
    }
  }, [state, isPending, router, hasCheckedAuth]);


  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        // Error will be shown via state if we add error handling for OAuth
        setIsGoogleLoading(false);
      }
      // If successful, OAuth will redirect automatically
    } catch (_e) {
      setIsGoogleLoading(false);
    }
  };

  return (
    <AuroraBackground showOrbs={true}>
      <div className="flex min-h-screen items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="aurora-glass-premium w-full max-w-md p-8 rounded-3xl shadow-2xl relative overflow-hidden"
        >
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-display font-bold text-white tracking-wide text-glow text-center mb-2">Welcome Back</h1>
            <p className="text-slate-400 text-sm text-center mb-8">Sign in to your account</p>
          </div>

          <form action={formAction} className="flex flex-col gap-5 w-full">
              {/* Email Input */}
              <div className="relative group w-full">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider ml-1 mb-1.5 block">
                  Email
                </label>
                <div className="relative">
                  <Mail
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-indigo-400 transition-colors pointer-events-none"
                  />
                  <input
                    name="email"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                    required
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="relative group w-full">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider ml-1 mb-1.5 block">
                  Password
                </label>
                <div className="relative">
                  <Lock
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-indigo-400 transition-colors pointer-events-none"
                  />
                  <input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl pl-12 pr-10 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors focus:outline-none"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

            <div className="flex justify-end w-full">
              <a
                href="/auth/forgot-password"
                onClick={(e) => {
                  e.preventDefault();
                  router.push("/auth/forgot-password");
                }}
                className="text-sm font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Forgot Password?
              </a>
            </div>

            {state?.error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 text-sm text-center">
                {state.error}
              </div>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:shadow-[0_0_30px_rgba(99,102,241,0.5)] transition-all transform active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Sign In <ArrowRight size={18} />
                </>
              )}
            </button>

            <div className="flex items-center gap-4 w-full my-2">
              <div className="flex-1 border-t border-white/10"></div>
              <span className="text-xs uppercase tracking-widest text-slate-500">Or continue with</span>
              <div className="flex-1 border-t border-white/10"></div>
            </div>

            <div className="aurora-glass-base w-full rounded-xl overflow-hidden hover:bg-white/5 transition-colors">
              <GoogleAuthButton
                className="w-full py-3 px-4 text-slate-200"
                onClick={handleGoogleSignIn}
                isLoading={isGoogleLoading}
                disabled={isPending}
                text="Continue with Google"
              />
            </div>

            <div className="text-center mt-8">
              <p className="text-sm text-slate-400">
                Don&apos;t have an account?{" "}
                <a
                  href="/auth/register"
                  onClick={(e) => {
                    e.preventDefault();
                    router.push("/auth/register");
                  }}
                  className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                >
                  Sign Up
                </a>
              </p>
            </div>
          </form>
        </motion.div>
      </div>
    </AuroraBackground>
  );
}