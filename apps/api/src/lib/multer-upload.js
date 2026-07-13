"use strict";

const fs = require("fs");
const multer = require("multer");
const config = require("../config/env");

fs.mkdirSync(config.paths.uploads, { recursive: true });

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, config.paths.uploads);
  },
  filename(_req, file, cb) {
    if (file.originalname.match(/\.[a-zA-Z0-9]+$/)) {
      cb(null, `${Date.now()}-${Math.random()}-${file.originalname}`);
      return;
    }
    if (file.mimetype === "audio/wav") {
      cb(null, `${Date.now()}-${file.originalname}.wav`);
    } else if (file.mimetype === "audio/ogg") {
      cb(null, `${Date.now()}-${file.originalname}.ogg`);
    } else if (file.mimetype === "audio/mpeg") {
      cb(null, `${Date.now()}-${file.originalname}.mp3`);
    } else {
      cb(null, `${Date.now()}-${Math.random()}-${file.originalname}`);
    }
  },
});

module.exports = multer({ storage });
