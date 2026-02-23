/**
 * @qubic-messenger/shared/messenger
 *
 * High-level Messenger class that composes:
 *   - QubicMessengerClient  (on-chain identity + metadata)
 *   - MessengerP2P          (off-chain E2EE delivery)
 *   - Crypto primitives     (key gen, encrypt, decrypt)
 *
 * This is the main entry point for both the web and mobile frontends.
 */

import { QubicHelper } from '@qubic-lib/qubic-ts-library';
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
  type Keypair,
  type EncryptedMessage,
} from './crypto.js';
import { QubicMessengerClient } from './qubic-client.js';
import { MessengerP2P } from './p2p.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Message {
  id: string;           // unique local id
  from: string;         // sender Qubic address
  fromNickname?: string;
  to: string;           // recipient Qubic address
  plaintext: string;
  timestamp: number;    // unix ms
  delivered: boolean;   // true if on-chain metadata posted
}

export interface MessengerConfig {
  contractIndex?: number;
  relayAddress?: string;  // libp2p multiaddr for relay/bootstrap node
  postMetaOnChain?: boolean; // default: true
}

// ─── Messenger ────────────────────────────────────────────────────────────────

export class Messenger {
  private client: QubicMessengerClient;
  private p2p: MessengerP2P;
  private keypair: Keypair | null = null;
  private myAddress: string = '';
  private mySeed: string = '';
  private nonce: number = Date.now(); // starts as unix ms, increments
  private messageHandlers: Set<(msg: Message) => void> = new Set();
  private config: Required<MessengerConfig>;

  constructor(
    private helper: QubicHelper,
    config: MessengerConfig = {}
  ) {
    this.config = {
      contractIndex: config.contractIndex ?? 42,
      relayAddress:  config.relayAddress ?? '',
      postMetaOnChain: config.postMetaOnChain ?? true,
    };
    this.client = new QubicMessengerClient(helper, this.config.contractIndex);
    this.p2p    = new MessengerP2P();
  }

  /**
   * Initialize the messenger for a specific Qubic seed.
   * Generates (or restores) an X25519 keypair.
   *
   * @param seed          Qubic wallet seed
   * @param password      Password used to wrap/unwrap the stored private key
   * @param wrappedKey    Previously stored wrapped key (from getWrappedKey())
   */
  async init(seed: string, password: string, wrappedKey?: string): Promise<void> {
    await initCrypto();

    this.mySeed   = seed;
    this.myAddress = await this.helper.getIdentity(seed);

    // Restore or generate keypair
    if (wrappedKey) {
      const privKey = unwrapPrivateKey(wrappedKey, password);
      if (!privKey) throw new Error('Failed to unwrap private key — wrong password?');
      this.keypair = { privateKey: privKey, publicKey: getPublicKey(privKey) };
    } else {
      this.keypair = generateKeypair();
    }

    // Start P2P and subscribe to our inbox
    await this.p2p.start(this.myAddress, this.config.relayAddress);

    // Handle incoming messages
    this.p2p.onMessage((_topic, blob) => {
      this._handleIncoming(blob);
    });
  }

  /**
   * Get the wrapped private key for persistent storage (IndexedDB).
   * Store this and pass it back to init() on next session.
   */
  getWrappedKey(password: string): string {
    if (!this.keypair) throw new Error('Not initialized');
    return wrapPrivateKey(this.keypair.privateKey, password);
  }

  /**
   * Get the local user's X25519 public key (to register on-chain).
   */
  getPublicKey(): Uint8Array {
    if (!this.keypair) throw new Error('Not initialized');
    return this.keypair.publicKey;
  }

  /**
   * Register on-chain. Only needed once per wallet.
   */
  async register(nickname: string): Promise<number> {
    if (!this.keypair) throw new Error('Not initialized');
    return this.client.registerUser(this.mySeed, nickname, this.keypair.publicKey);
  }

  /**
   * Send a message to a recipient identified by nickname.
   */
  async sendTo(recipientNickname: string, plaintext: string): Promise<Message> {
    if (!this.keypair) throw new Error('Not initialized');

    // 1. Lookup recipient pubkey from chain
    const recipient = await this.client.lookupUser(recipientNickname);
    if (!recipient.found) throw new Error(`User "${recipientNickname}" not found`);

    return this._send(recipient.owner, recipient.pubkey, plaintext, recipientNickname);
  }

  /**
   * Send a message to a recipient identified by their Qubic address.
   */
  async sendToAddress(recipientAddress: string, plaintext: string): Promise<Message> {
    if (!this.keypair) throw new Error('Not initialized');

    const info = await this.client.lookupUserByOwner(recipientAddress);
    if (!info.found) throw new Error('Recipient not registered');

    return this._send(recipientAddress, info.pubkey, plaintext, info.nickname);
  }

  private async _send(
    recipientAddress: string,
    recipientPubkey: Uint8Array,
    plaintext: string,
    recipientNickname?: string
  ): Promise<Message> {
    if (!this.keypair) throw new Error('Not initialized');

    // 2. Encrypt
    const encrypted = encryptMessage(plaintext, this.keypair.privateKey, recipientPubkey);
    const serialized = serializeMessage(encrypted);

    // 3. Deliver via P2P
    await this.p2p.publish(recipientAddress, serialized);

    // 4. Optionally post metadata on-chain
    let delivered = false;
    if (this.config.postMetaOnChain) {
      const hash = hashCiphertext(encrypted.ciphertext);
      const result = await this.client.postMessageMeta(
        this.mySeed,
        recipientAddress,
        hash,
        ++this.nonce
      );
      delivered = result.success;
    }

    const msg: Message = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      from: this.myAddress,
      to: recipientAddress,
      fromNickname: undefined,
      plaintext,
      timestamp: Date.now(),
      delivered,
    };

    return msg;
  }

  /**
   * Register a handler for incoming decrypted messages.
   * Returns an unsubscribe function.
   */
  onMessage(handler: (msg: Message) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  private async _handleIncoming(blob: Uint8Array): Promise<void> {
    if (!this.keypair) return;
    try {
      const encMsg = deserializeMessage(blob);
      const plaintext = decryptMessage(encMsg, this.keypair.privateKey);
      if (plaintext === null) {
        console.warn('[Messenger] Decryption failed for incoming message — ignoring');
        return;
      }

      // Try to resolve sender nickname
      let fromNickname: string | undefined;
      try {
        const senderInfo = await this.client.lookupUserByOwner(
          // Derive Qubic address from sender pubkey — this is a simplification;
          // in practice, sender embeds their address in metadata or you derive it.
          'unknown'
        );
        if (senderInfo.found) fromNickname = senderInfo.nickname;
      } catch { /* best effort */ }

      const msg: Message = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        from: 'unknown', // TODO: resolve from pubkey or on-chain metadata
        fromNickname,
        to: this.myAddress,
        plaintext,
        timestamp: Date.now(),
        delivered: true,
      };

      this.messageHandlers.forEach(h => h(msg));
    } catch (e) {
      console.error('[Messenger] Error handling incoming message:', e);
    }
  }

  async stop(): Promise<void> {
    await this.p2p.stop();
  }

  getMyAddress(): string { return this.myAddress; }
  getPeerCount(): number { return this.p2p.getPeerCount(); }
}
