'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import AuroraBackground from '../../../components/ui/AuroraBackground';
import { resetPassword } from '../actions';
import { Mail, ArrowRight, Loader2, ArrowLeft, CheckCircle } from 'lucide-react';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    try {
        const result = await resetPassword(null, formData);
        
        if (result?.error) {
            setError(result.error);
        } else if (result?.success) {
            setSuccess(true);
        }
    } catch (e) {
        console.error(e);
        setError('An unexpected error occurred');
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <AuroraBackground showOrbs={true}>
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="glass-strong w-full max-w-md p-8 rounded-3xl border-t-2 border-l border-r border-white/20 relative overflow-hidden">
          
          {/* Back Button */}
          <button
            onClick={() => router.push('/auth/login')}
            className="absolute top-6 left-6 text-white/60 hover:text-white transition-colors"
          >
            <ArrowLeft size={20} />
          </button>

          {!success ? (
            <>
              {/* Header */}
              <div className="mb-8 text-center">
                <h1 className="text-3xl font-bold text-white mb-2">Reset Password</h1>
                <p className="text-white/50">Enter your email and we'll send you a reset link.</p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="group">
                  <label className="block text-xs font-medium text-white/60 mb-1.5 ml-1 uppercase tracking-wider">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-aurora-indigo transition-colors" size={20} />
                    <input
                      name="email"
                      type="email"
                      placeholder="you@example.com"
                      autoComplete="email"
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-aurora-indigo/50 focus:border-transparent transition-all"
                      required
                    />
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
                      Send Reset Link <ArrowRight size={18} />
                    </>
                  )}
                </button>

                <div className="text-center mt-6">
                  <p className="text-sm text-white/50">
                    Remember your password?{' '}
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
            </>
          ) : (
            <>
              {/* Success State */}
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-gradient-to-br from-green-400/20 to-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle className="w-8 h-8 text-green-400" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-3">Check Your Email</h2>
                <p className="text-white/70 mb-8">
                  We've sent a password reset link to your email address. Please check your inbox and click the link to reset your password.
                </p>
                <button
                  onClick={() => router.push('/auth/login')}
                  className="w-full py-3 px-4 bg-gradient-to-r from-aurora-indigo to-aurora-purple hover:from-aurora-indigo/90 hover:to-aurora-purple/90 text-white font-semibold rounded-xl shadow-lg shadow-aurora-indigo/25 transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <ArrowLeft size={18} /> Back to Login
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </AuroraBackground>
  );
}
