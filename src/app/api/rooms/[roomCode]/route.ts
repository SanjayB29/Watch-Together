import { NextRequest, NextResponse } from 'next/server';
import { roomManager } from '@/server/roomManager';

// GET /api/rooms/:roomCode - Get room preview info
export async function GET(req: NextRequest, { params }: { params: { roomCode: string } }) {
  const { roomCode } = params;
  const room = roomManager.getRoom(roomCode);

  if (!room) {
    return NextResponse.json({ success: false, error: 'Room not found or expired' }, { status: 404 });
  }

  const participantCount = Object.keys(room.participants).length;
  const isFull = participantCount >= room.settings.maxParticipants;

  return NextResponse.json({
    success: true,
    room: {
      roomCode: room.roomCode,
      roomName: room.roomName,
      status: room.status,
      participantCount,
      maxParticipants: room.settings.maxParticipants,
      isFull,
      requiresPasscode: !!room.settings.passcode,
      hostOnlyControl: room.settings.hostOnlyControl,
      movieMetadata: room.movieMetadata,
    },
  });
}
