export const ErrorCodes = {
  AUTH_REQUIRED: "AUTH_REQUIRED",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  FORBIDDEN: "FORBIDDEN",
  ROOM_NOT_FOUND: "ROOM_NOT_FOUND",
  ROOM_FULL: "ROOM_FULL",
  NOT_IN_ROOM: "NOT_IN_ROOM",
  NOT_OWNER: "NOT_OWNER",
  INVALID_ACTION: "INVALID_ACTION",
  OUT_OF_BOUNDS: "OUT_OF_BOUNDS",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  ROOM_CREATE_FAILED: "ROOM_CREATE_FAILED",
};

const retryable = new Set([ErrorCodes.RATE_LIMITED]);

export function makeError(code, message = code, extra = {}) {
  return {
    code,
    message,
    retryable: retryable.has(code),
    ...extra,
  };
}
