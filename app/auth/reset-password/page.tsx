"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import AuroraBackground from "../../../components/ui/AuroraBackground";
import { Lock, ArrowRight, Loader2, Eye, EyeOff, CheckCircle } from "lucide-react";
import { createClient } from "../../../utils/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    // Validate
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      setIsLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setIsLoading(false);
      return;
    }

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) {
        setError(updateError.message);
      } else {
        setSuccess(true);
        // Redirect to login after 3 seconds
        setTimeout(() => {
          router.push("/auth/login");
        }, 3000);
      }
    } catch (_e) {
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuroraBackground showOrbs={true}>
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="glass-strong w-full max-w-md p-8 rounded-3xl border-t-2 border-l border-r border-white/20 relative overflow-hidden">
          {!success ? (
            <>
              {/* Header */}
              <div className="mb-8 text-center">
                <h1 className="text-3xl font-bold text-white mb-2">Set New Password</h1>
                <p className="text-white/50">Enter your new password below.</p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-4">
                  <div className="group">
                    <label className="block text-xs font-medium text-white/60 mb-1.5 ml-1 uppercase tracking-wider">
                      New Password
                    </label>
                    <div className="relative">
                      <Lock
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-aurora-purple transition-colors"
                        size={20}
                      />
                      <input
                        name="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        autoComplete="new-password"
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

                  <div className="group">
                    <label className="block text-xs font-medium text-white/60 mb-1.5 ml-1 uppercase tracking-wider">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <Lock
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-aurora-pink transition-colors"
                        size={20}
                      />
                      <input
                        name="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-10 text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-aurora-pink/50 focus:border-transparent transition-all"
                        required
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
                  className="w-full py-3 px-4 bg-gradient-to-r from-aurora-indigo to-aurora-purple hover:from-aurora-indigo/90 hover:to-aurora-purple/90 text-white font-semibold rounded-xl shadow-lg shadow-aurora-indigo/25 transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Reset Password <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </form>
            </>
          ) : (
            <>
              {/* Success State */}
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-gradient-to-br from-green-400/20 to-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle className="w-8 h-8 text-green-400" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-3">Password Reset Successful!</h2>
                <p className="text-white/70 mb-4">Your password has been successfully reset.</p>
                <p className="text-sm text-white/50">Redirecting to login...</p>
              </div>
            </>
          )}
        </div>
      </div>
    </AuroraBackground>
  );
}
