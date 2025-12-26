/**
 * Client-side encryption for sensitive credentials using Web Crypto API
 * Uses AES-GCM for authenticated encryption with user-derived keys
 */

// Derive an encryption key from user ID using PBKDF2
const deriveKey = async (userId: string): Promise<CryptoKey> => {
  const encoder = new TextEncoder();
  
  // Use user ID as base material for key derivation
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(userId),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  // Static salt - each user has unique key material (their ID)
  // In production, consider storing per-user salt in database
  const salt = encoder.encode('camera-creds-salt-v1');
  
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

// Generate a random IV for each encryption - returns ArrayBuffer-backed Uint8Array
const generateIV = (): { buffer: ArrayBuffer; view: Uint8Array } => {
  const buffer = new ArrayBuffer(12);
  const view = new Uint8Array(buffer);
  crypto.getRandomValues(view);
  return { buffer, view };
};

// Convert ArrayBuffer to base64 string
const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

// Convert base64 string to ArrayBuffer
const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

/**
 * Encrypt a password using user-derived key
 * Returns base64-encoded ciphertext with IV prepended
 */
export const encryptPassword = async (password: string, userId: string): Promise<string> => {
  if (!password) return '';
  
  try {
    const key = await deriveKey(userId);
    const { buffer: ivBuffer, view: iv } = generateIV();
    const encoder = new TextEncoder();
    const passwordData = encoder.encode(password);
    
    // Create a proper ArrayBuffer for the data
    const dataBuffer = new ArrayBuffer(passwordData.length);
    const dataView = new Uint8Array(dataBuffer);
    dataView.set(passwordData);
    
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: ivBuffer },
      key,
      dataBuffer
    );
    
    // Prepend IV to ciphertext (IV is 12 bytes)
    const resultBuffer = new ArrayBuffer(12 + ciphertext.byteLength);
    const resultView = new Uint8Array(resultBuffer);
    resultView.set(iv);
    resultView.set(new Uint8Array(ciphertext), 12);
    
    return arrayBufferToBase64(resultBuffer);
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Failed to encrypt credential');
  }
};

/**
 * Decrypt a password using user-derived key
 * Expects base64-encoded ciphertext with IV prepended
 */
export const decryptPassword = async (encryptedPassword: string, userId: string): Promise<string> => {
  if (!encryptedPassword) return '';
  
  try {
    const key = await deriveKey(userId);
    const combinedBuffer = base64ToArrayBuffer(encryptedPassword);
    const combined = new Uint8Array(combinedBuffer);
    
    // Extract IV (first 12 bytes) into a new ArrayBuffer
    const ivBuffer = new ArrayBuffer(12);
    const ivView = new Uint8Array(ivBuffer);
    for (let i = 0; i < 12; i++) {
      ivView[i] = combined[i];
    }
    
    // Extract ciphertext into a new ArrayBuffer
    const ciphertextBuffer = new ArrayBuffer(combined.length - 12);
    const ciphertextView = new Uint8Array(ciphertextBuffer);
    for (let i = 0; i < combined.length - 12; i++) {
      ciphertextView[i] = combined[i + 12];
    }
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivView },
      key,
      ciphertextBuffer
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    console.error('Decryption failed:', error);
    // Return empty string on decryption failure (invalid key or corrupted data)
    return '';
  }
};

/**
 * Check if a string appears to be encrypted (base64-encoded with proper length)
 */
export const isEncrypted = (value: string): boolean => {
  if (!value) return false;
  
  try {
    // Minimum length: 12 bytes IV + 16 bytes auth tag = 28 bytes = ~38 base64 chars
    if (value.length < 38) return false;
    
    // Check if it's valid base64
    const decoded = atob(value);
    return decoded.length >= 28;
  } catch {
    return false;
  }
};
