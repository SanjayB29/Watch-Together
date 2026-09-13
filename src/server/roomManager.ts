import { Room, Participant, PlaybackState, RoomSettings, MovieMetadata, RoomMediaMode, ScreenShareMetadata } from '../types';

export class RoomManager {
  private rooms: Map<string, Room> = new Map(); // key: roomCode
  private roomBySocketId: Map<string, { roomCode: string; participantId: string }> = new Map();

  // Create a new room
  public createRoom(
    roomCode: string,
    hostId: string,
    hostName: string,
    roomName: string = 'Watch Party',
    settings: Partial<RoomSettings> = {},
    movieMetadata?: MovieMetadata,
    mediaMode: RoomMediaMode = 'movie',
    screenShareMetadata?: ScreenShareMetadata
  ): Room {
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
      roomCode: roomCode.toUpperCase(),
      hostId,
      roomName,
      participants: { [hostId]: hostParticipant },
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      playback,
      settings: fullSettings,
      mediaMode,
      movieMetadata,
      screenShareMetadata,
      status: 'waiting',
    };

    this.rooms.set(room.roomCode, room);
    return room;
  }

  public getRoom(roomCode: string): Room | undefined {
    return this.rooms.get(roomCode.toUpperCase());
  }

  public registerSocket(socketId: string, roomCode: string, participantId: string) {
    this.roomBySocketId.set(socketId, { roomCode: roomCode.toUpperCase(), participantId });
  }

  public getSocketRegistration(socketId: string) {
    return this.roomBySocketId.get(socketId);
  }

  public unregisterSocket(socketId: string) {
    this.roomBySocketId.delete(socketId);
  }

  public joinRoom(
    roomCode: string,
    participantId: string,
    displayName: string,
    passcode?: string
  ): { success: boolean; room?: Room; error?: string; role?: 'host' | 'viewer' } {
    const code = roomCode.toUpperCase();
    const room = this.rooms.get(code);

    if (!room) {
      return { success: false, error: 'Room not found or expired' };
    }

    if (room.status === 'ended') {
      return { success: false, error: 'This watch party has already ended' };
    }

    // Check passcode
    if (room.settings.passcode && room.settings.passcode !== passcode) {
      return { success: false, error: 'Invalid room passcode' };
    }

    const currentCount = Object.keys(room.participants).length;
    const existing = room.participants[participantId];

    // Check if host was already created during POST /api/rooms with this hostId
    const isHost = participantId === room.hostId;

    if (!existing && !isHost && currentCount >= room.settings.maxParticipants) {
      return { success: false, error: `Room is full (max ${room.settings.maxParticipants} participants)` };
    }
    const participant: Participant = existing || {
      id: participantId,
      displayName: displayName || `Guest ${currentCount + 1}`,
      role: isHost ? 'host' : 'viewer',
      connected: true,
      joinedAt: Date.now(),
    };

    participant.connected = true;
    if (displayName) participant.displayName = displayName;

    room.participants[participantId] = participant;
    room.lastActivityAt = Date.now();

    return { success: true, room, role: participant.role };
  }

  public leaveRoom(roomCode: string, participantId: string): { room?: Room; isHost: boolean; isEmpty: boolean } {
    const code = roomCode.toUpperCase();
    const room = this.rooms.get(code);
    if (!room) return { isHost: false, isEmpty: true };

    const isHost = room.hostId === participantId;
    delete room.participants[participantId];
    room.lastActivityAt = Date.now();

    const remainingParticipants = Object.keys(room.participants);
    const isEmpty = remainingParticipants.length === 0;

    if (isEmpty) {
      this.rooms.delete(code);
    } else if (isHost) {
      // If host disconnected, mark room status
      room.status = 'ended';
    }

    return { room, isHost, isEmpty };
  }

  public updatePlayback(roomCode: string, playback: Partial<PlaybackState>): PlaybackState | null {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) return null;

    room.playback = {
      ...room.playback,
      ...playback,
      timestamp: Date.now(),
    };
    room.lastActivityAt = Date.now();
    return room.playback;
  }

  public updateMovieMetadata(roomCode: string, metadata: MovieMetadata): boolean {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) return false;
    room.movieMetadata = metadata;
    room.lastActivityAt = Date.now();
    return true;
  }

  public setRoomStatus(roomCode: string, status: Room['status']): boolean {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) return false;
    room.status = status;
    room.lastActivityAt = Date.now();
    return true;
  }

  // Periodic cleanup for stale rooms (> 24 hours inactive)
  public cleanupStaleRooms(maxAgeMs = 24 * 60 * 60 * 1000) {
    const now = Date.now();
    this.rooms.forEach((room, code) => {
      if (now - room.lastActivityAt > maxAgeMs) {
        this.rooms.delete(code);
      }
    });
  }
}

// Global singleton using globalThis to share state between Next.js API routes, workers, and custom server
const globalForRooms = globalThis as unknown as {
  roomManager: RoomManager | undefined;
};

export const roomManager = globalForRooms.roomManager ?? new RoomManager();

if (process.env.NODE_ENV !== 'production') {
  globalForRooms.roomManager = roomManager;
}
