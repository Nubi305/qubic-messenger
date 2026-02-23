# qubic-messenger

A decentralized, end-to-end encrypted messaging app built on [Qubic](https://qubic.org) — feeless, pseudonymous, and fully open source.

## Architecture

```
qubic-messenger/
├── contract/          # Qubic smart contract (C++ / QPI)
├── frontend/
│   ├── web/           # Next.js web app
│   └── mobile/        # React Native app (Expo)
├── shared/            # Shared crypto, types, Qubic client logic (TypeScript)
├── scripts/           # Deployment & dev utilities
└── .github/workflows/ # CI/CD
```

## How it works

1. **Register** — User registers a nickname + X25519 public key on-chain via smart contract.
2. **Discover** — Look up any nickname to retrieve their public key.
3. **Encrypt** — Client derives a shared secret (X25519 ECDH) and encrypts messages with XSalsa20-Poly1305 via libsodium.
4. **Deliver** — Encrypted blob is sent peer-to-peer via libp2p/WebRTC. Never touches the server in plaintext.
5. **Prove** — Optionally post a content hash + metadata to the contract for on-chain delivery proof.

## Quick Start

### Prerequisites

- Node.js >= 18
- pnpm >= 8
- Qubic wallet seed (for contract interaction)
- Expo CLI (for mobile)

### Install

```bash
pnpm install
```

### Web

```bash
cd frontend/web
pnpm dev
```

### Mobile

```bash
cd frontend/mobile
pnpm start
```

### Smart Contract

See [`contract/README.md`](contract/README.md) for compilation and deployment instructions.

## Security Model

- **E2EE**: `crypto_box_easy` (X25519 + XSalsa20-Poly1305). Only sender and recipient can read messages.
- **No plaintext on-chain**: Only BLAKE2b-256 hashes of encrypted blobs are posted.
- **Anti-replay**: Strictly increasing nonces enforced in contract.
- **Key storage**: Private keys wrapped with AES-GCM derived from user seed before IndexedDB storage.
- **No phone/email**: Qubic wallet identity is your pseudonymous ID.

## Roadmap

- [x] MVP: Registration, lookup, P2P messaging, on-chain metadata
- [ ] Double Ratchet (Signal Protocol) for forward secrecy
- [ ] Group chats with shared symmetric keys
- [ ] Voice/video note support (IPFS blob + CID delivery)
- [ ] Offline inbox via IPFS pinning
- [ ] Nickname staking / anti-spam market

## License

MIT
