/**
 * Token-Gated Messaging — Qubic Messenger
 * 
 * Users must hold a minimum QUBIC balance to:
 *   - Send messages to gated channels
 *   - Create group chats (Tier 2)
 *   - Access premium encryption features (Tier 3)
 * 
 * Balance is verified via Qubic RPC — no trust required.
 * Gates are enforced both client-side (UX) and on-chain (contract check).
 */

import { QubicMessengerClient } from './qubic-client'

// ─── Tier Definitions ─────────────────────────────────────────────────────────

export const TIERS = {
  FREE: {
    id: 'free',
    label: 'Free',
    minBalance: 0n,
    color: '#5a5a7a',
    icon: '👤',
    features: [
      'Send messages to public users',
      'Basic E2EE encryption',
      'Up to 10 active conversations',
    ],
  },
  SILVER: {
    id: 'silver',
    label: 'Silver',
    minBalance: 1_000n,           // 1,000 QUBIC
    color: '#9090c0',
    icon: '⚡',
    features: [
      'Everything in Free',
      'Unlimited conversations',
      'Message search & history',
      'Custom profile avatar',
    ],
  },
  GOLD: {
    id: 'gold',
    label: 'Gold',
    minBalance: 10_000n,          // 10,000 QUBIC
    color: '#ffd06e',
    icon: '🔥',
    features: [
      'Everything in Silver',
      'Create group chats (up to 50 members)',
      'Priority P2P routing',
      'Message scheduling',
    ],
  },
  DIAMOND: {
    id: 'diamond',
    label: 'Diamond',
    minBalance: 100_000n,         // 100,000 QUBIC
    color: '#00d4aa',
    icon: '💎',
    features: [
      'Everything in Gold',
      'Token-gated channels (create your own)',
      'Verified badge on profile',
      'Early access to new features',
    ],
  },
} as const

export type TierId = keyof typeof TIERS
export type Tier   = typeof TIERS[TierId]

// ─── Balance Check ────────────────────────────────────────────────────────────

export interface BalanceResult {
  address:    string
  balance:    bigint
  tier:       Tier
  tierId:     TierId
  checkedAt:  number
}

/**
 * Fetch QUBIC balance from RPC and determine tier.
 * Cached for 60 seconds to avoid hammering the RPC.
 */
const balanceCache = new Map<string, BalanceResult>()
const CACHE_TTL = 60_000 // 60 seconds

export async function checkBalance(
  address: string,
  rpcUrl: string = process.env.NEXT_PUBLIC_QUBIC_RPC ?? 'https://testnet-rpc.qubicdev.com'
): Promise<BalanceResult> {
  // Check cache
  const cached = balanceCache.get(address)
  if (cached && Date.now() - cached.checkedAt < CACHE_TTL) {
    return cached
  }

  // Fetch from RPC
  const res = await fetch(`${rpcUrl}/v1/balances/${address}`)
  if (!res.ok) throw new Error(`RPC error: ${res.status}`)

  const data = await res.json()
  const balance = BigInt(data.balance ?? 0)

  // Determine tier
  let tierId: TierId = 'FREE'
  if (balance >= TIERS.DIAMOND.minBalance) tierId = 'DIAMOND'
  else if (balance >= TIERS.GOLD.minBalance)    tierId = 'GOLD'
  else if (balance >= TIERS.SILVER.minBalance)  tierId = 'SILVER'

  const result: BalanceResult = {
    address,
    balance,
    tier:      TIERS[tierId],
    tierId,
    checkedAt: Date.now(),
  }

  balanceCache.set(address, result)
  return result
}

// ─── Gate Checks ──────────────────────────────────────────────────────────────

export interface GateResult {
  allowed:   boolean
  reason?:   string
  required?: TierId
  current?:  TierId
}

/** Check if user can send to a gated channel */
export function canSendToGated(
  userTierId: TierId,
  requiredTierId: TierId
): GateResult {
  const userMin     = TIERS[userTierId].minBalance
  const requiredMin = TIERS[requiredTierId].minBalance

  if (userMin >= requiredMin) {
    return { allowed: true }
  }

  return {
    allowed:  false,
    reason:   `This channel requires ${TIERS[requiredTierId].label} tier (${TIERS[requiredTierId].minBalance.toLocaleString()} QUBIC)`,
    required: requiredTierId,
    current:  userTierId,
  }
}

/** Check if user can create a group chat */
export function canCreateGroup(userTierId: TierId): GateResult {
  return canSendToGated(userTierId, 'GOLD')
}

/** Check if user can create a token-gated channel */
export function canCreateGatedChannel(userTierId: TierId): GateResult {
  return canSendToGated(userTierId, 'DIAMOND')
}

/** Check if user can access message history/search */
export function canSearchHistory(userTierId: TierId): GateResult {
  return canSendToGated(userTierId, 'SILVER')
}

// ─── Gated Channel Definition ─────────────────────────────────────────────────

export interface GatedChannel {
  id:           string
  name:         string
  description:  string
  requiredTier: TierId
  createdBy:    string   // Qubic address
  createdAt:    number
  memberCount:  number
}

// ─── React Hook ───────────────────────────────────────────────────────────────

// Usage in components:
//
// const { tier, balance, loading } = useTokenGate(myAddress)
//
// if (!canCreateGroup(tier.id).allowed) {
//   return <UpgradePrompt required="GOLD" current={tier.id} />
// }
