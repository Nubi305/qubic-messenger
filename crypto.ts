/**
 * @qubic-messenger/shared/crypto
 *
 * All cryptographic operations for the messenger.
 * Uses libsodium: X25519 key exchange + XSalsa20-Poly1305 authenticated encryption.
 */

import sodium from 'libsodium-wrappers';

let _ready = false;

export async function initCrypto(): Promise<void> {
  if (_ready) return;
  await sodium.ready;
  _ready = true;
}

function assertReady() {
  if (!_ready) throw new Error('Call initCrypto() before using crypto functions');
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Keypair {
  publicKey: Uint8Array;  // 32 bytes, X25519
  privateKey: Uint8Array; // 32 bytes
}

export interface EncryptedMessage {
  nonce: Uint8Array;        // 24 bytes
  ciphertext: Uint8Array;   // variable length
  senderPubkey: Uint8Array; // 32 bytes — needed by recipient to derive shared secret
}

// ─── Key Generation ───────────────────────────────────────────────────────────

/**
 * Generate a new X25519 keypair.
 * The private key should be stored wrapped — see wrapPrivateKey().
 */
export function generateKeypair(): Keypair {
  assertReady();
  const kp = sodium.crypto_box_keypair();
  return { publicKey: kp.publicKey, privateKey: kp.privateKey };
}

/**
 * Derive the public key from a private key.
 */
export function getPublicKey(privateKey: Uint8Array): Uint8Array {
  assertReady();
  return sodium.crypto_scalarmult_base(privateKey);
}

// ─── Key Wrapping (local storage protection) ──────────────────────────────────

/**
 * Wrap (encrypt) a private key using a password-derived key.
 * Use this before storing in IndexedDB/localStorage.
 *
 * @param privateKey  Raw 32-byte X25519 private key
 * @param password    User's password or derived seed string
 * @returns           Hex string: [salt(32)][nonce(24)][ciphertext(48)]
 */
export function wrapPrivateKey(privateKey: Uint8Array, password: string): string {
  assertReady();
  const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
  const wrappingKey = sodium.crypto_pwhash(
    32,
    password,
    salt,
    sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_ALG_DEFAULT
  );
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = sodium.crypto_secretbox_easy(privateKey, nonce, wrappingKey);
  const out = new Uint8Array(salt.length + nonce.length + ciphertext.length);
  out.set(salt, 0);
  out.set(nonce, salt.length);
  out.set(ciphertext, salt.length + nonce.length);
  return sodium.to_hex(out);
}

/**
 * Unwrap (decrypt) a wrapped private key.
 * Returns null if password is wrong or data is tampered.
 */
export function unwrapPrivateKey(wrapped: string, password: string): Uint8Array | null {
  assertReady();
  try {
    const buf = sodium.from_hex(wrapped);
    const saltLen = sodium.crypto_pwhash_SALTBYTES;
    const nonceLen = sodium.crypto_secretbox_NONCEBYTES;
    const salt = buf.slice(0, saltLen);
    const nonce = buf.slice(saltLen, saltLen + nonceLen);
    const ciphertext = buf.slice(saltLen + nonceLen);
    const wrappingKey = sodium.crypto_pwhash(
      32,
      password,
      salt,
      sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
      sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
      sodium.crypto_pwhash_ALG_DEFAULT
    );
    return sodium.crypto_secretbox_open_easy(ciphertext, nonce, wrappingKey);
  } catch {
    return null;
  }
}

// ─── Encryption / Decryption ──────────────────────────────────────────────────

/**
 * Encrypt a plaintext string for a specific recipient.
 * Uses crypto_box_easy (X25519 ECDH + XSalsa20-Poly1305).
 */
export function encryptMessage(
  plaintext: string,
  senderPrivateKey: Uint8Array,
  recipientPublicKey: Uint8Array
): EncryptedMessage {
  assertReady();
  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  const ciphertext = sodium.crypto_box_easy(
    sodium.from_string(plaintext),
    nonce,
    recipientPublicKey,
    senderPrivateKey
  );
  return {
    nonce,
    ciphertext,
    senderPubkey: getPublicKey(senderPrivateKey),
  };
}

/**
 * Decrypt an EncryptedMessage.
 * Returns null if decryption fails (wrong key or tampered data).
 */
export function decryptMessage(
  msg: EncryptedMessage,
  recipientPrivateKey: Uint8Array
): string | null {
  assertReady();
  try {
    const plaintext = sodium.crypto_box_open_easy(
      msg.ciphertext,
      msg.nonce,
      msg.senderPubkey,
      recipientPrivateKey
    );
    return sodium.to_string(plaintext);
  } catch {
    return null;
  }
}

// ─── Serialization ────────────────────────────────────────────────────────────

/**
 * Serialize an EncryptedMessage to a flat Uint8Array for P2P transmission.
 * Layout: [24 nonce | 32 senderPubkey | N ciphertext]
 */
export function serializeMessage(msg: EncryptedMessage): Uint8Array {
  const buf = new Uint8Array(24 + 32 + msg.ciphertext.length);
  buf.set(msg.nonce, 0);
  buf.set(msg.senderPubkey, 24);
  buf.set(msg.ciphertext, 56);
  return buf;
}

/**
 * Deserialize a flat Uint8Array back into an EncryptedMessage.
 */
export function deserializeMessage(buf: Uint8Array): EncryptedMessage {
  if (buf.length < 57) throw new Error('Message too short to deserialize');
  return {
    nonce:        buf.slice(0, 24),
    senderPubkey: buf.slice(24, 56),
    ciphertext:   buf.slice(56),
  };
}

// ─── Hashing ──────────────────────────────────────────────────────────────────

/**
 * Compute BLAKE2b-256 hash of the encrypted ciphertext.
 * This is what gets posted on-chain for delivery proof.
 */
export function hashCiphertext(ciphertext: Uint8Array): Uint8Array {
  assertReady();
  return sodium.crypto_generichash(32, ciphertext);
}

export function bytesToHex(bytes: Uint8Array): string {
  assertReady();
  return sodium.to_hex(bytes);
}

export function hexToBytes(hex: string): Uint8Array {
  assertReady();
  return sodium.from_hex(hex);
}
