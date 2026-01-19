'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import AuroraBackground from '../../../components/ui/AuroraBackground';
import GoogleAuthButton from '../../../components/ui/GoogleAuthButton';
import { signup } from '../actions';
import { Mail, Lock, ShieldCheck, Loader2, ArrowRight, Globe, Eye, EyeOff } from 'lucide-react';
import { createClient } from '../../../utils/supabase/client';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ru', label: 'Russian' },
  { code: 'hi', label: 'Hindi' },
];

export default function RegisterPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Aggressive autofill fix using JavaScript
  useEffect(() => {
    const forceAutofillStyles = () => {
      if (!formRef.current || typeof document === 'undefined') return;
      
      const inputs = formRef.current.querySelectorAll('input[type="email"], input[type="password"], input[type="text"]');
      inputs.forEach((input) => {
        const htmlInput = input as HTMLInputElement;
        
        // Always apply styles to inputs that could be autofilled
        // This ensures autofilled inputs get the dark theme matching login page
        // bg-white/5 = rgba(255, 255, 255, 0.05)
        htmlInput.style.setProperty('background-color', 'rgba(255, 255, 255, 0.05)', 'important');
        htmlInput.style.setProperty('-webkit-box-shadow', '0 0 0 1000px rgba(255, 255, 255, 0.05) inset', 'important');
        htmlInput.style.setProperty('box-shadow', '0 0 0 1000px rgba(255, 255, 255, 0.05) inset', 'important');
        htmlInput.style.setProperty('-webkit-text-fill-color', 'white', 'important');
        htmlInput.style.setProperty('color', 'white', 'important');
        htmlInput.style.setProperty('caret-color', 'white', 'important');
        htmlInput.style.setProperty('transition', 'background-color 500000s ease-in-out 0s', 'important');
      });
    };

    // Run immediately and on various events
    forceAutofillStyles();
    
    // Watch for autofill events
    const observer = new MutationObserver(() => {
      forceAutofillStyles();
    });

    if (formRef.current) {
      observer.observe(formRef.current, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style'],
      });

      // Add event listeners to all inputs
      const inputs = formRef.current.querySelectorAll('input');
      inputs.forEach((input) => {
        input.addEventListener('animationstart', forceAutofillStyles);
        input.addEventListener('focus', forceAutofillStyles);
        input.addEventListener('blur', forceAutofillStyles);
        input.addEventListener('input', forceAutofillStyles);
        input.addEventListener('change', forceAutofillStyles);
      });
    }

    // Periodic check as fallback
    const interval = setInterval(forceAutofillStyles, 100);

    return () => {
      observer.disconnect();
      clearInterval(interval);
      if (formRef.current) {
        const inputs = formRef.current.querySelectorAll('input');
        inputs.forEach((input) => {
          input.removeEventListener('animationstart', forceAutofillStyles);
          input.removeEventListener('focus', forceAutofillStyles);
          input.removeEventListener('blur', forceAutofillStyles);
          input.removeEventListener('input', forceAutofillStyles);
          input.removeEventListener('change', forceAutofillStyles);
        });
      }
    };
  }, []);


  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    try {
        const result = await signup(null, formData);
        
        if (result?.error) {
            setError(result.error);
        } else if (result?.success) {
             // Use Next.js router for proper navigation
             const target = result.redirect || '/auth/verify-email';
             router.push(target);
        }
    } catch (e) {
        console.error(e);
        setError('An unexpected error occurred');
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
      setError('Failed to initiate Google sign-up');
      setIsGoogleLoading(false);
    }
  };

  return (
    <AuroraBackground showOrbs={true}>
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="glass-strong w-full max-w-md p-8 rounded-3xl border-t-2 border-l border-r border-white/20 relative overflow-hidden">
          
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-white mb-2">Join Translatr</h1>
            <p className="text-white/50">Start your real-time translation journey.</p>
          </div>

          <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
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
                <label className="block text-xs font-medium text-white/60 mb-1.5 ml-1 uppercase tracking-wider">Preferred Language</label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-aurora-indigo transition-colors" size={20} />
                  <select
                    name="preferred_language"
                    className="w-full appearance-none bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-aurora-indigo/50 focus:border-transparent transition-all cursor-pointer"
                    defaultValue="en"
                  >
                    {LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code} className="bg-slate-900">
                        {lang.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="group">
                <label className="block text-xs font-medium text-white/60 mb-1.5 ml-1 uppercase tracking-wider">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-aurora-purple transition-colors" size={20} />
                  <input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Min 8 characters"
                    autoComplete="off"
                    data-lpignore="true"
                    data-form-type="other"
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-10 text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-aurora-purple/50 focus:border-transparent transition-all"
                    required
                    minLength={8}
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

              <div className="group">
                <label className="block text-xs font-medium text-white/60 mb-1.5 ml-1 uppercase tracking-wider">Confirm Password</label>
                <div className="relative">
                  <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-aurora-pink transition-colors" size={20} />
                  <input
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm password"
                    autoComplete="off"
                    data-lpignore="true"
                    data-form-type="other"
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-10 text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-aurora-pink/50 focus:border-transparent transition-all"
                    required
                    minLength={8}
                  />
                   <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors focus:outline-none"
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-200 text-sm text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-gradient-to-r from-aurora-indigo to-aurora-pink hover:from-aurora-indigo/90 hover:to-aurora-pink/90 text-white font-semibold rounded-xl shadow-lg shadow-aurora-indigo/25 transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Create Account <ArrowRight size={18} />
                </>
              )}
            </button>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="">Or continue with</span>
              </div>
            </div>

            {/* Google Sign-Up Button */}
            <GoogleAuthButton
              onClick={handleGoogleSignUp}
              isLoading={isGoogleLoading}
              disabled={isLoading}
              text="Continue with Google"
            />

            <div className="text-center mt-6">
              <p className="text-sm text-white/50">
                Already have an account?{' '}
                <a 
                    href="/auth/login" 
                    onClick={(e) => {
                      e.preventDefault();
                      router.push('/auth/login');
                    }}
                    className="text-aurora-indigo hover:text-aurora-pink transition-colors font-medium cursor-pointer"
                >
                  Sign In
                </a>
              </p>
            </div>
          </form>
        </div>
      </div>
    </AuroraBackground>
  );
}