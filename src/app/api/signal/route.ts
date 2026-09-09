import { NextRequest, NextResponse } from 'next/server';
import { getPusherServer, roomChannel } from '@/lib/pusher';
import { getRoom, saveRoom, deleteRoom } from '@/lib/redis';
import { ChatMessage } from '@/types';

/**
 * POST /api/signal
 * Single signaling endpoint that all clients post messages to.
 * The server validates the message, mutates room state in Redis when needed,
 * then triggers the appropriate Pusher event on the room channel.
 *
 * This replaces the custom ws-based signaling server so the app runs on Vercel.
 */
export async function POST(req: NextRequest) {
  try {
    const msg = await req.json();
    const { type, roomCode: rawCode } = msg;
    if (!type || !rawCode) {
      return NextResponse.json({ error: 'Missing type or roomCode' }, { status: 400 });
    }

    const roomCode = rawCode.toUpperCase();
    const channel = roomChannel(roomCode);
    const pusher = getPusherServer();

    // ── Helper: trigger without throwing on missing room ──────────────────
    const trigger = (event: string, data: object) =>
      pusher.trigger(channel, event, data).catch((e) => console.error('[signal] pusher trigger error:', e));

    switch (type) {
      // ── Room join / presence ─────────────────────────────────────────────
      case 'ROOM_JOIN': {
        const { participantId, displayName, passcode, isHost, hostId } = msg;
        const room = await getRoom(roomCode);
        if (!room) {
          return NextResponse.json({ success: false, error: 'Room not found or expired' }, { status: 404 });
        }
        if (room.status === 'ended') {
          return NextResponse.json({ success: false, error: 'This watch party has already ended' }, { status: 410 });
        }
        if (room.settings.passcode && room.settings.passcode !== passcode) {
          return NextResponse.json({ success: false, error: 'Invalid room passcode' }, { status: 403 });
        }

        const resolvedId = (isHost ? hostId : null) || participantId;
        const existing = room.participants[resolvedId];
        const isRoomHost = resolvedId === room.hostId;
        const currentCount = Object.keys(room.participants).length;

        if (!existing && !isRoomHost && currentCount >= room.settings.maxParticipants) {
          return NextResponse.json({ success: false, error: `Room is full (max ${room.settings.maxParticipants})` }, { status: 409 });
        }

        const participant = existing || {
          id: resolvedId,
          displayName: displayName || `Guest ${currentCount + 1}`,
          role: isRoomHost ? 'host' : 'viewer',
          connected: true,
          joinedAt: Date.now(),
        };
        participant.connected = true;
        if (displayName) participant.displayName = displayName;

        room.participants[resolvedId] = participant;
        room.lastActivityAt = Date.now();
        await saveRoom(room);

        // Notify other members
        await trigger('PEER_JOINED', { participant });

        return NextResponse.json({
          success: true,
          room,
          selfId: resolvedId,
          role: participant.role,
        });
      }

      // ── Room start watching ──────────────────────────────────────────────
      case 'START_WATCHING': {
        const { participantId } = msg;
        const room = await getRoom(roomCode);
        if (!room || room.hostId !== participantId) break;
        room.status = 'playing';
        room.lastActivityAt = Date.now();
        await saveRoom(room);
        await trigger('START_WATCHING', {});
        break;
      }

      // ── Movie metadata ───────────────────────────────────────────────────
      case 'UPDATE_MOVIE_METADATA': {
        const { participantId, metadata } = msg;
        const room = await getRoom(roomCode);
        if (!room || room.hostId !== participantId) break;
        room.movieMetadata = metadata;
        room.lastActivityAt = Date.now();
        await saveRoom(room);
        await trigger('ROOM_UPDATED', { room: { movieMetadata: metadata } });
        break;
      }

      // ── WebRTC Signaling relay (peer-to-peer, just forward) ─────────────
      case 'SIGNAL_OFFER': {
        const { targetPeerId, senderPeerId, sdp } = msg;
        await trigger(`SIGNAL_OFFER_${targetPeerId}`, { senderPeerId, sdp });
        break;
      }
      case 'SIGNAL_ANSWER': {
        const { targetPeerId, senderPeerId, sdp } = msg;
        await trigger(`SIGNAL_ANSWER_${targetPeerId}`, { senderPeerId, sdp });
        break;
      }
      case 'SIGNAL_ICE': {
        const { targetPeerId, senderPeerId, candidate } = msg;
        await trigger(`SIGNAL_ICE_${targetPeerId}`, { senderPeerId, candidate });
        break;
      }

      // ── Playback controls ────────────────────────────────────────────────
      case 'PLAY': {
        const { participantId, position, timestamp } = msg;
        const room = await getRoom(roomCode);
        if (!room) break;
        if (room.settings.hostOnlyControl && room.hostId !== participantId) break;
        room.playback = { ...room.playback, playing: true, position, timestamp: Date.now() };
        room.lastActivityAt = Date.now();
        await saveRoom(room);
        await trigger('PLAY', { position, timestamp, senderId: participantId });
        break;
      }
      case 'PAUSE': {
        const { participantId, position } = msg;
        const room = await getRoom(roomCode);
        if (!room) break;
        if (room.settings.hostOnlyControl && room.hostId !== participantId) break;
        room.playback = { ...room.playback, playing: false, position, timestamp: Date.now() };
        room.lastActivityAt = Date.now();
        await saveRoom(room);
        await trigger('PAUSE', { position, senderId: participantId });
        break;
      }
      case 'SEEK': {
        const { participantId, position } = msg;
        const room = await getRoom(roomCode);
        if (!room) break;
        if (room.settings.hostOnlyControl && room.hostId !== participantId) break;
        room.playback = { ...room.playback, position, timestamp: Date.now() };
        room.lastActivityAt = Date.now();
        await saveRoom(room);
        await trigger('SEEK', { position, senderId: participantId });
        break;
      }
      case 'SYNC_STATE': {
        const { participantId, playback } = msg;
        const room = await getRoom(roomCode);
        if (!room || room.hostId !== participantId) break;
        room.playback = { ...room.playback, ...playback, timestamp: Date.now() };
        room.lastActivityAt = Date.now();
        await saveRoom(room);
        await trigger('SYNC_STATE', { playback: room.playback });
        break;
      }

      // ── Chat ─────────────────────────────────────────────────────────────
      case 'CHAT_MESSAGE': {
        const { participantId, text } = msg;
        const room = await getRoom(roomCode);
        if (!room || !participantId) break;
        const sender = room.participants[participantId];
        const chatMsg: ChatMessage = {
          id: `chat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          senderId: participantId,
          senderName: sender?.displayName || 'Unknown',
          text: String(text).slice(0, 500),
          timestamp: Date.now(),
          isHost: room.hostId === participantId,
        };
        await trigger('CHAT_MESSAGE', { message: chatMsg });
        break;
      }

      // ── Subtitles ────────────────────────────────────────────────────────
      case 'SUBTITLE_CUE': {
        const { subtitleId, text, start, end } = msg;
        await trigger('SUBTITLE_CUE', { subtitleId, text, start, end });
        break;
      }

      // ── Participant leave ─────────────────────────────────────────────────
      case 'ROOM_LEAVE': {
        const { participantId } = msg;
        const room = await getRoom(roomCode);
        if (!room) break;
        const isRoomHost = room.hostId === participantId;
        delete room.participants[participantId];
        room.lastActivityAt = Date.now();
        const isEmpty = Object.keys(room.participants).length === 0;
        if (isEmpty) {
          await deleteRoom(roomCode);
        } else {
          if (isRoomHost) room.status = 'ended';
          await saveRoom(room);
          if (isRoomHost) {
            await trigger('HOST_DISCONNECTED', {});
          } else {
            await trigger('PEER_LEFT', { participantId });
          }
        }
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown message type: ${type}` }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[/api/signal] error:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
