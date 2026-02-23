# Qubic Messenger — P2P Relay

A lightweight libp2p relay + GossipSub node. Deploy on any cheap VPS.

## Deploy in 5 minutes (Ubuntu VPS)

```bash
# 1. SSH into your VPS
ssh root@YOUR_VPS_IP

# 2. Install Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 3. Clone and install
git clone https://github.com/Nubi305/qubic-messenger.git
cd qubic-messenger/relay
npm install

# 4. Run it
node relay.js
```

## Keep it running with PM2

```bash
npm install -g pm2
pm2 start relay.js --name qubic-relay
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

## Open firewall ports

```bash
# On your VPS (Ubuntu/ufw)
ufw allow 4001/tcp   # libp2p TCP
ufw allow 4002/tcp   # libp2p WebSockets
```

## Connect your frontend

Copy the WebSocket multiaddr printed on startup into your frontend `.env.local`:

```
NEXT_PUBLIC_RELAY_ADDR=/ip4/YOUR_VPS_IP/tcp/4002/ws/p2p/12D3KooW...
```

## Recommended VPS providers

| Provider    | Cheapest plan | Notes |
|-------------|--------------|-------|
| Hetzner     | €4/mo        | Best value, EU |
| DigitalOcean| $6/mo        | Easy UI |
| Vultr       | $6/mo        | Global locations |
| Oracle Cloud| Free tier    | Always free ARM instance |
