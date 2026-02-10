"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { DownloadCloud, Loader2 } from "lucide-react";
import type { DownloadInfo } from "../actions/download";

interface DownloadPageClientProps {
  downloadInfo: DownloadInfo;
}

// Detect user's operating system
function detectOS(): "windows" | "macos" | "linux" | null {
  if (typeof window === "undefined") return null;
  
  const userAgent = window.navigator.userAgent.toLowerCase();
  const platform = window.navigator.platform.toLowerCase();
  
  if (userAgent.includes("win")) return "windows";
  if (userAgent.includes("mac") || platform.includes("mac")) return "macos";
  if (userAgent.includes("linux") || platform.includes("linux")) return "linux";
  
  return null;
}

export default function DownloadPageClient({ downloadInfo }: DownloadPageClientProps) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [detectedOS, setDetectedOS] = useState<"windows" | "macos" | "linux" | null>(null);
  
  useEffect(() => {
    setDetectedOS(detectOS());
  }, []);

  const handleDownload = (platform: string, url: string) => {
    setDownloading(platform);
    // The download will be handled by the browser
    // Reset state after a delay to allow download to start
    setTimeout(() => {
      setDownloading(null);
    }, 2000);
  };

  const windowsDownload = downloadInfo.downloads.find((d) => d.platform === "windows");
  const macosDownload = downloadInfo.downloads.find((d) => d.platform === "macos");
  const linuxDownload = downloadInfo.downloads.find((d) => d.platform === "linux");

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden relative bg-transparent">
      {/* Content Area - Scrollable */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="w-full max-w-5xl mx-auto px-4 py-8 md:px-6 flex flex-col items-center">
          <h2 className="text-4xl md:text-5xl font-bold font-display text-white mb-4 tracking-tight">
            Download Aether
          </h2>
          <p className="text-lg text-slate-400 max-w-2xl text-center mb-2">
            Get the native desktop client for the best experience. Offline access, native notifications, and enhanced performance.
          </p>
          {downloadInfo.version && (
            <p className="text-sm text-slate-500 mb-12 font-mono">
              Version {downloadInfo.version}
            </p>
          )}

          {/* Auto-detect and highlight user's OS */}
          {detectedOS && (
            <div className="mb-6 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
              <p className="text-sm text-indigo-400 text-center">
                💻 We detected you're on <strong className="text-white">{detectedOS === "windows" ? "Windows" : detectedOS === "macos" ? "macOS" : "Linux"}</strong>. 
                Click the download button below for your platform.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
            {/* Windows */}
            <div className={`aurora-glass-premium flex flex-col items-center p-8 rounded-2xl ${detectedOS === "windows" ? "ring-2 ring-indigo-500/50" : ""}`}>
              <h3 className="text-2xl font-bold font-display text-white mb-2">Windows</h3>
              <p className="text-xs font-mono text-slate-500 mb-2 uppercase tracking-wider">Windows 10 & 11</p>
              {windowsDownload?.size && (
                <p className="text-xs text-slate-500 mb-4">{windowsDownload.size}</p>
              )}
              {windowsDownload ? (
                <a
                  href={windowsDownload.url}
                  onClick={() => handleDownload("windows", windowsDownload.url)}
                  className="w-full py-3 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-semibold shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {downloading === "windows" ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Downloading...</span>
                    </>
                  ) : (
                    <>
                      <DownloadCloud className="w-4 h-4" />
                      <span>Download .exe</span>
                    </>
                  )}
                </a>
              ) : (
                <button
                  disabled
                  className="w-full py-3 rounded-xl bg-slate-700/50 text-slate-500 font-semibold cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <span>Coming Soon</span>
                </button>
              )}
            </div>

            {/* macOS */}
            <div className={`aurora-glass-premium flex flex-col items-center p-8 rounded-2xl ${detectedOS === "macos" ? "ring-2 ring-indigo-500/50" : ""}`}>
              <h3 className="text-2xl font-bold font-display text-white mb-2">macOS</h3>
              <p className="text-xs font-mono text-slate-500 mb-2 uppercase tracking-wider">Intel & Apple Silicon</p>
              {macosDownload?.size && (
                <p className="text-xs text-slate-500 mb-4">{macosDownload.size}</p>
              )}
              {macosDownload ? (
                <a
                  href={macosDownload.url}
                  onClick={() => handleDownload("macos", macosDownload.url)}
                  className="w-full py-3 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-semibold shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {downloading === "macos" ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Downloading...</span>
                    </>
                  ) : (
                    <>
                      <DownloadCloud className="w-4 h-4" />
                      <span>Download .dmg</span>
                    </>
                  )}
                </a>
              ) : (
                <button
                  disabled
                  className="w-full py-3 rounded-xl bg-slate-700/50 text-slate-500 font-semibold cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <span>Coming Soon</span>
                </button>
              )}
            </div>

            {/* Linux */}
            <div className={`aurora-glass-premium flex flex-col items-center p-8 rounded-2xl ${detectedOS === "linux" ? "ring-2 ring-indigo-500/50" : ""}`}>
              <h3 className="text-2xl font-bold font-display text-white mb-2">Linux</h3>
              <p className="text-xs font-mono text-slate-500 mb-2 uppercase tracking-wider">AppImage</p>
              {linuxDownload?.size && (
                <p className="text-xs text-slate-500 mb-4">{linuxDownload.size}</p>
              )}
              {linuxDownload ? (
                <a
                  href={linuxDownload.url}
                  onClick={() => handleDownload("linux", linuxDownload.url)}
                  className="w-full py-3 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-semibold shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {downloading === "linux" ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Downloading...</span>
                    </>
                  ) : (
                    <>
                      <DownloadCloud className="w-4 h-4" />
                      <span>Download .AppImage</span>
                    </>
                  )}
                </a>
              ) : (
                <button
                  disabled
                  className="w-full py-3 rounded-xl bg-slate-700/50 text-slate-500 font-semibold cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <span>Coming Soon</span>
                </button>
              )}
            </div>
          </div>

          <Link href="/" className="text-slate-500 hover:text-indigo-400 text-sm transition-colors mt-12">
            &larr; Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
