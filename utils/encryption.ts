const ALGORITHM = { name: "AES-GCM", length: 256 };

// Safely get the crypto API, checking for browser environment and availability
function getCrypto(): { subtle: SubtleCrypto; getRandomValues: (array: Uint8Array) => Uint8Array } {
  // Check if we're in a browser environment
  if (typeof window === "undefined") {
    throw new Error("Crypto API is only available in browser environments");
  }

  // Try to get crypto from window, globalThis, or self
  const crypto =
    window.crypto ||
    (globalThis as { crypto?: Crypto } | undefined)?.crypto ||
    (self as { crypto?: Crypto } | undefined)?.crypto;

  if (!crypto) {
    throw new Error("Crypto API is not available in this environment");
  }

  if (!crypto.subtle) {
    throw new Error(
      "Web Crypto API (crypto.subtle) is not available. This may be due to:\n" +
        "- Using an insecure context (HTTPS required)\n" +
        "- Browser compatibility issues\n" +
        "- Mobile device restrictions"
    );
  }

  return {
    subtle: crypto.subtle,
    getRandomValues: crypto.getRandomValues.bind(crypto),
  };
}

// In a real production app, this secret should be negotiated via ECDH or similar.
// For this architecture, we derive a session key deterministically from the roomId
// to ensure all participants in the room can communicate.
export async function deriveKey(secret: string): Promise<CryptoKey> {
  const crypto = getCrypto();
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
  key: CryptoKey
): Promise<{ cipher: string; iv: string }> {
  const crypto = getCrypto();
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

export async function decryptData(cipher: string, iv: string, key: CryptoKey): Promise<string> {
  try {
    const crypto = getCrypto();
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
    return "🔒 Encrypted Message (Could not decrypt)";
  }
}
