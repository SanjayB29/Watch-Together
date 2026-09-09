import { Redis } from '@upstash/redis';

// Singleton Redis client — safe to import in both API routes and server-side code
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const ROOM_TTL = 60 * 60 * 24; // 24 hours in seconds

export function roomKey(roomCode: string) {
  return `room:${roomCode.toUpperCase()}`;
}

export async function getRoom(roomCode: string) {
  const data = await redis.get<string>(roomKey(roomCode));
  if (!data) return null;
  // Upstash may return already-parsed objects or raw strings
  if (typeof data === 'string') return JSON.parse(data);
  return data as any;
}

export async function saveRoom(room: any) {
  await redis.set(roomKey(room.roomCode), JSON.stringify(room), { ex: ROOM_TTL });
}

export async function deleteRoom(roomCode: string) {
  await redis.del(roomKey(roomCode));
}
