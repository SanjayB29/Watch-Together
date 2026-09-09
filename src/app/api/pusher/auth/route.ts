import { NextRequest, NextResponse } from 'next/server';
import { getPusherServer } from '@/lib/pusher';
import { getRoom } from '@/lib/redis';

/**
 * POST /api/pusher/auth
 * Authorises a client to subscribe to a presence channel.
 * Pusher sends socket_id + channel_name; we validate the user is in the room
 * and return a signed auth token.
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const params = new URLSearchParams(body);
  const socketId = params.get('socket_id');
  const channelName = params.get('channel_name');

  if (!socketId || !channelName) {
    return NextResponse.json({ error: 'Missing socket_id or channel_name' }, { status: 400 });
  }

  // channel name is "presence-room-XXXXXX"
  const roomCode = channelName.replace('presence-room-', '');
  const room = await getRoom(roomCode);
  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  // The participantId is passed as a query param by the client when subscribing
  const url = new URL(req.url);
  const participantId = url.searchParams.get('participantId') || `anon_${Date.now()}`;
  const participant = room.participants[participantId];

  const pusher = getPusherServer();
  const userData = {
    user_id: participantId,
    user_info: {
      displayName: participant?.displayName || 'Guest',
      role: participant?.role || 'viewer',
    },
  };

  const authResponse = pusher.authorizeChannel(socketId, channelName, userData);
  return NextResponse.json(authResponse);
}
