export const ALGORITHM = { name: "AES-GCM", length: 256 };

// In a real production app, this secret should be negotiated via ECDH or similar.
// For this architecture, we derive a session key deterministically from the roomId 
// to ensure all participants in the room can communicate.
export async function deriveKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  
  // Deterministic salt for room-based key derivation
  return window.crypto.subtle.deriveKey(
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

export async function encryptData(text: string, key: CryptoKey): Promise<{ cipher: string; iv: string }> {
  const enc = new TextEncoder();
  // 12 bytes IV is standard for AES-GCM
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(text)
  );
  
  return {
    cipher: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    iv: btoa(String.fromCharCode(...new Uint8Array(iv)))
  };
}

export async function decryptData(cipher: string, iv: string, key: CryptoKey): Promise<string> {
  try {
    const dec = new TextDecoder();
    const ivBytes = new Uint8Array(atob(iv).split("").map(c => c.charCodeAt(0)));
    const dataBytes = new Uint8Array(atob(cipher).split("").map(c => c.charCodeAt(0)));
    
    const plaintext = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBytes },
      key,
      dataBytes
    );
    return dec.decode(plaintext);
  } catch(e) {
    console.warn("Decryption error:", e);
    return "🔒 Encrypted Message (Could not decrypt)";
  }
}