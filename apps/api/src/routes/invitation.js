"use strict";

const fs = require("fs");
const path = require("path");
const express = require("express");
const config = require("../config/env");

const router = express.Router();

const TEMPLATE_CANDIDATES = [
  "m/index/dist/html/index.2.html",
  "m/index/dist/html/index.html",
  "m/index/src/html/index.html",
];

function resolveTemplate() {
  for (const rel of TEMPLATE_CANDIDATES) {
    if (fs.existsSync(path.join(config.paths.invitationClient, rel))) {
      return rel;
    }
  }
  return TEMPLATE_CANDIDATES[0];
}

router.use((_req, _res, next) => {
  console.log("invitation_Time:", Date.now());
  next();
});

router.get("/template/:url", (req, res) => {
  const options = {
    root: config.paths.invitationClient,
    dotfiles: "deny",
    headers: {
      "x-timestamp": Date.now(),
      "x-sent": true,
    },
  };
  const fileName = resolveTemplate();
  res.sendFile(fileName, options, (err) => {
    if (err) {
      console.log(err);
      res.status(err.status || 500).end();
    }
  });
});

router.get("*", (req, res) => {
  const options = {
    root: config.paths.invitationClient,
    dotfiles: "deny",
    headers: {
      "x-timestamp": Date.now(),
      "x-sent": true,
    },
  };
  const fileName = req.params[0];
  res.sendFile(fileName, options, (err) => {
    if (err) {
      console.log(err);
      res.status(err.status || 500).end();
    }
  });
});

module.exports = router;
