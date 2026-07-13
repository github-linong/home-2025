"use strict";

const https = require("https");
const qs = require("querystring");
const config = require("../config/env");

let accessToken = null;
let refreshTimer = null;

function getAccessToken() {
  return accessToken;
}

function fetchAccessToken() {
  const { clientId, clientSecret } = config.baidu;
  if (!clientId || !clientSecret) {
    console.warn("[baidu] BAIDU_CLIENT_ID / BAIDU_CLIENT_SECRET not set");
    return;
  }

  const param = qs.stringify({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  https
    .get(
      {
        hostname: "aip.baidubce.com",
        path: `/oauth/2.0/token?${param}`,
        agent: false,
      },
      (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => {
          try {
            const result = JSON.parse(Buffer.concat(chunks).toString());
            accessToken = result.access_token || null;
            console.log("[baidu] access_token refreshed", Boolean(accessToken));
            const expiresIn = Number(result.expires_in || 2592000);
            clearTimeout(refreshTimer);
            // Node setTimeout max is 2^31-1 ms (~24.8d); keep a safe refresh window
            const delayMs = Math.min(
              Math.max(60, expiresIn - 300) * 1000,
              12 * 60 * 60 * 1000
            );
            refreshTimer = setTimeout(fetchAccessToken, delayMs);
          } catch (err) {
            console.error("[baidu] token parse failed", err.message);
            refreshTimer = setTimeout(fetchAccessToken, 300000);
          }
        });
      }
    )
    .on("error", (err) => {
      console.error("[baidu] token request failed", err.message);
      refreshTimer = setTimeout(fetchAccessToken, 300000);
    });
}

module.exports = {
  getAccessToken,
  fetchAccessToken,
};
