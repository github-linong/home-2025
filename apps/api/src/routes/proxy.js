"use strict";

const express = require("express");
const request = require("request");

const router = express.Router();

router.post("/proxy", (req, res) => {
  console.log("/proxy", req.body.url);
  request.post(
    {
      url: req.body.url,
      form: req.body.query,
    },
    (error, response, body) => {
      if (!error && response.statusCode === 200) {
        res.json({
          state: 1000,
          data: JSON.parse(body),
        });
      }
    }
  );
});

router.get("/proxy", (req, res) => {
  console.log("/proxy", req.query.url);
  request.get({ url: req.query.url }, (error, response, body) => {
    if (!error && response.statusCode === 200) {
      res.setHeader("Content-Type", "text/plain;charset=GBK");
      res.send(body);
    }
  });
});

module.exports = router;
