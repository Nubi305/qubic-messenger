/**
 * Unit tests for shared crypto module.
 * Run: pnpm test (in /shared)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  initCrypto,
  generateKeypair,
  encryptMessage,
  decryptMessage,
  serializeMessage,
  deserializeMessage,
  hashCiphertext,
  wrapPrivateKey,
  unwrapPrivateKey,
  getPublicKey,
} from '../src/crypto';

beforeAll(async () => {
  await initCrypto();
});

describe('Keypair generation', () => {
  it('generates a 32-byte keypair', () => {
    const kp = generateKeypair();
    expect(kp.publicKey).toHaveLength(32);
    expect(kp.privateKey).toHaveLength(32);
  });

  it('derives correct public key from private key', () => {
    const kp = generateKeypair();
    const derived = getPublicKey(kp.privateKey);
    expect(derived).toEqual(kp.publicKey);
  });
});

describe('Encrypt / Decrypt', () => {
  it('round-trips a message', () => {
    const alice = generateKeypair();
    const bob   = generateKeypair();

    const encrypted = encryptMessage('Hello, Bob!', alice.privateKey, bob.publicKey);
    const decrypted = decryptMessage(encrypted, bob.privateKey);

    expect(decrypted).toBe('Hello, Bob!');
  });

  it('returns null for wrong recipient key', () => {
    const alice   = generateKeypair();
    const bob     = generateKeypair();
    const charlie = generateKeypair();

    const encrypted = encryptMessage('Secret', alice.privateKey, bob.publicKey);
    const result    = decryptMessage(encrypted, charlie.privateKey);

    expect(result).toBeNull();
  });

  it('returns null for tampered ciphertext', () => {
    const alice = generateKeypair();
    const bob   = generateKeypair();

    const encrypted = encryptMessage('Tamper me', alice.privateKey, bob.publicKey);
    encrypted.ciphertext[0] ^= 0xff; // flip bits

    const result = decryptMessage(encrypted, bob.privateKey);
    expect(result).toBeNull();
  });

  it('handles empty string', () => {
    const alice = generateKeypair();
    const bob   = generateKeypair();
    const enc = encryptMessage('', alice.privateKey, bob.publicKey);
    expect(decryptMessage(enc, bob.privateKey)).toBe('');
  });

  it('handles unicode', () => {
    const alice = generateKeypair();
    const bob   = generateKeypair();
    const msg = '🔒 こんにちは Привет';
    const enc = encryptMessage(msg, alice.privateKey, bob.publicKey);
    expect(decryptMessage(enc, bob.privateKey)).toBe(msg);
  });
});

describe('Serialization', () => {
  it('round-trips through serialize/deserialize', () => {
    const alice = generateKeypair();
    const bob   = generateKeypair();

    const original   = encryptMessage('Serialize me', alice.privateKey, bob.publicKey);
    const buf        = serializeMessage(original);
    const restored   = deserializeMessage(buf);
    const decrypted  = decryptMessage(restored, bob.privateKey);

    expect(decrypted).toBe('Serialize me');
  });

  it('throws on too-short buffer', () => {
    expect(() => deserializeMessage(new Uint8Array(10))).toThrow();
  });
});

describe('Content hash', () => {
  it('produces 32-byte BLAKE2b hash', () => {
    const hash = hashCiphertext(new Uint8Array([1, 2, 3]));
    expect(hash).toHaveLength(32);
  });

  it('is deterministic', () => {
    const data = new Uint8Array([10, 20, 30]);
    expect(hashCiphertext(data)).toEqual(hashCiphertext(data));
  });
});

describe('Key wrapping', () => {
  it('wraps and unwraps a private key', () => {
    const kp = generateKeypair();
    const wrapped   = wrapPrivateKey(kp.privateKey, 'my-password');
    const unwrapped = unwrapPrivateKey(wrapped, 'my-password');
    expect(unwrapped).toEqual(kp.privateKey);
  });

  it('returns null for wrong password', () => {
    const kp = generateKeypair();
    const wrapped = wrapPrivateKey(kp.privateKey, 'correct');
    expect(unwrapPrivateKey(wrapped, 'wrong')).toBeNull();
  });
});
