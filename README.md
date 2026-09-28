# 🎬 CineLink

**Watch movies together, in perfect sync — no installs, no accounts, no buffering wars.**

CineLink is a real-time co-watching platform where the host plays a local video file and streams it live to up to 4 guests via peer-to-peer WebRTC. A shared chat, subtitle support, and millisecond-accurate playback sync make it feel like you're in the same room.

---

## ✨ Features

| Feature | Details |
|---|---|
| 🎥 **P2P Video Streaming** | Host captures their local file via `captureStream()` and streams it directly to each viewer over WebRTC — no upload, no server storage |
| ⏯ **Synchronized Playback** | Play, pause, and seek events are broadcast instantly to all participants and reconciled with timestamp-based drift correction |
| 💬 **Live Chat** | Real-time room-scoped chat with host badges and a 500-character message limit |
| 📝 **Subtitle Sharing** | Host parses `.srt`/`.vtt` files client-side and broadcasts subtitle cues to all viewers in sync |
| 🔒 **Passcode-Protected Rooms** | Optional room passcode keeps your watch party private |
| 👑 **Host-Only Controls** | Toggle whether only the host can play/pause/seek, or allow all participants to control playback |
| 🧹 **Auto Room Cleanup** | Rooms are automatically removed after 24 hours of inactivity |

---

## 🏗 Architecture

```
Browser (Host)                    Node.js Server                  Browser (Viewer N)
──────────────                    ──────────────                  ─────────────────
 Local video file
      │
 captureStream()
      │
 HostWebRTCManager ──── SDP/ICE ──► WebSocket Signaling ◄── SDP/ICE ── ViewerWebRTCManager
                                         (ws://…/ws)
                                              │
                                         RoomManager
                                    (in-memory room state)
      │◄──────────────── PLAY/PAUSE/SEEK/CHAT ──────────────────────►│
```

- **Custom HTTP + WebSocket server** ([`server.ts`](server.ts)) — a single Node.js process runs both the Next.js app and the `ws` signaling server on the same port.
- **Signaling** ([`src/server/signaling.ts`](src/server/signaling.ts)) — forwards WebRTC offer/answer/ICE messages between peers and broadcasts playback control and chat events.
- **Room Manager** ([`src/server/roomManager.ts`](src/server/roomManager.ts)) — in-memory room state (participants, playback position, settings) with a global singleton shared across Next.js API routes and the custom server.
- **WebRTC** ([`src/lib/webrtc.ts`](src/lib/webrtc.ts)) — `HostWebRTCManager` handles per-viewer `RTCPeerConnection` lifecycle, renegotiation glare prevention, and deferred offers. `ViewerWebRTCManager` handles incoming streams and ICE queuing.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9

### Install & Run

```bash
# Install dependencies
npm install

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

A few seconds after startup you will also see a **public Cloudflare tunnel URL** printed in the terminal:

```
┌─────────────────────────────────────────────────────────┐
│  🌐 Public tunnel active — share this link with viewers  │
│  https://xxxx-xxxx.trycloudflare.com                    │
└─────────────────────────────────────────────────────────┘
```

Share that URL with anyone on the internet — they can join your room without any additional setup. The tunnel is a free [Cloudflare Quick Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/) that requires no account. It is only started in development mode (`npm run dev`) and is automatically cleaned up when you stop the server.

### Production

```bash
npm run build
npm start
```

---

## 🎮 How to Use

### Host

1. Go to **Create Room** and enter a room name, your display name, and an optional passcode.
2. You'll land in the **Waiting Room** — share the 6-character room code with friends.
3. Once everyone has joined, click **Start Watching**.
4. Pick a local video file from your device — it starts streaming instantly to all viewers.

### Viewer

1. Go to **Join Room** and enter the room code (and passcode if required).
2. Wait in the lobby until the host starts the session.
3. The host's video streams directly to your browser — no download required.

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 14](https://nextjs.org) (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Real-time | WebSockets (`ws`) + WebRTC |
| Icons | Lucide React |
| Server | Custom Node.js HTTP + WS server (`tsx`) |

---

## 📁 Project Structure

```
├── server.ts                   # Entry point — HTTP + WebSocket server
├── src/
│   ├── app/                    # Next.js App Router pages & API routes
│   │   ├── page.tsx            # Landing page
│   │   ├── create/             # Create room flow
│   │   ├── join/               # Join room flow
│   │   ├── r/[roomCode]/       # Watch room page
│   │   └── api/rooms/          # REST API for room creation/lookup
│   ├── components/
│   │   ├── CinemaPlayer.tsx    # Video player with playback controls
│   │   ├── WaitingRoom.tsx     # Pre-session lobby
│   │   └── ChatPanel.tsx       # Live chat sidebar
│   ├── lib/
│   │   ├── webrtc.ts           # HostWebRTCManager & ViewerWebRTCManager
│   │   ├── syncEngine.ts       # Playback drift correction logic
│   │   ├── subtitleParser.ts   # SRT/VTT parser
│   │   ├── mediaInspector.ts   # Video codec/resolution inspector
│   │   └── fileStore.ts        # Client-side file handle store
│   ├── server/
│   │   ├── signaling.ts        # WebSocket signaling server
│   │   └── roomManager.ts      # In-memory room & participant manager
│   └── types/
│       └── index.ts            # Shared TypeScript types & WS protocol
```

---

## ⚙️ Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `NODE_ENV` | `development` | Set to `production` for production builds |

---
## Star History

<a href="https://www.star-history.com/?repos=sanjayb29%2Fwatch-together&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=sanjayb29/watch-together&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=sanjayb29/watch-together&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=sanjayb29/watch-together&type=date&legend=top-left" />
 </picture>
</a>
## 📄 License

MIT
