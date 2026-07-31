import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    const val = trimmed.slice(eq + 1);
    if (!process.env[key]) process.env[key] = val;
  }
}

export const config = {
  port: Number(process.env.PORT ?? 3004),
  api2BaseUrl: process.env.API2_BASE_URL ?? "http://127.0.0.1:3002",
  sessionCacheTtlMs: Number(process.env.SESSION_CACHE_TTL_MS ?? 300_000),
  sessionRecheckEveryActions: Number(process.env.SESSION_RECHECK_EVERY_ACTIONS ?? 10),
  /**
   * Initial world bounds, in grid cells. The world is "effectively infinite"
   * because these bounds are data fields (room.world.w/h) that the owner can
   * enlarge at runtime via `world.resize` — the movement logic never assumes a
   * hard ceiling; it only clamps to the *current* bounds.
   */
  worldWidth: Number(process.env.WORLD_WIDTH ?? 1000),
  worldHeight: Number(process.env.WORLD_HEIGHT ?? 1000),
  /** Players spawn this many cells in from the border so they are never on an edge. */
  spawnMargin: Number(process.env.SPAWN_MARGIN ?? 8),
  /** Hard cap on how large a world may be enlarged (defense against abuse). */
  maxWorldSize: Number(process.env.MAX_WORLD_SIZE ?? 1_000_000),
  disconnectGraceMs: Number(process.env.DISCONNECT_GRACE_MS ?? 30_000),
  reconnectTokenTtlMs: Number(process.env.RECONNECT_TOKEN_TTL_MS ?? 1_800_000),
  internalAdminToken: process.env.INTERNAL_ADMIN_TOKEN ?? "dev-admin-token",
  devSkipAuth: process.env.DEV_SKIP_AUTH === "true",
  maxPlayersPerRoom: Number(process.env.MAX_PLAYERS_PER_ROOM ?? 50),
  pingIntervalMs: 15_000,
  pongTimeoutMs: 45_000,
  maxMessageBytes: 8_192,
  protocolVersion: 1,
  roomCodeLength: 6,
  /**
   * The fixed "public" room code. Anyone arriving at /wander with no ?room=
   * auto-joins this room, so strangers immediately see each other. Joining a
   * non-existent room with this exact code auto-creates it on first join.
   * Keep it uppercase and exactly `roomCodeLength` chars to match the format.
   */
  publicRoomCode: (process.env.PUBLIC_ROOM_CODE ?? "PUBLIC").toUpperCase(),
  /** Rooms with no active players are GC'd after this idle window. */
  roomIdleTtlMs: Number(process.env.ROOM_IDLE_TTL_MS ?? 30 * 60 * 1000),
};
