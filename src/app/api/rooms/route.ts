import { NextRequest, NextResponse } from 'next/server';
import { roomManager } from '@/server/roomManager';
import { RoomSettings, MovieMetadata, RoomMediaMode } from '@/types';

// POST /api/rooms - Create a room
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      hostId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      hostName = 'Host',
      roomName = 'Watch Party',
      settings = {} as Partial<RoomSettings>,
      movieMetadata = undefined as MovieMetadata | undefined,
      mediaMode = 'movie' as RoomMediaMode,
    } = body;

    // Generate 6-char random alphanumeric room code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // exclude ambiguous 0/O, 1/I
    let roomCode = '';
    for (let i = 0; i < 6; i++) {
      roomCode += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const screenShareMetadata = mediaMode === 'screen' ? { label: 'Screen Share' } : undefined;

    const room = roomManager.createRoom(
      roomCode,
      hostId,
      hostName,
      roomName,
      settings,
      movieMetadata,
      mediaMode,
      screenShareMetadata
    );

    return NextResponse.json({
      success: true,
      room,
      roomCode: room.roomCode,
      roomId: room.roomId,
      hostId,
    });
  } catch (err: any) {
    console.error('API create room error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to create room' }, { status: 500 });
  }
}
