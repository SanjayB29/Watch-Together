import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, Server } from 'http';
import { roomManager } from './roomManager';
import { WSClientMessage, WSServerMessage, ChatMessage } from '../types';

interface ExtendedWebSocket extends WebSocket {
  id: string;
  roomCode?: string;
  participantId?: string;
  isAlive?: boolean;
}

export function setupSignalingServer(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  // Handle HTTP upgrade to WS on /ws (and ignore Next.js HMR webpack-hmr / _next/webpack-hmr)
  server.on('upgrade', (request: IncomingMessage, socket, head) => {
    try {
      const host = request.headers.host || 'localhost:3000';
      const url = new URL(request.url || '', `http://${host}`);
      if (url.pathname === '/ws' || url.pathname === '/api/ws' || url.pathname.startsWith('/ws')) {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      }
    } catch (e) {
      console.error('Error handling upgrade:', e);
    }
  });

  const clients = new Map<string, ExtendedWebSocket>();

  // Heartbeat ping/pong to prevent stale connections
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const extWs = ws as ExtendedWebSocket;
      if (extWs.isAlive === false) return extWs.terminate();
      extWs.isAlive = false;
      extWs.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  // Broadcast to all sockets in a room
  function broadcastToRoom(roomCode: string, msg: WSServerMessage, excludeSocketId?: string) {
    const payload = JSON.stringify(msg);
    clients.forEach((client) => {
      if (client.roomCode === roomCode.toUpperCase() && client.id !== excludeSocketId && client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }

  // Send to a specific peer socket
  function sendToPeer(roomCode: string, targetPeerId: string, msg: WSServerMessage) {
    const payload = JSON.stringify(msg);
    clients.forEach((client) => {
      if (client.roomCode === roomCode.toUpperCase() && client.participantId === targetPeerId && client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }

  wss.on('connection', (ws: WebSocket) => {
    const extWs = ws as ExtendedWebSocket;
    extWs.id = `ws_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    extWs.isAlive = true;
    clients.set(extWs.id, extWs);

    extWs.on('pong', () => {
      extWs.isAlive = true;
    });

    extWs.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString()) as WSClientMessage;
        handleClientMessage(extWs, data);
      } catch (err) {
        console.error('Failed to parse WS message', err);
      }
    });

    extWs.on('close', () => {
      handleDisconnect(extWs);
    });

    extWs.on('error', (err) => {
      console.error(`Socket error for ${extWs.id}:`, err);
      handleDisconnect(extWs);
    });
  });

  function handleClientMessage(ws: ExtendedWebSocket, msg: WSClientMessage) {
    switch (msg.type) {
      case 'ROOM_JOIN': {
        const { roomCode, displayName, passcode, isHost } = msg;
        const participantId =
          (msg as any).hostId ||
          ws.participantId ||
          `user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        ws.participantId = participantId;
        ws.roomCode = roomCode.toUpperCase();

        const res = roomManager.joinRoom(roomCode, participantId, displayName, passcode);
        if (!res.success || !res.room) {
          ws.send(JSON.stringify({ type: 'ROOM_ERROR', message: res.error || 'Failed to join room' } as WSServerMessage));
          return;
        }

        roomManager.registerSocket(ws.id, roomCode, participantId);

        // Notify joining client
        ws.send(
          JSON.stringify({
            type: 'ROOM_JOINED',
            room: res.room,
            selfId: participantId,
            role: res.role || 'viewer',
          } as WSServerMessage)
        );

        // Notify other room participants
        const participant = res.room.participants[participantId];
        broadcastToRoom(
          roomCode,
          {
            type: 'PEER_JOINED',
            participant,
          },
          ws.id
        );
        break;
      }

      case 'START_WATCHING': {
        const { roomCode } = msg;
        const room = roomManager.getRoom(roomCode);
        if (room && room.hostId === ws.participantId) {
          roomManager.setRoomStatus(roomCode, 'playing');
          broadcastToRoom(roomCode, { type: 'START_WATCHING' });
        }
        break;
      }

      case 'UPDATE_MOVIE_METADATA': {
        const { roomCode, metadata } = msg;
        const room = roomManager.getRoom(roomCode);
        if (room && room.hostId === ws.participantId) {
          roomManager.updateMovieMetadata(roomCode, metadata);
          broadcastToRoom(roomCode, {
            type: 'ROOM_UPDATED',
            room: { movieMetadata: metadata },
          });
        }
        break;
      }

      // WebRTC Signaling Forwarding
      case 'SIGNAL_OFFER': {
        const { roomCode, targetPeerId, sdp } = msg;
        sendToPeer(roomCode, targetPeerId, {
          type: 'SIGNAL_OFFER',
          senderPeerId: ws.participantId!,
          sdp,
        });
        break;
      }

      case 'SIGNAL_ANSWER': {
        const { roomCode, targetPeerId, sdp } = msg;
        sendToPeer(roomCode, targetPeerId, {
          type: 'SIGNAL_ANSWER',
          senderPeerId: ws.participantId!,
          sdp,
        });
        break;
      }

      case 'SIGNAL_ICE': {
        const { roomCode, targetPeerId, candidate } = msg;
        sendToPeer(roomCode, targetPeerId, {
          type: 'SIGNAL_ICE',
          senderPeerId: ws.participantId!,
          candidate,
        });
        break;
      }

      // Playback Controls
      case 'PLAY': {
        const { roomCode, position, timestamp } = msg;
        const room = roomManager.getRoom(roomCode);
        if (!room) return;
        if (room.settings.hostOnlyControl && room.hostId !== ws.participantId) return;

        roomManager.updatePlayback(roomCode, { playing: true, position, timestamp });
        broadcastToRoom(
          roomCode,
          {
            type: 'PLAY',
            position,
            timestamp,
            senderId: ws.participantId!,
          },
          ws.id
        );
        break;
      }

      case 'PAUSE': {
        const { roomCode, position } = msg;
        const room = roomManager.getRoom(roomCode);
        if (!room) return;
        if (room.settings.hostOnlyControl && room.hostId !== ws.participantId) return;

        roomManager.updatePlayback(roomCode, { playing: false, position, timestamp: Date.now() });
        broadcastToRoom(
          roomCode,
          {
            type: 'PAUSE',
            position,
            senderId: ws.participantId!,
          },
          ws.id
        );
        break;
      }

      case 'SEEK': {
        const { roomCode, position } = msg;
        const room = roomManager.getRoom(roomCode);
        if (!room) return;
        if (room.settings.hostOnlyControl && room.hostId !== ws.participantId) return;

        roomManager.updatePlayback(roomCode, { position, timestamp: Date.now() });
        broadcastToRoom(
          roomCode,
          {
            type: 'SEEK',
            position,
            senderId: ws.participantId!,
          },
          ws.id
        );
        break;
      }

      case 'SYNC_STATE': {
        const { roomCode, playback } = msg;
        const room = roomManager.getRoom(roomCode);
        if (room && room.hostId === ws.participantId) {
          roomManager.updatePlayback(roomCode, playback);
          broadcastToRoom(
            roomCode,
            {
              type: 'SYNC_STATE',
              playback,
            },
            ws.id
          );
        }
        break;
      }

      case 'CHAT_MESSAGE': {
        const { roomCode, text } = msg;
        const room = roomManager.getRoom(roomCode);
        if (!room || !ws.participantId) return;

        const sender = room.participants[ws.participantId];
        const chatMsg: ChatMessage = {
          id: `chat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          senderId: ws.participantId,
          senderName: sender ? sender.displayName : 'Unknown',
          text: text.slice(0, 500), // Enforce length limit
          timestamp: Date.now(),
          isHost: room.hostId === ws.participantId,
        };

        // Send to all including sender
        const payload = JSON.stringify({ type: 'CHAT_MESSAGE', message: chatMsg });
        clients.forEach((client) => {
          if (client.roomCode === roomCode.toUpperCase() && client.readyState === WebSocket.OPEN) {
            client.send(payload);
          }
        });
        break;
      }

      case 'SUBTITLE_CUE': {
        const { roomCode, subtitleId, text, start, end } = msg;
        broadcastToRoom(
          roomCode,
          {
            type: 'SUBTITLE_CUE',
            subtitleId,
            text,
            start,
            end,
          },
          ws.id
        );
        break;
      }
    }
  }

  function handleDisconnect(ws: ExtendedWebSocket) {
    clients.delete(ws.id);
    if (!ws.roomCode || !ws.participantId) return;

    const { room, isHost, isEmpty } = roomManager.leaveRoom(ws.roomCode, ws.participantId);
    roomManager.unregisterSocket(ws.id);

    if (isHost && !isEmpty) {
      broadcastToRoom(ws.roomCode, { type: 'HOST_DISCONNECTED' });
    } else if (!isEmpty) {
      broadcastToRoom(ws.roomCode, { type: 'PEER_LEFT', participantId: ws.participantId });
    }
  }

  return { wss, clients, broadcastToRoom };
}
