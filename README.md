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

## 🚢 Deploy to Vercel

CineLink is fully serverless — no custom server required. Room state lives in **Upstash Redis** and real-time events go through **Pusher**. Both have generous free tiers.

### 1. Create a Pusher app

1. Sign up at [pusher.com](https://pusher.com) → **Create App**
2. Choose any cluster (e.g. `us2`) and enable **Channels**
3. Note your **App ID**, **Key**, **Secret**, and **Cluster**

### 2. Create an Upstash Redis database

1. Sign up at [upstash.com](https://upstash.com) → **Create Database**
2. Pick any region and enable **REST API**
3. Copy the **REST URL** and **REST Token**

### 3. Deploy

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

Or connect your GitHub repo in the [Vercel dashboard](https://vercel.com/new) for automatic deploys on every push.

### 4. Set environment variables

In the Vercel project dashboard → **Settings → Environment Variables**, add:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_PUSHER_KEY` | Pusher app key |
| `NEXT_PUBLIC_PUSHER_CLUSTER` | Pusher cluster (e.g. `us2`) |
| `PUSHER_APP_ID` | Pusher app ID |
| `PUSHER_SECRET` | Pusher secret |
| `UPSTASH_REDIS_REST_URL` | Upstash REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash REST token |

Copy [`.env.local.example`](.env.local.example) as `.env.local` for local development.

---

## ⚙️ Environment Variables

See [`.env.local.example`](.env.local.example) for a full list with descriptions.

---

## 📄 License

MIT
