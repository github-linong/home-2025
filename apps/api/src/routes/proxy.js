"use strict";

const express = require("express");
const request = require("request");
const { assertSafeUrl, SsrfError } = require("../lib/ssrf-guard");

const router = express.Router();

router.post("/proxy", async (req, res) => {
  let target;
  try {
    target = await assertSafeUrl(req.body.url);
  } catch (err) {
    const status = err instanceof SsrfError ? err.statusCode : 400;
    res.status(status).json({ state: 2000, data: err.message || "invalid url" });
    return;
  }

  request.post(
    {
      url: target.href,
      form: req.body.query,
      // Do not follow redirects: a 30x to an internal host would bypass the
      // pre-flight SSRF check.
      followRedirect: false,
      followAllRedirects: false,
      timeout: 10_000,
    },
    (error, response, body) => {
      if (error || !response) {
        res.status(502).json({ state: 2000, data: String(error && error.message) });
        return;
      }
      if (response.statusCode !== 200) {
        res.status(502).json({ state: 2000, data: `upstream ${response.statusCode}` });
        return;
      }
      try {
        res.json({ state: 1000, data: JSON.parse(body) });
      } catch {
        res.json({ state: 1000, data: body });
      }
    }
  );
});

router.get("/proxy", async (req, res) => {
  let target;
  try {
    target = await assertSafeUrl(req.query.url);
  } catch (err) {
    const status = err instanceof SsrfError ? err.statusCode : 400;
    res.status(status).json({ state: 2000, data: err.message || "invalid url" });
    return;
  }

  request.get(
    {
      url: target.href,
      followRedirect: false,
      followAllRedirects: false,
      timeout: 10_000,
    },
    (error, response, body) => {
      if (error || !response) {
        res.status(502).send(String(error && error.message));
        return;
      }
      if (response.statusCode !== 200) {
        res.status(502).send(`upstream ${response.statusCode}`);
        return;
      }
      res.setHeader("Content-Type", "text/plain;charset=GBK");
      res.send(body);
    }
  );
});

module.exports = router;
