/**
 * Group Chat — Qubic Messenger
 *
 * Group chats use a shared symmetric key (ChaCha20-Poly1305 via libsodium).
 * The group key is encrypted individually for each member using their X25519 pubkey
 * and stored on IPFS. The group metadata (name, members, key CID) is posted on-chain.
 *
 * Key rotation: when a member is removed, a new group key is generated and
 * re-encrypted for remaining members.
 */

import nacl from 'tweetnacl'
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from 'tweetnacl-util'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GroupMember {
  address:   string    // Qubic address
  nickname:  string
  pubkey:    Uint8Array // X25519 public key
  role:      'admin' | 'member'
  joinedAt:  number
}

export interface GroupChat {
  id:          string   // Random 16-byte hex ID
  name:        string
  description: string
  members:     GroupMember[]
  createdBy:   string
  createdAt:   number
  keyVersion:  number  // Increments on key rotation
}

export interface GroupMessage {
  id:          string
  groupId:     string
  from:        string   // Qubic address
  ciphertext:  string   // Base64 encrypted with group key
  nonce:       string   // Base64
  timestamp:   number
  plaintext?:  string   // Only set after decryption
}

// ─── Group Key Management ─────────────────────────────────────────────────────

/**
 * Generate a new symmetric group key.
 * Uses nacl.secretbox (XSalsa20-Poly1305).
 */
export function generateGroupKey(): Uint8Array {
  return nacl.randomBytes(nacl.secretbox.keyLength) // 32 bytes
}

/**
 * Encrypt the group key for a specific member using their X25519 pubkey.
 * Each member gets their own encrypted copy of the same group key.
 */
export function encryptGroupKeyForMember(
  groupKey:        Uint8Array,
  memberPubkey:    Uint8Array,
  senderPrivkey:   Uint8Array
): string {
  const nonce      = nacl.randomBytes(nacl.box.nonceLength)
  const encrypted  = nacl.box(groupKey, nonce, memberPubkey, senderPrivkey)
  // Serialize as base64: [24 nonce | N ciphertext]
  const combined   = new Uint8Array(nonce.length + encrypted.length)
  combined.set(nonce, 0)
  combined.set(encrypted, nonce.length)
  return encodeBase64(combined)
}

/**
 * Decrypt a group key that was encrypted for you.
 */
export function decryptGroupKey(
  encryptedKeyB64: string,
  senderPubkey:    Uint8Array,
  myPrivkey:       Uint8Array
): Uint8Array | null {
  const combined  = decodeBase64(encryptedKeyB64)
  const nonce     = combined.slice(0, nacl.box.nonceLength)
  const ciphertext = combined.slice(nacl.box.nonceLength)
  return nacl.box.open(ciphertext, nonce, senderPubkey, myPrivkey)
}

// ─── Group Message Encryption ─────────────────────────────────────────────────

/**
 * Encrypt a message with the group's symmetric key.
 */
export function encryptGroupMessage(
  plaintext: string,
  groupKey:  Uint8Array
): { ciphertext: string; nonce: string } {
  const nonce      = nacl.randomBytes(nacl.secretbox.nonceLength)
  const encrypted  = nacl.secretbox(encodeUTF8(plaintext), nonce, groupKey)
  return {
    ciphertext: encodeBase64(encrypted),
    nonce:      encodeBase64(nonce),
  }
}

/**
 * Decrypt a group message.
 */
export function decryptGroupMessage(
  ciphertextB64: string,
  nonceB64:      string,
  groupKey:      Uint8Array
): string | null {
  const ciphertext = decodeBase64(ciphertextB64)
  const nonce      = decodeBase64(nonceB64)
  const decrypted  = nacl.secretbox.open(ciphertext, nonce, groupKey)
  if (!decrypted) return null
  return decodeUTF8(decrypted)
}

// ─── Group Manager ────────────────────────────────────────────────────────────

export class GroupManager {
  // In-memory group key store: groupId → groupKey
  private groupKeys = new Map<string, Uint8Array>()

  /**
   * Create a new group chat.
   * Generates a group key and encrypts it for each member.
   */
  createGroup(
    name:        string,
    description: string,
    members:     GroupMember[],
    myAddress:   string,
    myPrivkey:   Uint8Array,
    myPubkey:    Uint8Array
  ): { group: GroupChat; encryptedKeys: Record<string, string> } {
    const groupKey = generateGroupKey()
    const groupId  = encodeBase64(nacl.randomBytes(16)).slice(0, 16)

    // Store locally
    this.groupKeys.set(groupId, groupKey)

    // Encrypt group key for each member (including self)
    const encryptedKeys: Record<string, string> = {}
    for (const member of members) {
      encryptedKeys[member.address] = encryptGroupKeyForMember(
        groupKey, member.pubkey, myPrivkey
      )
    }
    // Also encrypt for self
    encryptedKeys[myAddress] = encryptGroupKeyForMember(
      groupKey, myPubkey, myPrivkey
    )

    const group: GroupChat = {
      id: groupId, name, description,
      members: [
        { address: myAddress, nickname: 'You', pubkey: myPubkey, role: 'admin', joinedAt: Date.now() },
        ...members.map(m => ({ ...m, role: 'member' as const, joinedAt: Date.now() }))
      ],
      createdBy: myAddress,
      createdAt: Date.now(),
      keyVersion: 1,
    }

    return { group, encryptedKeys }
  }

  /** Store a decrypted group key */
  storeGroupKey(groupId: string, key: Uint8Array) {
    this.groupKeys.set(groupId, key)
  }

  /** Encrypt a message to send to a group */
  encryptMessage(groupId: string, plaintext: string) {
    const key = this.groupKeys.get(groupId)
    if (!key) throw new Error(`No key for group ${groupId}`)
    return encryptGroupMessage(plaintext, key)
  }

  /** Decrypt a received group message */
  decryptMessage(groupId: string, msg: GroupMessage): string | null {
    const key = this.groupKeys.get(groupId)
    if (!key) return null
    return decryptGroupMessage(msg.ciphertext, msg.nonce, key)
  }

  /** Rotate group key (call when removing a member) */
  rotateKey(
    groupId:    string,
    members:    GroupMember[],
    myPrivkey:  Uint8Array
  ): Record<string, string> {
    const newKey = generateGroupKey()
    this.groupKeys.set(groupId, newKey)

    const encryptedKeys: Record<string, string> = {}
    for (const member of members) {
      encryptedKeys[member.address] = encryptGroupKeyForMember(
        newKey, member.pubkey, myPrivkey
      )
    }
    return encryptedKeys
  }
}
