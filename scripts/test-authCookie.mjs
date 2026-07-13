import assert from "node:assert/strict";
import {
  AUTH_COOKIE_NAME,
  buildAuthCookieSetString,
  generateAuthCookieValue,
  parseAuthCookieValue,
  readAuthCookieRaw,
} from "../apps/web/src/lib/authCookie.ts";

assert.equal(AUTH_COOKIE_NAME, "auth-uuid");

const value = "11111111-2222-3333-4444-555555555555#1710000000000";
assert.deepEqual(parseAuthCookieValue(value), {
  uuid: "11111111-2222-3333-4444-555555555555",
  createdAt: 1710000000000,
});
assert.equal(parseAuthCookieValue(encodeURIComponent(value))?.uuid, parseAuthCookieValue(value)?.uuid);

const generated = generateAuthCookieValue(1710000000000);
assert.match(generated, /^[0-9a-f-]{36}#1710000000000$/);

assert.match(
  buildAuthCookieSetString(value, "www.lilnong.top"),
  /^auth-uuid=.*; max-age=\d+; path=\/; SameSite=Lax; domain=lilnong\.top$/
);
assert.match(
  buildAuthCookieSetString(value, "lilnong.top"),
  /domain=lilnong\.top$/
);
assert.match(
  buildAuthCookieSetString(value, "localhost"),
  /^auth-uuid=.*; max-age=\d+; path=\/; SameSite=Lax$/
);
assert.doesNotMatch(buildAuthCookieSetString(value, "localhost"), /domain=/);

assert.equal(
  readAuthCookieRaw({ cookie: "foo=bar; auth-uuid=abc%23def; baz=qux" }),
  "abc%23def"
);

console.log("authCookie tests passed");
