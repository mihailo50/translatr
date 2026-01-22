"use client";

import React from "react";
import { useRouter } from "next/navigation";
import AuroraBackground from "../../../components/ui/AuroraBackground";
import { AlertTriangle, ArrowLeft } from "lucide-react";

export default function AuthErrorPage() {
  const router = useRouter();

  return (
    <AuroraBackground showOrbs={true}>
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="glass-strong w-full max-w-md p-10 rounded-3xl text-center border-t border-red-500/20">
          <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(239,68,68,0.3)]">
            <AlertTriangle size={40} className="text-red-400" />
          </div>

          <h1 className="text-2xl font-bold text-white mb-3">Authentication Error</h1>

          <p className="text-white/60 leading-relaxed mb-8">
            There was a problem signing you in. The verification link may have expired or is
            invalid.
          </p>

          <a
            href="/auth/login"
            onClick={(e) => {
              e.preventDefault();
              router.push("/auth/login");
            }}
            className="inline-flex items-center gap-2 text-sm font-semibold text-white bg-white/10 hover:bg-white/20 px-6 py-3 rounded-xl transition-all"
          >
            <ArrowLeft size={16} /> Back to Login
          </a>
        </div>
      </div>
    </AuroraBackground>
  );
}
