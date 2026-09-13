export type ParticipantRole = 'host' | 'viewer';
export type RoomMediaMode = 'movie' | 'screen';

export interface Participant {
  id: string;
  displayName: string;
  role: ParticipantRole;
  connected: boolean;
  joinedAt: number;
}

export interface PlaybackState {
  playing: boolean;
  position: number; // Current playback position in seconds
  timestamp: number; // Server epoch timestamp when position was recorded
  playbackRate: number;
}

export interface RoomSettings {
  hostOnlyControl: boolean;
  passcode?: string;
  maxParticipants: number;
}

export interface ScreenShareMetadata {
  label?: string; // e.g. "Screen Share"
}

export interface MovieMetadata {
  name: string;
  size: number;
  type: string;
  duration?: number;
  videoCodec?: string;
  audioCodec?: string;
  resolution?: { width: number; height: number };
  audioTracks?: Array<{ id: string; label: string; language: string }>;
  subtitles?: Array<{ id: string; label: string; language: string; format?: string }>;
}

export interface Room {
  roomId: string;
  roomCode: string;
  hostId: string;
  roomName: string;
  participants: Record<string, Participant>;
  createdAt: number;
  lastActivityAt: number;
  playback: PlaybackState;
  settings: RoomSettings;
  mediaMode: RoomMediaMode;
  movieMetadata?: MovieMetadata;
  screenShareMetadata?: ScreenShareMetadata;
  status: 'waiting' | 'playing' | 'ended';
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  isHost?: boolean;
}

// WebSocket Protocol Message Types
export type WSClientMessage =
  | { type: 'ROOM_JOIN'; roomId?: string; roomCode: string; displayName: string; passcode?: string; isHost?: boolean; hostId?: string }
  | { type: 'ROOM_LEAVE'; roomCode: string }
  | { type: 'START_WATCHING'; roomCode: string }
  | { type: 'UPDATE_MOVIE_METADATA'; roomCode: string; metadata: MovieMetadata }
  // WebRTC Signaling
  | { type: 'SIGNAL_OFFER'; roomCode: string; targetPeerId: string; sdp: any }
  | { type: 'SIGNAL_ANSWER'; roomCode: string; targetPeerId: string; sdp: any }
  | { type: 'SIGNAL_ICE'; roomCode: string; targetPeerId: string; candidate: any }
  // Playback Control
  | { type: 'PLAY'; roomCode: string; position: number; timestamp: number }
  | { type: 'PAUSE'; roomCode: string; position: number }
  | { type: 'SEEK'; roomCode: string; position: number }
  | { type: 'SYNC_REQUEST'; roomCode: string }
  | { type: 'SYNC_STATE'; roomCode: string; playback: PlaybackState }
  // Chat
  | { type: 'CHAT_MESSAGE'; roomCode: string; text: string }
  // Subtitles / Tracks
  | { type: 'SUBTITLE_CUE'; roomCode: string; subtitleId: string; text: string; start: number; end: number };

export type WSServerMessage =
  | { type: 'ROOM_JOINED'; room: Room; selfId: string; role: ParticipantRole }
  | { type: 'ROOM_ERROR'; message: string; code?: string }
  | { type: 'PEER_JOINED'; participant: Participant }
  | { type: 'PEER_LEFT'; participantId: string; reason?: string }
  | { type: 'ROOM_UPDATED'; room: Partial<Room> }
  | { type: 'START_WATCHING' }
  // WebRTC Signaling Relay
  | { type: 'SIGNAL_OFFER'; senderPeerId: string; sdp: any }
  | { type: 'SIGNAL_ANSWER'; senderPeerId: string; sdp: any }
  | { type: 'SIGNAL_ICE'; senderPeerId: string; candidate: any }
  // Playback
  | { type: 'PLAY'; position: number; timestamp: number; senderId: string }
  | { type: 'PAUSE'; position: number; senderId: string }
  | { type: 'SEEK'; position: number; senderId: string }
  | { type: 'SYNC_STATE'; playback: PlaybackState }
  // Chat
  | { type: 'CHAT_MESSAGE'; message: ChatMessage }
  // Subtitle
  | { type: 'SUBTITLE_CUE'; subtitleId: string; text: string; start: number; end: number }
  // System
  | { type: 'HOST_DISCONNECTED' }
  | { type: 'ROOM_ENDED'; reason: string };
