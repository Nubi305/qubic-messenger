/**
 * Qubic Messenger — P2P Relay Server
 *
 * A lightweight libp2p relay node.
 * Deploy this on any $5/mo VPS (DigitalOcean, Hetzner, etc.)
 * and set NEXT_PUBLIC_RELAY_ADDR in your frontend .env.local
 *
 * Usage:
 *   npm install
 *   node relay.js
 *
 * Or with PM2 (keeps it running):
 *   npm install -g pm2
 *   pm2 start relay.js --name qubic-relay
 *   pm2 save && pm2 startup
 */

import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { identify } from '@libp2p/identify'
import { circuitRelayServer } from '@libp2p/circuit-relay-v2'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'

// ─── Config ───────────────────────────────────────────────────────────────────

const PORT_TCP = process.env.PORT_TCP || 4001
const PORT_WS  = process.env.PORT_WS  || 4002

// ─── Start ────────────────────────────────────────────────────────────────────

const node = await createLibp2p({
  addresses: {
    listen: [
      `/ip4/0.0.0.0/tcp/${PORT_TCP}`,
      `/ip4/0.0.0.0/tcp/${PORT_WS}/ws`,
    ]
  },
  transports: [
    tcp(),
    webSockets(),
  ],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  services: {
    identify: identify(),
    relay: circuitRelayServer({
      reservations: {
        maxReservations: 512,        // max simultaneous relay slots
        reservationTtl:  2 * 60 * 60 * 1000, // 2 hour TTL
      }
    }),
    pubsub: gossipsub({
      allowPublishToZeroTopicPeers: true,
      emitSelf: false,
      // Allow relay of all qm/inbox/* topics
      canRelayMessage: true,
    }),
  },
})

await node.start()

// ─── Print connection info ─────────────────────────────────────────────────────

console.log('\n╔════════════════════════════════════════╗')
console.log('║     Qubic Messenger Relay Running      ║')
console.log('╚════════════════════════════════════════╝\n')
console.log('Peer ID:', node.peerId.toString())
console.log('\nListening on:')
node.getMultiaddrs().forEach(ma => console.log(' ', ma.toString()))

console.log('\n── Copy one of these into your .env.local ──')
const wsAddr = node.getMultiaddrs()
  .find(ma => ma.toString().includes('/ws'))
console.log('NEXT_PUBLIC_RELAY_ADDR=' + (wsAddr?.toString() ?? '(no WS address found)'))
console.log('────────────────────────────────────────────\n')

// ─── Stats ────────────────────────────────────────────────────────────────────

// Log connected peers every 30s
setInterval(() => {
  const peers = node.getPeers()
  const conns = node.getConnections()
  console.log(`[${new Date().toISOString()}] peers: ${peers.length} | connections: ${conns.length}`)
}, 30_000)

// Graceful shutdown
process.on('SIGINT',  async () => { await node.stop(); process.exit(0) })
process.on('SIGTERM', async () => { await node.stop(); process.exit(0) })
