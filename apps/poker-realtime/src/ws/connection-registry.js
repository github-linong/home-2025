/** @type {Map<string, { ws: import('ws').WebSocket, userId: string, roomId: string|null, cookie: string }>} */
export const connectionsById = new Map();

/** @type {Map<string, string>} userId -> connId */
export const activeUserConn = new Map();

let connCounter = 0;

export function registerConnection(ws, userId, cookie) {
  const connId = `conn_${++connCounter}`;
  const existingConnId = activeUserConn.get(userId);
  if (existingConnId) {
    const existing = connectionsById.get(existingConnId);
    if (existing?.ws) {
      existing.ws.send(
        JSON.stringify({
          type: "session.kicked",
          userId,
          reason: "duplicate_connection",
        }),
      );
      existing.ws.close(4002, "duplicate_connection");
    }
    connectionsById.delete(existingConnId);
  }

  connectionsById.set(connId, { ws, userId, roomId: null, cookie });
  activeUserConn.set(userId, connId);
  return connId;
}

export function removeConnection(connId) {
  const conn = connectionsById.get(connId);
  if (conn) {
    if (activeUserConn.get(conn.userId) === connId) {
      activeUserConn.delete(conn.userId);
    }
    connectionsById.delete(connId);
  }
}

export function getConnection(connId) {
  return connectionsById.get(connId);
}

export function setRoom(connId, roomId) {
  const conn = connectionsById.get(connId);
  if (conn) conn.roomId = roomId;
}

export function broadcastToRoom(room, message, exceptUserId = null) {
  for (const [, conn] of connectionsById) {
    if (conn.roomId !== room.roomId) continue;
    if (exceptUserId && conn.userId === exceptUserId) continue;
    if (conn.ws.readyState === 1) {
      conn.ws.send(JSON.stringify(message));
    }
  }
}

export function sendToUser(userId, message) {
  const connId = activeUserConn.get(userId);
  if (!connId) return;
  const conn = connectionsById.get(connId);
  if (conn?.ws.readyState === 1) {
    conn.ws.send(JSON.stringify(message));
  }
}

export function sendToConn(connId, message) {
  const conn = connectionsById.get(connId);
  if (conn?.ws.readyState === 1) {
    conn.ws.send(JSON.stringify(message));
  }
}

export function kickUser(userId, reason = "kicked") {
  const connId = activeUserConn.get(userId);
  if (!connId) return false;
  const conn = connectionsById.get(connId);
  const roomId = conn?.roomId ?? null;
  const payload = { type: "session.kicked", userId, reason };
  if (conn?.ws) {
    try {
      conn.ws.send(JSON.stringify(payload));
    } catch {
      /* ignore */
    }
    conn.ws.close(4001, reason);
  }
  // Notify others in the same room (excluding the kicked user).
  if (roomId) {
    for (const [, c] of connectionsById) {
      if (c.roomId !== roomId || c.userId === userId) continue;
      if (c.ws.readyState === 1) {
        try {
          c.ws.send(JSON.stringify(payload));
        } catch {
          /* ignore */
        }
      }
    }
  }
  removeConnection(connId);
  return true;
}

export function kickConnection(connId, userId, reason = "session_expired") {
  const conn = connectionsById.get(connId);
  if (!conn) return false;
  const payload = { type: "session.kicked", userId, reason };
  if (conn.ws.readyState === 1) {
    try {
      conn.ws.send(JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }
  if (conn.roomId) {
    for (const [, c] of connectionsById) {
      if (c.roomId !== conn.roomId || c.userId === userId) continue;
      if (c.ws.readyState === 1) {
        try {
          c.ws.send(JSON.stringify(payload));
        } catch {
          /* ignore */
        }
      }
    }
  }
  try {
    conn.ws.close(4401, reason);
  } catch {
    /* ignore */
  }
  removeConnection(connId);
  return true;
}

export function getConnectionsInRoom(roomId) {
  return [...connectionsById.entries()]
    .filter(([, c]) => c.roomId === roomId)
    .map(([id, c]) => ({ connId: id, ...c }));
}
