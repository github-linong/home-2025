"use strict";

const express = require("express");
const request = require("request");
const sha1 = require("sha1");
const config = require("../config/env");

const router = express.Router();

let wxAccessToken = "";
let wxJsapiTicket = "";
let accessTokenTimer = null;
let ticketTimer = null;

function refreshAccessToken() {
  const { appId, appSecret } = config.wechat;
  if (!appId || !appSecret) {
    console.warn("[wechat] WX_APPID / WX_APP_SECRET not set");
    return;
  }
  request.get(
    {
      url: `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`,
    },
    (error, response, body) => {
      clearTimeout(accessTokenTimer);
      try {
        body = JSON.parse(body);
      } catch {
        accessTokenTimer = setTimeout(refreshAccessToken, 300000);
        return;
      }
      if (!error && response.statusCode === 200) {
        wxAccessToken = body.access_token;
        refreshJsapiTicket();
        accessTokenTimer = setTimeout(
          refreshAccessToken,
          (body.expires_in || 300) * 1000
        );
      } else {
        accessTokenTimer = setTimeout(refreshAccessToken, 300000);
      }
    }
  );
}

function refreshJsapiTicket() {
  request.get(
    {
      url: `https://api.weixin.qq.com/cgi-bin/ticket/getticket?type=jsapi&access_token=${wxAccessToken}`,
    },
    (error, response, body) => {
      clearTimeout(ticketTimer);
      try {
        body = JSON.parse(body);
      } catch {
        ticketTimer = setTimeout(refreshJsapiTicket, 300000);
        return;
      }
      if (!error && response.statusCode === 200) {
        wxJsapiTicket = body.ticket;
        ticketTimer = setTimeout(
          refreshJsapiTicket,
          (body.expires_in || 180) * 1000
        );
      } else {
        ticketTimer = setTimeout(refreshJsapiTicket, 300000);
      }
    }
  );
}

refreshAccessToken();

router.use((req, res, next) => {
  console.log("wx_Time:", Date.now(), req.headers.host);
  next();
});

router.get("/", (req, res) => {
  const data = req.query;
  // legacy always echoed echostr (signature check was prepared but unused)
  void data.signature;
  void data.timestamp;
  void data.nonce;
  void config.wechat.serverToken;
  res.send(data.echostr);
});

router.get("/refererAccess_token", (_req, res) => {
  refreshAccessToken();
  res.send(`${Date.now()} success`);
});

router.get("/get_signature", (req, res) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const noncestr = ((s, len, dict) => {
    s = s || "";
    len = len || 18;
    dict =
      dict ||
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz";
    for (let i = 0; i < len; i++) {
      s += dict[parseInt(dict.length * Math.random(), 10)];
    }
    return s;
  })("Li0", 12);
  const referer = req.headers.referer;
  const signature = sha1(
    [
      `noncestr=${noncestr}`,
      `jsapi_ticket=${wxJsapiTicket}`,
      `timestamp=${timestamp}`,
      `url=${referer}`,
    ]
      .sort()
      .join("&")
  );

  if (config.wxHostAllowlist.includes(req.headers.host)) {
    res.json({
      state: 1000,
      data: {
        signature,
        timestamp,
        noncestr,
        appid: config.wechat.appId,
        referer,
      },
    });
  } else {
    res.json({
      state: 1000,
      data: {
        signature: "0f9de62fce790f9a083d5c99e95740ceb90c27ed",
        timestamp: "1414587457",
        noncestr: "Wm3WZYTPz0wzccnW",
        referer,
      },
    });
  }
});

module.exports = router;
