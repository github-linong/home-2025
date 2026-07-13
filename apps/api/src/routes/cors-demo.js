"use strict";

const express = require("express");
const { reflectCors } = require("../lib/cors-reflect");
const { timezonePayload } = require("../lib/time");

const router = express.Router();

router.options("/CORS/*", (req, res) => {
  reflectCors(res, req, { includeOptions: true });
  res.sendStatus(200);
});

router.use("/CORS/*", (req, res) => {
  reflectCors(res, req);
  const time = new Date();
  res.json({
    state: 1000,
    method: req.method,
    originalUrl: req.originalUrl,
    baseUrl: req.baseUrl,
    query: req.query,
    body: req.body,
    params: req.params,
    data: req.data,
    headers: req.headers,
    time: time.getTime(),
    timezone: timezonePayload(time),
  });
});

router.options("/corsutils/*", (req, res) => {
  reflectCors(res, req, { includeOptions: true });
  res.sendStatus(200);
});

router.use("/corsutils/*", (req, res) => {
  reflectCors(res, req);
  const tag = req.params[0];
  if (tag === "delay" || tag === "sleep") {
    const sleep =
      req.query.sleep ||
      req.query.delay ||
      req.body.sleep ||
      req.body.delay;
    const responseData = req.query.responseData || req.body.responseData || "";
    const responseStatus = Number(
      req.query.responseStatus || req.body.responseStatus || 200
    );
    const responseType = req.query.responseType || req.body.responseType || "";
    if (responseType) res.set("Content-Type", responseType);
    if (sleep === undefined) {
      res.status(responseStatus).send(responseData);
    } else {
      setTimeout(() => {
        res.status(responseStatus).send(responseData);
      }, sleep);
    }
    return;
  }
  res.redirect("/cors/corsutils");
});

module.exports = router;
