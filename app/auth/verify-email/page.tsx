"use client";

import React from "react";
import { useRouter } from "next/navigation";
import AuroraBackground from "../../../components/ui/AuroraBackground";
import { MailCheck } from "lucide-react";

export default function VerifyEmailPage() {
  const router = useRouter();

  return (
    <AuroraBackground showOrbs={true}>
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="glass-strong w-full max-w-md p-10 rounded-3xl text-center border-t border-white/20">
          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(34,197,94,0.3)]">
            <MailCheck size={40} className="text-green-400" />
          </div>

          <h1 className="text-2xl font-bold text-white mb-3">Check your inbox</h1>

          <p className="text-white/60 leading-relaxed mb-8">
            We&apos;ve sent a verification link to your email address. Please click the link to
            verify your account and access Translatr.
          </p>

          <a
            href="/auth/login"
            onClick={(e) => {
              e.preventDefault();
              router.push("/auth/login");
            }}
            className="inline-flex items-center text-sm font-semibold text-aurora-indigo hover:text-white transition-colors cursor-pointer"
          >
            ← Back to Login
          </a>
        </div>
      </div>
    </AuroraBackground>
  );
}
