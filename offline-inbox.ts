/**
 * @qubic-messenger/shared/offline-inbox
 *
 * IPFS-based offline message inbox.
 *
 * When a recipient is offline, the sender:
 *   1. Uploads the encrypted blob to IPFS → gets a CID
 *   2. Posts the CID + recipient address to the Qubic contract (PostMessageMeta)
 *
 * When the recipient comes back online:
 *   1. Polls the contract for new metadata entries addressed to them
 *   2. Fetches each CID from IPFS
 *   3. Decrypts locally
 *
 * Nothing stored in plaintext. IPFS only ever sees encrypted bytes.
 */

import { createHelia } from 'helia'
import { unixfs } from '@helia/unixfs'
import { CID } from 'multiformats/cid'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StoredMessage {
  cid: string           // IPFS CID of the encrypted blob
  sender: string        // Qubic address
  recipient: string     // Qubic address
  timestamp: number     // unix ms
  retrieved: boolean
}

// ─── IPFS Inbox ───────────────────────────────────────────────────────────────

export class OfflineInbox {
  private helia: any = null
  private fs: any    = null

  /**
   * Initialize Helia (in-browser IPFS node).
   * Call once on app startup.
   */
  async init(): Promise<void> {
    this.helia = await createHelia()
    this.fs    = unixfs(this.helia)
    console.log('[OfflineInbox] Helia node started')
  }

  /**
   * Upload an encrypted message blob to IPFS.
   * Returns the CID string — post this to the Qubic contract.
   *
   * @param encryptedBlob  Output of serializeMessage() — already E2EE
   */
  async store(encryptedBlob: Uint8Array): Promise<string> {
    if (!this.fs) throw new Error('Call init() first')

    const cid = await this.fs.addBytes(encryptedBlob)
    console.log('[OfflineInbox] Stored message, CID:', cid.toString())
    return cid.toString()
  }

  /**
   * Retrieve an encrypted blob from IPFS by CID.
   * The blob should then be passed to deserializeMessage() + decryptMessage().
   */
  async retrieve(cidString: string): Promise<Uint8Array> {
    if (!this.fs) throw new Error('Call init() first')

    const cid    = CID.parse(cidString)
    const chunks: Uint8Array[] = []

    for await (const chunk of this.fs.cat(cid)) {
      chunks.push(chunk)
    }

    // Concatenate chunks
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0)
    const result      = new Uint8Array(totalLength)
    let offset        = 0
    for (const chunk of chunks) {
      result.set(chunk, offset)
      offset += chunk.length
    }

    console.log('[OfflineInbox] Retrieved message, CID:', cidString)
    return result
  }

  /**
   * Pin a CID to keep it available longer.
   * Without pinning, Helia may garbage-collect it.
   */
  async pin(cidString: string): Promise<void> {
    if (!this.helia) throw new Error('Call init() first')
    const cid = CID.parse(cidString)
    await this.helia.pins.add(cid)
  }

  async stop(): Promise<void> {
    await this.helia?.stop()
  }
}

// ─── CID ↔ Contract integration ───────────────────────────────────────────────

/**
 * Encode a CID string into a 32-byte hash for on-chain storage.
 * We store the first 32 bytes of the CID's multihash digest.
 * The full CID string must be stored off-chain (e.g. local IndexedDB)
 * keyed by this hash for retrieval.
 */
export function cidToBytes32(cidString: string): Uint8Array {
  const cid    = CID.parse(cidString)
  const digest = cid.multihash.digest
  const out    = new Uint8Array(32)
  out.set(digest.slice(0, Math.min(32, digest.length)))
  return out
}

/**
 * Full send flow for offline recipients:
 *
 * 1. Encrypt message (using crypto.ts encryptMessage)
 * 2. Serialize (serializeMessage)
 * 3. Upload to IPFS → get CID        ← this file
 * 4. Post cidToBytes32(CID) to Qubic contract as contentHash
 * 5. Store { cid, recipient } locally so you can share CID out-of-band
 *
 * Recipient flow:
 * 1. Poll contract for new PostMessageMeta entries addressed to them
 * 2. Match contentHash to stored CID mapping
 * 3. Fetch blob from IPFS via retrieve(cid)
 * 4. deserializeMessage + decryptMessage
 */
export async function sendOffline(
  inbox: OfflineInbox,
  encryptedBlob: Uint8Array
): Promise<{ cid: string; bytes32: Uint8Array }> {
  const cid     = await inbox.store(encryptedBlob)
  const bytes32 = cidToBytes32(cid)
  return { cid, bytes32 }
}
