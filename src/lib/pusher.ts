import Pusher from 'pusher';
import PusherJS from 'pusher-js';

// ── Server-side Pusher instance (used in API routes only) ──────────────────
export function getPusherServer(): Pusher {
  return new Pusher({
    appId: process.env.PUSHER_APP_ID!,
    key: process.env.NEXT_PUBLIC_PUSHER_KEY!,
    secret: process.env.PUSHER_SECRET!,
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    useTLS: true,
  });
}

// ── Client-side Pusher instance ────────────────────────────────────────────
// participantId is baked into the auth endpoint so the server can look up the
// participant without needing a separate session cookie.
let clientInstance: PusherJS | null = null;
let clientInstanceParticipantId: string | null = null;

export function getPusherClient(participantId?: string): PusherJS {
  // Create a new instance if we don't have one, or if participantId changed
  if (!clientInstance || (participantId && participantId !== clientInstanceParticipantId)) {
    clientInstanceParticipantId = participantId ?? null;
    const authEndpoint = participantId
      ? `/api/pusher/auth?participantId=${encodeURIComponent(participantId)}`
      : '/api/pusher/auth';
    clientInstance = new PusherJS(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      channelAuthorization: {
        endpoint: authEndpoint,
        transport: 'ajax',
      },
    });
  }
  return clientInstance;
}

// Channel name for a room — all participants subscribe to this
export function roomChannel(roomCode: string) {
  return `presence-room-${roomCode.toUpperCase()}`;
}
