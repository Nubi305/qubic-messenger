/**
 * @qubic-messenger/shared/p2p
 *
 * Peer-to-peer message transport built on libp2p with:
 *   - WebRTC for direct browser-to-browser connections
 *   - GossipSub for pub/sub message delivery by recipient topic
 *   - Circuit relay fallback when direct connections fail
 *
 * Each user subscribes to a topic derived from their Qubic wallet address.
 * Messages are already E2EE before they hit this layer — P2P only handles routing.
 */

import { createLibp2p } from 'libp2p';
import { webRTC } from '@libp2p/webrtc';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { identify } from '@libp2p/identify';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import type { Libp2p } from 'libp2p';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MessageHandler = (
  senderTopic: string,
  encryptedBlob: Uint8Array
) => void;

// ─── Topic Derivation ─────────────────────────────────────────────────────────

/**
 * Derive a GossipSub topic for a Qubic identity.
 * Format: "qm/inbox/{address}"
 */
export function inboxTopic(qubicAddress: string): string {
  return `qm/inbox/${qubicAddress}`;
}

// ─── P2P Node ─────────────────────────────────────────────────────────────────

export class MessengerP2P {
  private node: Libp2p | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private subscribedTopics: Set<string> = new Set();

  /**
   * Start the libp2p node and subscribe to the local user's inbox topic.
   *
   * @param myAddress     Qubic wallet address (used to derive inbox topic)
   * @param relayAddress  Multiaddr of bootstrap/relay node (required for WebRTC signalling)
   */
  async start(myAddress: string, relayAddress?: string): Promise<void> {
    const bootstrapList = relayAddress ? [relayAddress] : [];

    this.node = await createLibp2p({
      transports: [
        webRTC(),
        circuitRelayTransport({ discoverRelays: 1 }),
      ],
      connectionEncrypters: [noise()],
      streamMuxers: [yamux()],
      services: {
        pubsub: gossipsub({
          allowPublishToZeroTopicPeers: true,
          emitSelf: false,
        }),
        identify: identify(),
      },
    });

    await this.node.start();

    // Connect to bootstrap/relay node if provided
    if (relayAddress) {
      try {
        await this.node.dial(relayAddress as any);
      } catch (e) {
        console.warn('[P2P] Could not connect to relay:', e);
      }
    }

    // Subscribe to own inbox
    this.subscribeToInbox(myAddress);

    console.log('[P2P] Node started, peer id:', this.node.peerId.toString());
  }

  /**
   * Subscribe to receive messages addressed to a specific Qubic address.
   * Call this for your own address on startup. Also useful for group inboxes.
   */
  subscribeToInbox(address: string): void {
    if (!this.node) throw new Error('P2P node not started');
    const topic = inboxTopic(address);
    if (this.subscribedTopics.has(topic)) return;

    (this.node.services.pubsub as any).subscribe(topic);
    this.subscribedTopics.add(topic);

    (this.node.services.pubsub as any).addEventListener('message', (evt: any) => {
      if (evt.detail.topic === topic) {
        this.handlers.forEach(h => h(topic, evt.detail.data));
      }
    });
  }

  /**
   * Publish an encrypted blob to a recipient's inbox topic.
   * The blob must already be encrypted (serializeMessage output).
   */
  async publish(recipientAddress: string, encryptedBlob: Uint8Array): Promise<void> {
    if (!this.node) throw new Error('P2P node not started');
    const topic = inboxTopic(recipientAddress);
    await (this.node.services.pubsub as any).publish(topic, encryptedBlob);
  }

  /**
   * Register a handler for all incoming messages on subscribed topics.
   */
  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async stop(): Promise<void> {
    await this.node?.stop();
    this.node = null;
  }

  getPeerId(): string {
    return this.node?.peerId.toString() ?? '';
  }

  getPeerCount(): number {
    return this.node?.getPeers().length ?? 0;
  }
}
