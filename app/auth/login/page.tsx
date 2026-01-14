'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import AuroraBackground from '../../../components/ui/AuroraBackground';
import GoogleAuthButton from '../../../components/ui/GoogleAuthButton';
import { login } from '../actions';
import { Mail, Lock, ArrowRight, Loader2, Eye, EyeOff } from 'lucide-react';
import { createClient } from '../../../utils/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    try {
        const result = await login(null, formData);
        
        if (result?.error) {
            setError(result.error);
        } else if (result?.success) {
             // Use Next.js router for proper navigation
             const target = result.redirect || '/';
             router.push(target);
        }
    } catch (e) {
        console.error(e);
        setError('An unexpected error occurred');
    } finally {
        setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setError(null);
    
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setError(error.message);
        setIsGoogleLoading(false);
      }
      // User will be redirected to Google, no need to set loading to false
    } catch (e) {
      console.error(e);
      setError('Failed to initiate Google sign-in');
      setIsGoogleLoading(false);
    }
  };

  return (
    <AuroraBackground showOrbs={true}>
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="glass-strong w-full max-w-md p-8 rounded-3xl border-t-2 border-l border-r border-white/20 relative overflow-hidden">
          
          {/* Header */}
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-white mb-2">Welcome Back</h1>
            <p className="text-white/50">Enter your credentials to access Translatr.</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="group">
                <label className="block text-xs font-medium text-white/60 mb-1.5 ml-1 uppercase tracking-wider">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-aurora-indigo transition-colors" size={20} />
                  <input
                    name="email"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="off"
                    data-lpignore="true"
                    data-form-type="other"
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-aurora-indigo/50 focus:border-transparent transition-all"
                    required
                  />
                </div>
              </div>

              <div className="group">
                <label className="block text-xs font-medium text-white/60 mb-1.5 ml-1 uppercase tracking-wider">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-aurora-purple transition-colors" size={20} />
                  <input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    autoComplete="off"
                    data-lpignore="true"
                    data-form-type="other"
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-10 text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-aurora-purple/50 focus:border-transparent transition-all"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors focus:outline-none"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Forgot Password Link */}
            <div className="text-right">
              <a 
                href="/auth/forgot-password" 
                onClick={(e) => {
                  e.preventDefault();
                  router.push('/auth/forgot-password');
                }}
                className="text-sm text-aurora-indigo hover:text-aurora-pink transition-colors font-medium cursor-pointer"
              >
                Forgot password?
              </a>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-200 text-sm text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-gradient-to-r from-aurora-indigo to-aurora-purple hover:from-aurora-indigo/90 hover:to-aurora-purple/90 text-white font-semibold rounded-xl shadow-lg shadow-aurora-indigo/25 transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Sign In <ArrowRight size={18} />
                </>
              )}
            </button>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="backdrop-blur-xl px-2 text-white/40">Or continue with</span>
              </div>
            </div>

            {/* Google Sign-In Button */}
            <GoogleAuthButton
              onClick={handleGoogleSignIn}
              isLoading={isGoogleLoading}
              disabled={isLoading}
              text="Continue with Google"
            />

            <div className="text-center mt-6">
              <p className="text-sm text-white/50">
                Don't have an account?{' '}
                <a 
                    href="/auth/register" 
                    onClick={(e) => {
                      e.preventDefault();
                      router.push('/auth/register');
                    }}
                    className="text-aurora-indigo hover:text-aurora-pink transition-colors font-medium cursor-pointer"
                >
                  Sign Up
                </a>
              </p>
            </div>
          </form>
        </div>
      </div>
    </AuroraBackground>
  );
}