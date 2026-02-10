import React from "react";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import AppShell from "../components/layout/AppShell";
import { ThemeProvider } from "../components/contexts/ThemeContext";
import { NotificationProvider } from "../components/contexts/NotificationContext";
import { AuthProvider } from '@/components/contexts/AuthContext';
import { VoiceChannelProvider } from "../components/contexts/VoiceChannelContext";
import { ErrorSuppressor } from "../components/utils/ErrorSuppressor";
import { ErrorBoundary } from "../components/ErrorBoundary";
import GlobalSpaceInviteHandler from "../components/spaces/GlobalSpaceInviteHandler";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata = {
  title: "Aether | The Borderless Workspace",
  description: "Real-time translation chat application.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <head>
        {/* Preconnect to Google Fonts for faster DNS resolution */}
        {/* Note: next/font/google handles font loading optimization, but preconnect helps with DNS */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

        <link rel="icon" href="/logo/aether-favicon/favicon.ico" />
      </head>
      <body
        className={`${inter.variable} ${spaceGrotesk.variable} antialiased bg-[#0B0D12] selection:bg-indigo-500/30`}
      >
        <ErrorSuppressor />
        <ErrorBoundary>
          <ThemeProvider>
            <NotificationProvider>
              <AuthProvider>
                <VoiceChannelProvider>
                <GlobalSpaceInviteHandler />
                <AppShell>{children}</AppShell>
                </VoiceChannelProvider>
              </AuthProvider>
            </NotificationProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
