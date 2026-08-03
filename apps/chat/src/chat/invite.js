/**
 * 邀请码生成与验证模块。
 *
 * 字符集排除易混淆字符 0/1/I/O，与 poker-realtime roomCode 保持一致。
 */
import { randomBytes } from "node:crypto";

/** 可用字符：大写字母（去掉 I、O）+ 数字（去掉 0、1） */
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * 生成随机邀请码。
 * @param {number} length 邀请码长度，默认 6
 * @returns {string} 大写邀请码字符串
 */
export function generateInviteCode(length = 6) {
  let code = "";
  const bytes = randomBytes(length);
  for (let i = 0; i < length; i += 1) {
    code += CHARS[bytes[i] % CHARS.length];
  }
  return code;
}

/**
 * 校验邀请码格式是否合法（仅格式，不检查存在性）。
 * 长度 4–10，仅包含 CHARS 中的字符。
 * @param {string} code
 * @returns {boolean}
 */
export function isValidInviteCode(code) {
  if (typeof code !== "string") return false;
  const upper = code.toUpperCase();
  if (upper.length < 4 || upper.length > 10) return false;
  for (const ch of upper) {
    if (!CHARS.includes(ch)) return false;
  }
  return true;
}
