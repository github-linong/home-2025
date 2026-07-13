"use strict";

const express = require("express");
const request = require("request");
const qs = require("querystring");
const md5 = require("md5");
const { getAccessToken } = require("../services/baidu-token");
const { withDb } = require("../services/mongo");

const router = express.Router();
const memoryBucket = [];

router.post("/*", async (req, res) => {
  const urlTag = req.params[0];

  if (urlTag === "insert") {
    const param = qs.stringify({ access_token: getAccessToken() });
    const _base64 = req.body.base64;
    request.post(
      {
        url: `https://aip.baidubce.com/rest/2.0/ocr/v1/idcard?${param}`,
        form: {
          id_card_side: "front",
          detect_direction: true,
          image: encodeURI(_base64),
          detect_risk: false,
        },
      },
      (error, response, body) => {
        if (!error && response.statusCode === 200) {
          res.json({ state: 1000, data: JSON.parse(body) });
        }
      }
    );
    return;
  }

  if (urlTag === "insertImg") {
    // intentionally empty — preserve legacy no-op
    return;
  }

  if (urlTag === "face_446a5305d94e2e9cbc7b6b00d7888e0d") {
    const uuid = md5(`${req.body.name}${Date.now()}${Math.random()}`);
    try {
      await withDb("face_ai", async (db) => {
        await db.collection("db_446a5305d94e2e9cbc7b6b00d7888e0d_login").insertOne({
          name: req.body.name,
          sNO: req.body.sNO,
          createTime: Date.now(),
          uuid,
        });
      });
      res.json({ state: 1000, data: { md5: uuid } });
    } catch (err) {
      console.error(err);
      res.status(500).json({ state: 2000, data: String(err.message || err) });
    }
    return;
  }

  if (urlTag === "face_71fcaee8aa168ee2107b2eb9125ec293") {
    const uuid = md5(`${req.body.name}${Date.now()}${Math.random()}`);
    try {
      await withDb("face_ai", async (db) => {
        await db.collection("db_71fcaee8aa168ee2107b2eb9125ec293_login").insertOne({
          name: req.body.name,
          sNO: req.body.sNO,
          count: req.body.count,
          createTime: Date.now(),
          uuid,
        });
      });
      res.json({ state: 1000, data: { md5: uuid } });
    } catch (err) {
      console.error(err);
      res.status(500).json({ state: 2000, data: String(err.message || err) });
    }
    return;
  }

  if (urlTag === "insertInvitation") {
    const uuid = md5(`${req.body.name}${Date.now()}`);
    try {
      await withDb("invitation", async (db) => {
        await db.collection("user").insertOne({
          name: req.body.name,
          sub: req.body.sub,
          remark: req.body.remark,
          url: uuid,
        });
      });
      res.json({ state: 1000, data: { md5: uuid } });
    } catch (err) {
      console.error(err);
      res.status(500).json({ state: 2000, data: String(err.message || err) });
    }
    return;
  }

  if (urlTag === "findInvitation") {
    try {
      const result = await withDb("invitation", async (db) => {
        return db.collection("user").find({ url: req.body.url }).toArray();
      });
      let data = null;
      if (result[0]) {
        data = { name: result[0].name, sub: result[0].sub };
      }
      res.json({ state: 1000, data });
    } catch (err) {
      console.error(err);
      res.status(500).json({ state: 2000, data: String(err.message || err) });
    }
    return;
  }

  if (urlTag === "5c7e541b6fb9a049e06415a5") {
    const forwarded = req.header("x-forwarded-for") || "";
    const obj = Object.assign(
      {
        origin_ip: forwarded.replace(/\d*$/, "*"),
        server_date: Date.now(),
      },
      req.body
    );
    memoryBucket.push(obj);
    res.send(obj);
    return;
  }

  if (urlTag === "find_5c7e541b6fb9a049e06415a5") {
    res.json(memoryBucket);
    return;
  }

  res.send("/api/*");
});

module.exports = router;
