"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import AuroraBackground from "../../../components/ui/AuroraBackground";
import GoogleAuthButton from "../../../components/ui/GoogleAuthButton";
import { signup } from "../actions";
import { Mail, Lock, ShieldCheck, Loader2, ArrowRight, Globe, Eye, EyeOff, ChevronDown, Check } from "lucide-react";
import { createClient } from "../../../utils/supabase/client";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "zh", label: "Chinese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "pt", label: "Portuguese" },
  { code: "ru", label: "Russian" },
  { code: "hi", label: "Hindi" },
];

export default function RegisterPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Language Dropdown State
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(LANGUAGES[0]);
  const languageRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (languageRef.current && !languageRef.current.contains(event.target as Node)) {
        setIsLanguageOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);


  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    formData.set("preferred_language", selectedLanguage.code);

    try {
      const result = await signup(null, formData);

      if (result?.error) {
        setError(result.error);
      } else if (result?.success) {
        const target = result.redirect || "/auth/verify-email";
        router.push(target);
      }
    } catch (_e) {
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setIsGoogleLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setError(error.message);
        setIsGoogleLoading(false);
      }
    } catch (_e) {
      setError("Failed to initiate Google sign-up");
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
            <h1 className="text-3xl font-display font-bold text-white tracking-wide text-glow text-center mb-2">Join Aether</h1>
            <p className="text-slate-400 text-sm text-center mb-8">Begin your journey into seamless communication</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5 w-full">
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

              {/* Custom Language Dropdown */}
              <div className="group relative w-full" ref={languageRef}>
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider ml-1 mb-1.5 block">
                  Preferred Language
                </label>
                
                {/* HIDDEN INPUT FOR FORM DATA */}
                <input type="hidden" name="preferred_language" value={selectedLanguage.code} />

                {/* TRIGGER */}
                <div 
                  onClick={() => setIsLanguageOpen(!isLanguageOpen)}
                  className={`
                    relative w-full bg-slate-900/50 border rounded-xl py-3 pl-12 pr-4 text-white cursor-pointer transition-all flex items-center
                    ${isLanguageOpen ? 'border-indigo-500/50 ring-1 ring-indigo-500/50' : 'border-white/10 hover:border-white/20'}
                  `}
                >
                  <Globe
                    className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors pointer-events-none ${isLanguageOpen ? 'text-indigo-400' : 'text-slate-400'}`}
                  />
                  <span className="text-sm">{selectedLanguage.label}</span>
                  <ChevronDown 
                    size={16} 
                    className={`absolute right-4 top-1/2 -translate-y-1/2 text-white/40 transition-transform duration-300 pointer-events-none ${isLanguageOpen ? 'rotate-180' : ''}`} 
                  />
                </div>

                {/* DROPDOWN MENU */}
                {isLanguageOpen && (
                  <div className="absolute top-full left-0 right-0 mt-2 p-1 bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] z-50 max-h-60 overflow-y-auto scrollbar-thin">
                    {LANGUAGES.map((lang) => (
                      <div
                        key={lang.code}
                        onClick={() => {
                          setSelectedLanguage(lang);
                          setIsLanguageOpen(false);
                        }}
                        className={`
                          px-4 py-2.5 rounded-lg text-sm cursor-pointer transition-all flex items-center justify-between group
                          ${selectedLanguage.code === lang.code 
                              ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/20' 
                              : 'text-white/70 hover:bg-white/10 hover:text-white border border-transparent'}
                        `}
                      >
                        {lang.label}
                        {selectedLanguage.code === lang.code && <Check size={14} className="text-indigo-400" />}
                      </div>
                    ))}
                  </div>
                )}
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
                    placeholder="Min 8 characters"
                    autoComplete="new-password"
                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl pl-12 pr-10 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                    required
                    minLength={8}
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
              
              {/* Confirm Password Input */}
              <div className="relative group w-full">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider ml-1 mb-1.5 block">
                  Confirm Password
                </label>
                <div className="relative">
                  <ShieldCheck
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-indigo-400 transition-colors pointer-events-none"
                  />
                  <input
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm password"
                    autoComplete="new-password"
                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl pl-12 pr-10 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                    required
                    minLength={8}
                  />
                   <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors focus:outline-none"
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 text-sm text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:shadow-[0_0_30px_rgba(99,102,241,0.5)] transition-all transform active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Create Account <ArrowRight size={18} />
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
                onClick={handleGoogleSignUp}
                isLoading={isGoogleLoading}
                disabled={isLoading}
                text="Continue with Google"
              />
            </div>

            <div className="text-center mt-8">
              <p className="text-sm text-slate-400">
                Already have an account?{" "}
                <a
                  href="/auth/login"
                  onClick={(e) => {
                    e.preventDefault();
                    router.push("/auth/login");
                  }}
                  className="font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  Sign In
                </a>
              </p>
            </div>
          </form>
        </motion.div>
      </div>
    </AuroraBackground>
  );
}