/**
 * @qubic-messenger/shared/qubic-client
 *
 * Typed wrapper around @qubic-lib/qubic-ts-library for all contract interactions.
 * Handles struct encoding/decoding for QubicMessenger contract procedures and functions.
 */

import { QubicHelper } from '@qubic-lib/qubic-ts-library';

// ─── Config ───────────────────────────────────────────────────────────────────

/**
 * Update this after the contract is deployed to Qubic mainnet/testnet.
 */
export const CONTRACT_INDEX = 42;

// Procedure indexes (must match REGISTER_USER_FUNCTIONS_AND_PROCEDURES order)
export const PROC = {
  REGISTER_USER:     1,
  UPDATE_PUBKEY:     2,
  DEACTIVATE_USER:   3,
  POST_MESSAGE_META: 4,
} as const;

// Function indexes (read-only)
export const FUNC = {
  LOOKUP_USER:          0,
  LOOKUP_USER_BY_OWNER: 1,
  GET_MESSAGE_META:     2,
} as const;

// ─── Encoding Helpers ─────────────────────────────────────────────────────────

const NICKNAME_LEN = 32;
const PUBKEY_LEN   = 32;
const HASH_LEN     = 32;
const ID_LEN       = 32;

export function encodeNickname(name: string): Uint8Array {
  const buf = new Uint8Array(NICKNAME_LEN);
  const enc = new TextEncoder().encode(name).slice(0, NICKNAME_LEN);
  buf.set(enc);
  return buf;
}

