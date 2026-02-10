"use client";

// Client-side encryption utilities using Web Crypto API
// This file must only be imported in client components

const ALGORITHM = { name: "AES-GCM", length: 256 };

// Track if encryption is available
let encryptionAvailable: boolean | null = null;
let encryptionWarningShown = false;

// Check if encryption is available (requires HTTPS/secure context)
function isEncryptionAvailable(): boolean {
  if (encryptionAvailable !== null) {
    return encryptionAvailable;
  }

  if (typeof window === "undefined") {
    encryptionAvailable = false;
    return false;
  }

  const crypto =
    window.crypto ||
    (globalThis as { crypto?: Crypto } | undefined)?.crypto ||
    (self as { crypto?: Crypto } | undefined)?.crypto;

  encryptionAvailable = !!(crypto && crypto.subtle);
  
  // Show warning once if encryption is not available
  if (!encryptionAvailable && !encryptionWarningShown) {
    encryptionWarningShown = true;
    // Only show warning in development or if encryption is critical
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "⚠️ Encryption is disabled. Web Crypto API requires HTTPS.\n" +
        "For local network access, consider:\n" +
        "1. Using HTTPS with a self-signed certificate\n" +
        "2. Using localhost instead of IP address\n" +
        "3. Setting up a reverse proxy with SSL\n\n" +
        "Messages will be sent unencrypted in this session."
      );
    }
  }

  return encryptionAvailable;
}

// Safely get the crypto API, checking for browser environment and availability
function getCrypto(): { subtle: SubtleCrypto; getRandomValues: (array: Uint8Array) => Uint8Array } | null {
  // Check if we're in a browser environment
  if (typeof window === "undefined") {
    return null;
  }

  // Try to get crypto from window, globalThis, or self
  const crypto =
    window.crypto ||
    (globalThis as { crypto?: Crypto } | undefined)?.crypto ||
    (self as { crypto?: Crypto } | undefined)?.crypto;

  if (!crypto || !crypto.subtle) {
    return null;
  }

  return {
    subtle: crypto.subtle,
    getRandomValues: crypto.getRandomValues.bind(crypto),
  };
}

// In a real production app, this secret should be negotiated via ECDH or similar.
// For this architecture, we derive a session key deterministically from the roomId
// to ensure all participants in the room can communicate.
export async function deriveKey(secret: string): Promise<CryptoKey | null> {
  const crypto = getCrypto();
  if (!crypto) {
    return null; // Encryption not available
  }

  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  // Deterministic salt for room-based key derivation
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("translatr-secure-salt-v1"),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    ALGORITHM,
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptData(
  text: string,
  key: CryptoKey | null
): Promise<{ cipher: string; iv: string } | null> {
  // If encryption is not available, return null to indicate plaintext should be used
  if (!key || !isEncryptionAvailable()) {
    return null;
  }

  const crypto = getCrypto();
  if (!crypto) {
    return null;
  }

  const enc = new TextEncoder();
  // 12 bytes IV is standard for AES-GCM
  const ivArray = new Uint8Array(12);
  crypto.getRandomValues(ivArray);

  // Type assertion: getRandomValues returns Uint8Array<ArrayBufferLike> but
  // crypto.subtle.encrypt accepts it at runtime. This is a known TypeScript limitation.
  // Create a new Uint8Array with a proper ArrayBuffer to satisfy TypeScript
  const iv = new Uint8Array(ivArray);

  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(text));

  return {
    cipher: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    iv: btoa(String.fromCharCode(...new Uint8Array(iv))),
  };
}

export async function decryptData(cipher: string, iv: string, key: CryptoKey | null): Promise<string> {
  // If encryption is not available or key is null, return the cipher as-is (it's plaintext)
  if (!key || !isEncryptionAvailable()) {
    // If it looks like base64, try to decode it as plaintext
    try {
      return atob(cipher);
    } catch {
      return cipher;
    }
  }

  try {
    const crypto = getCrypto();
    if (!crypto) {
      // Fallback: try to decode as plaintext
      try {
        return atob(cipher);
      } catch {
        return cipher;
      }
    }

    const dec = new TextDecoder();
    const ivBytes = new Uint8Array(
      atob(iv)
        .split("")
        .map((c) => c.charCodeAt(0))
    );
    const dataBytes = new Uint8Array(
      atob(cipher)
        .split("")
        .map((c) => c.charCodeAt(0))
    );

    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBytes }, key, dataBytes);
    return dec.decode(plaintext);
  } catch (_e) {
    // If decryption fails, it might be plaintext - try to return it
    try {
      return atob(cipher);
    } catch {
      return "🔒 Encrypted Message (Could not decrypt)";
    }
  }
}

// Export function to check if encryption is available
export function isEncryptionSupported(): boolean {
  return isEncryptionAvailable();
}
