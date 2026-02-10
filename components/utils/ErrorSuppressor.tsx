"use client";

import { useEffect } from "react";

/**
 * Client component to suppress specific console errors in production
 * This is moved from inline script to avoid CSP violations
 */
export function ErrorSuppressor() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const originalError = console.error;
    console.error = function (...args: unknown[]) {
      const errorMsg = String(args.join(" "));
      // Suppress specific MutationObserver error from third-party libraries
      if (
        errorMsg.includes("Failed to execute 'observe' on 'MutationObserver'") &&
        errorMsg.includes("parameter 1 is not of type 'Node'")
      ) {
        return; // Silently ignore this specific error
      }
      originalError.apply(console, args);
    };

    return () => {
      console.error = originalError;
    };
  }, []);

  return null;
}