export function decodeNickname(buf: Uint8Array): string {
  // trim null bytes
  let end = buf.indexOf(0);
  if (end === -1) end = buf.length;
  return new TextDecoder().decode(buf.slice(0, end));
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserInfo {
  pubkey: Uint8Array;
  owner: string;
  registeredTick: number;
  found: boolean;
}

export interface MessageMetaEntry {
  sender: string;
  receiver: string;
  contentHash: Uint8Array;
  tick: number;
  nonce: number;
  valid: boolean;
}

export interface PostMetaResult {
  success: boolean;
  errorCode: number;
  logIndex: number;
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class QubicMessengerClient {
  constructor(
    private helper: QubicHelper,
    private contractIndex: number = CONTRACT_INDEX
  ) {}

  /**
   * Register a nickname + X25519 pubkey on-chain.
   * The caller's Qubic wallet identity becomes the owner.
   *
   * @returns slot index (>= 0) or negative error code
   */
  async registerUser(
    seed: string,
    nickname: string,
    x25519PubKey: Uint8Array
  ): Promise<number> {
    // Input: [32 nickname][32 pubkey]
    const input = new Uint8Array(64);
    input.set(encodeNickname(nickname), 0);
    input.set(x25519PubKey, 32);

    const tx = await this.helper.createTransaction(
      seed,
      this.contractIndex,
      PROC.REGISTER_USER,
      0, // no QUBIC transfer
      input
    );
    const result = await this.helper.broadcastTransaction(tx);

    // Parse output: [4 sint32 slotIndex]
    const view = new DataView((result as Uint8Array).buffer);
    return view.getInt32(0, true);
  }

  /**
   * Look up a user's X25519 pubkey and owner identity by nickname.
   */
  async lookupUser(nickname: string): Promise<UserInfo> {
    const input = encodeNickname(nickname);

    const raw = await this.helper.queryContractFunction(
      this.contractIndex,
      FUNC.LOOKUP_USER,
      input
    ) as Uint8Array;

    // Output: [32 pubkey][32 owner id][4 registeredTick][1 found]
    return {
      pubkey:         raw.slice(0, PUBKEY_LEN),
      owner:          this.helper.getIdentityFromBytes(raw.slice(PUBKEY_LEN, PUBKEY_LEN + ID_LEN)),
      registeredTick: new DataView(raw.buffer).getUint32(PUBKEY_LEN + ID_LEN, true),
      found:          raw[PUBKEY_LEN + ID_LEN + 4] === 1,
    };
  }

  /**
   * Look up a user by their Qubic wallet address (owner).
   */
  async lookupUserByOwner(ownerAddress: string): Promise<{ nickname: string; pubkey: Uint8Array; found: boolean }> {
    const input = this.helper.getBytesFromIdentity(ownerAddress);

    const raw = await this.helper.queryContractFunction(
      this.contractIndex,
      FUNC.LOOKUP_USER_BY_OWNER,
      input
    ) as Uint8Array;

    // Output: [32 nickname][32 pubkey][1 found]
    return {
      nickname: decodeNickname(raw.slice(0, NICKNAME_LEN)),
      pubkey:   raw.slice(NICKNAME_LEN, NICKNAME_LEN + PUBKEY_LEN),
      found:    raw[NICKNAME_LEN + PUBKEY_LEN] === 1,
    };
  }

  /**
   * Rotate your X25519 public key. Only the registered owner can do this.
   */
  async updatePubkey(seed: string, newPubKey: Uint8Array): Promise<boolean> {
    const tx = await this.helper.createTransaction(
      seed,
      this.contractIndex,
      PROC.UPDATE_PUBKEY,
      0,
      newPubKey
    );
    const result = await this.helper.broadcastTransaction(tx) as Uint8Array;
    return result[0] === 1;
  }

  /**
   * Post message metadata on-chain for delivery proof / receipt.
   * The content hash is BLAKE2b-256 of the encrypted ciphertext.
   */
  async postMessageMeta(
    seed: string,
    receiverAddress: string,
    contentHash: Uint8Array,
    nonce: number
  ): Promise<PostMetaResult> {
    // Input: [32 receiver id][32 contentHash][4 nonce]
    const input = new Uint8Array(68);
    input.set(this.helper.getBytesFromIdentity(receiverAddress), 0);
    input.set(contentHash, ID_LEN);
    new DataView(input.buffer).setUint32(ID_LEN + HASH_LEN, nonce, true);

    const tx = await this.helper.createTransaction(
      seed,
      this.contractIndex,
      PROC.POST_MESSAGE_META,
      0,
      input
    );
    const result = await this.helper.broadcastTransaction(tx) as Uint8Array;

    // Output: [1 success][1 errorCode][4 logIndex]
    const view = new DataView(result.buffer);
    return {
      success:   result[0] === 1,
      errorCode: result[1],
      logIndex:  view.getUint32(2, true),
    };
  }

  /**
   * Fetch a message metadata entry by ring buffer index.
   */
  async getMessageMeta(logIndex: number): Promise<MessageMetaEntry> {
    const input = new Uint8Array(4);
    new DataView(input.buffer).setUint32(0, logIndex, true);

    const raw = await this.helper.queryContractFunction(
      this.contractIndex,
      FUNC.GET_MESSAGE_META,
      input
    ) as Uint8Array;

    // Output: [32 sender][32 receiver][32 contentHash][4 tick][4 nonce][1 valid]
    const view = new DataView(raw.buffer);
    let offset = 0;
    const sender   = this.helper.getIdentityFromBytes(raw.slice(offset, offset + ID_LEN)); offset += ID_LEN;
    const receiver = this.helper.getIdentityFromBytes(raw.slice(offset, offset + ID_LEN)); offset += ID_LEN;
    const contentHash = raw.slice(offset, offset + HASH_LEN); offset += HASH_LEN;
    const tick  = view.getUint32(offset, true); offset += 4;
    const nonce = view.getUint32(offset, true); offset += 4;
    const valid = raw[offset] === 1;

    return { sender, receiver, contentHash, tick, nonce, valid };
  }

  /**
   * Deactivate your own registration.
   */
  async deactivateUser(seed: string): Promise<boolean> {
    const tx = await this.helper.createTransaction(
      seed,
      this.contractIndex,
      PROC.DEACTIVATE_USER,
      0,
      new Uint8Array(0)
    );
    const result = await this.helper.broadcastTransaction(tx) as Uint8Array;
    return result[0] === 1;
  }
}
