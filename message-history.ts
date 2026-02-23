/**
 * Message Search & History — Qubic Messenger
 *
 * Stores decrypted messages in IndexedDB (browser) or SQLite (mobile).
 * Supports full-text search, date filtering, and conversation history.
 * All data is local — nothing is sent to a server.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StoredMessage {
  id:           string   // Unique message ID
  conversationId: string // Address or group ID
  from:         string   // Sender address
  to:           string   // Recipient address or group ID
  plaintext:    string   // Decrypted content
  timestamp:    number   // Unix ms
  delivered:    boolean
  isGroup:      boolean
  groupName?:   string
}

export interface SearchResult {
  message:    StoredMessage
  highlights: string[]  // Snippets with matching text highlighted
}

// ─── IndexedDB Store ──────────────────────────────────────────────────────────

const DB_NAME    = 'qubic-messenger'
const DB_VERSION = 1
const STORE_NAME = 'messages'

export class MessageHistory {
  private db: IDBDatabase | null = null

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)

      req.onupgradeneeded = (e) => {
        const db    = (e.target as IDBOpenDBRequest).result
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })

        // Indexes for fast querying
        store.createIndex('conversationId', 'conversationId', { unique: false })
        store.createIndex('timestamp',      'timestamp',      { unique: false })
        store.createIndex('from',           'from',           { unique: false })
        // Compound index for conversation + time
        store.createIndex('conv_time', ['conversationId', 'timestamp'], { unique: false })
      }

      req.onsuccess = () => { this.db = req.result; resolve() }
      req.onerror   = () => reject(req.error)
    })
  }

  /** Save a message to history */
  async save(msg: StoredMessage): Promise<void> {
    if (!this.db) await this.init()
    return new Promise((resolve, reject) => {
      const tx    = this.db!.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req   = store.put(msg)
      req.onsuccess = () => resolve()
      req.onerror   = () => reject(req.error)
    })
  }

  /** Get all messages for a conversation, sorted by time */
  async getConversation(
    conversationId: string,
    limit  = 50,
    before?: number  // Load messages before this timestamp (pagination)
  ): Promise<StoredMessage[]> {
    if (!this.db) await this.init()
    return new Promise((resolve, reject) => {
      const tx      = this.db!.transaction(STORE_NAME, 'readonly')
      const store   = tx.objectStore(STORE_NAME)
      const index   = store.index('conversationId')
      const results: StoredMessage[] = []

      const req = index.openCursor(IDBKeyRange.only(conversationId), 'prev')
      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result
        if (!cursor || results.length >= limit) {
          resolve(results.reverse()) // Return chronological order
          return
        }
        const msg = cursor.value as StoredMessage
        if (!before || msg.timestamp < before) {
          results.push(msg)
        }
        cursor.continue()
      }
      req.onerror = () => reject(req.error)
    })
  }

  /**
   * Full-text search across all messages.
   * Simple client-side search — no server needed.
   */
  async search(
    query:           string,
    conversationId?: string,  // Limit to specific conversation
    limit = 20
  ): Promise<SearchResult[]> {
    if (!this.db) await this.init()
    if (!query.trim()) return []

    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)

    return new Promise((resolve, reject) => {
      const tx    = this.db!.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const results: SearchResult[] = []

      // Use conversation index if filtering by conversation
      const source = conversationId
        ? store.index('conversationId').openCursor(IDBKeyRange.only(conversationId))
        : store.openCursor()

      source.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result
        if (!cursor || results.length >= limit) {
          // Sort by relevance (number of matching terms)
          results.sort((a, b) => b.highlights.length - a.highlights.length)
          resolve(results)
          return
        }

        const msg  = cursor.value as StoredMessage
        const text = msg.plaintext.toLowerCase()

        // Check if all terms match
        const matchingTerms = terms.filter(t => text.includes(t))
        if (matchingTerms.length > 0) {
          results.push({
            message:    msg,
            highlights: matchingTerms.map(t => highlightSnippet(msg.plaintext, t))
          })
        }

        cursor.continue()
      }

      source.onerror = () => reject(source.error)
    })
  }

  /** Delete all messages for a conversation */
  async clearConversation(conversationId: string): Promise<void> {
    if (!this.db) await this.init()
    const messages = await this.getConversation(conversationId, 10000)
    return new Promise((resolve, reject) => {
      const tx    = this.db!.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      messages.forEach(msg => store.delete(msg.id))
      tx.oncomplete = () => resolve()
      tx.onerror    = () => reject(tx.error)
    })
  }

  /** Get total message count */
  async count(): Promise<number> {
    if (!this.db) await this.init()
    return new Promise((resolve, reject) => {
      const tx    = this.db!.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req   = store.count()
      req.onsuccess = () => resolve(req.result)
      req.onerror   = () => reject(req.error)
    })
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Extract a snippet of text around a search match */
function highlightSnippet(text: string, term: string, radius = 40): string {
  const idx = text.toLowerCase().indexOf(term.toLowerCase())
  if (idx === -1) return text.slice(0, 80)
  const start   = Math.max(0, idx - radius)
  const end     = Math.min(text.length, idx + term.length + radius)
  const snippet = text.slice(start, end)
  return (start > 0 ? '…' : '') + snippet + (end < text.length ? '…' : '')
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const messageHistory = new MessageHistory()
