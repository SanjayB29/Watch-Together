import { NextRequest, NextResponse } from 'next/server';
import { getRoom, saveRoom } from '@/lib/redis';
import { getPusherServer, roomChannel } from '@/lib/pusher';
import { RoomSettings, MovieMetadata, Room, Participant, PlaybackState } from '@/types';

// POST /api/rooms — Create a room
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      hostId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      hostName = 'Host',
      roomName = 'Watch Party',
      settings = {} as Partial<RoomSettings>,
      movieMetadata = undefined as MovieMetadata | undefined,
    } = body;

    // Generate 6-char random alphanumeric room code (exclude ambiguous 0/O, 1/I)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let roomCode = '';
    for (let i = 0; i < 6; i++) {
      roomCode += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const fullSettings: RoomSettings = {
      hostOnlyControl: settings.hostOnlyControl ?? true,
      passcode: settings.passcode,
      maxParticipants: Math.min(settings.maxParticipants ?? 5, 5),
    };

    const hostParticipant: Participant = {
      id: hostId,
      displayName: hostName || 'Host',
      role: 'host',
      connected: true,
      joinedAt: Date.now(),
    };

    const playback: PlaybackState = {
      playing: false,
      position: 0,
      timestamp: Date.now(),
      playbackRate: 1.0,
    };

    const room: Room = {
      roomId: `room_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      roomCode,
      hostId,
      roomName,
      participants: { [hostId]: hostParticipant },
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      playback,
      settings: fullSettings,
      movieMetadata,
      status: 'waiting',
    };

    await saveRoom(room);

    return NextResponse.json({ success: true, room, roomCode: room.roomCode, roomId: room.roomId, hostId });
  } catch (err: any) {
    console.error('API create room error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to create room' }, { status: 500 });
  }
}
