"use client";

import React, { useState, useEffect } from "react";
import { translateTextAction } from "../../actions/translate";
import { getProfile } from "../../actions/settings";
import { Copy, Check, Languages, Sparkles, ArrowRightLeft, RotateCcw } from "lucide-react";
import { toast } from "sonner";

// Reusing language list for consistency
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
  { code: "it", label: "Italian" },
  { code: "nl", label: "Dutch" },
  { code: "pl", label: "Polish" },
];

export default function TranslatePage() {
  // State
  const [inputText, setInputText] = useState("");
  const [debouncedText, setDebouncedText] = useState("");
  const [outputText, setOutputText] = useState("");

  const [sourceLang, setSourceLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("en");
  const [detectedLang, setDetectedLang] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // Load User Preference
  useEffect(() => {
    getProfile().then((data) => {
      if (data?.profile?.preferred_language) {
        setTargetLang(data.profile.preferred_language);
      }
    });
  }, []);

  // Debounce Logic
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedText(inputText);
    }, 500); // 500ms delay

    return () => clearTimeout(timer);
  }, [inputText]);

  // Trigger Translation
  useEffect(() => {
    const performTranslation = async () => {
      if (!debouncedText.trim()) {
        setOutputText("");
        setDetectedLang(null);
        return;
      }

      setIsLoading(true);
      const result = await translateTextAction(debouncedText, targetLang);

      if (result.error) {
        toast.error(result.error);
      } else {
        setOutputText(result.translatedText || "");
        setDetectedLang(result.detectedSourceLang || null);
      }
      setIsLoading(false);
    };

    performTranslation();
  }, [debouncedText, targetLang]); // Trigger on text change or target lang change

  // Copy to Clipboard
  const handleCopy = () => {
    if (!outputText) return;
    navigator.clipboard.writeText(outputText);
    setIsCopied(true);
    toast.success("Translation copied to clipboard");
    setTimeout(() => setIsCopied(false), 2000);
  };

  const swapLanguages = () => {
    if (sourceLang === "auto" && detectedLang) {
      setSourceLang(targetLang);
      setTargetLang(detectedLang);
      setInputText(outputText);
    } else if (sourceLang !== "auto") {
      setSourceLang(targetLang);
      setTargetLang(sourceLang);
      setInputText(outputText);
    }
  };

  const getLanguageLabel = (code: string) => {
    if (code === "auto") return "Detect Language";
    return LANGUAGES.find((l) => l.code === code)?.label || code;
  };

  return (
    <div className="h-full w-full flex flex-col p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1 flex items-center gap-2">
            <Sparkles className="text-aurora-purple" size={24} />
            Quick Translate
          </h1>
          <p className="text-white/50">Instant translation powered by AI.</p>
        </div>
      </div>

      {/* Translation Container */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 min-h-[500px]">
        {/* --- INPUT AREA --- */}
        <div className="glass-strong rounded-3xl p-6 flex flex-col gap-4 border border-white/10 relative group focus-within:border-aurora-indigo/50 transition-colors">
          {/* Controls */}
          <div className="flex items-center justify-between border-b border-white/5 pb-4">
            <div className="relative group/dropdown">
              <select
                value={sourceLang}
                onChange={(e) => setSourceLang(e.target.value)}
                className="appearance-none bg-white/5 hover:bg-white/10 text-white pl-4 pr-10 py-2 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-aurora-indigo/50 transition-all cursor-pointer border border-white/5"
              >
                <option value="auto" className="bg-slate-900">
                  Detect Language
                </option>
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code} className="bg-slate-900">
                    {l.label}
                  </option>
                ))}
              </select>
              <Languages
                size={16}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none"
              />
            </div>

            {detectedLang && sourceLang === "auto" && (
              <span className="text-xs text-aurora-indigo font-semibold px-3 py-1 bg-aurora-indigo/10 rounded-full animate-in fade-in">
                Detected: {getLanguageLabel(detectedLang)}
              </span>
            )}
          </div>

          {/* Text Area */}
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Enter text to translate..."
            className="flex-1 w-full bg-transparent border-none text-white text-lg md:text-xl placeholder-white/20 resize-none focus:ring-0 leading-relaxed scrollbar-thin"
            spellCheck="false"
            autoFocus
          />

          {/* Footer Tools */}
          <div className="flex justify-between items-center text-white/30 pt-4 border-t border-white/5">
            <span className="text-xs">{inputText.length} chars</span>
            {inputText && (
              <button
                onClick={() => {
                  setInputText("");
                  setOutputText("");
                }}
                className="p-2 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                title="Clear text"
              >
                <RotateCcw size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Middle Switcher (Desktop) / Separator (Mobile) */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 hidden md:block">
          <button
            onClick={swapLanguages}
            disabled={!outputText}
            className="p-3 rounded-full bg-slate-900 border border-white/20 text-white/70 hover:text-aurora-indigo hover:border-aurora-indigo shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowRightLeft size={20} />
          </button>
        </div>

        {/* --- OUTPUT AREA --- */}
        <div className="glass rounded-3xl p-6 flex flex-col gap-4 border border-white/5 relative overflow-hidden bg-white/[0.02]">
          {/* Background Loading Effect */}
          {isLoading && (
            <div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer z-0 pointer-events-none"
              style={{ backgroundSize: "200% 100%" }}
            />
          )}

          {/* Controls */}
          <div className="flex items-center justify-between border-b border-white/5 pb-4 relative z-10">
            <div className="relative">
              <select
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
                className="appearance-none bg-aurora-indigo/10 hover:bg-aurora-indigo/20 text-aurora-indigo pl-4 pr-10 py-2 rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-aurora-indigo/50 transition-all cursor-pointer border border-aurora-indigo/20"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code} className="bg-slate-900 text-white">
                    {l.label}
                  </option>
                ))}
              </select>
              <Languages
                size={16}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-aurora-indigo/60 pointer-events-none"
              />
            </div>
          </div>

          {/* Result Area */}
          <div className="flex-1 relative z-10">
            {isLoading ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-4 bg-white/5 rounded w-3/4"></div>
                <div className="h-4 bg-white/5 rounded w-1/2"></div>
                <div className="h-4 bg-white/5 rounded w-5/6"></div>
              </div>
            ) : (
              <div
                className={`text-lg md:text-xl leading-relaxed transition-colors duration-300 ${outputText ? "text-white" : "text-white/10"}`}
              >
                {outputText || "Translation will appear here..."}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end pt-4 border-t border-white/5 relative z-10">
            <button
              onClick={handleCopy}
              disabled={!outputText}
              className={`
                            flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all
                            ${
                              isCopied
                                ? "bg-green-500/20 text-green-400"
                                : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                            }
                        `}
            >
              {isCopied ? <Check size={18} /> : <Copy size={18} />}
              {isCopied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
        }
        .animate-shimmer {
            animation: shimmer 1.5s infinite linear;
        }
      `,
        }}
      />
    </div>
  );
}
