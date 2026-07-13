"use strict";

const fs = require("fs");
const path = require("path");
const express = require("express");
const log4js = require("log4js");
const config = require("../config/env");

fs.mkdirSync(path.join(config.paths.logs, "reqlog"), { recursive: true });
fs.mkdirSync(path.join(config.paths.logs, "errlog"), { recursive: true });
fs.mkdirSync(path.join(config.paths.logs, "othlog"), { recursive: true });
fs.mkdirSync(config.paths.felog, { recursive: true });

log4js.configure({
  replaceConsole: false,
  appenders: {
    stdout: { type: "stdout" },
    req: {
      type: "dateFile",
      filename: path.join(config.paths.logs, "reqlog", "req"),
      pattern: "yyyy-MM-dd.log",
      alwaysIncludePattern: true,
    },
    err: {
      type: "dateFile",
      filename: path.join(config.paths.logs, "errlog", "err"),
      pattern: "yyyy-MM-dd.log",
      alwaysIncludePattern: true,
    },
    oth: {
      type: "dateFile",
      filename: path.join(config.paths.logs, "othlog", "oth"),
      pattern: "yyyy-MM-dd.log",
      alwaysIncludePattern: true,
    },
    felog: {
      type: "dateFile",
      filename: path.join(config.paths.felog, "log"),
      pattern: "yyyy-MM-dd.html",
      alwaysIncludePattern: true,
    },
  },
  categories: {
    default: { appenders: ["stdout", "req"], level: "debug" },
    err: { appenders: ["stdout", "err"], level: "info" },
    oth: { appenders: ["stdout", "oth"], level: "info" },
    felog: { appenders: ["stdout", "felog"], level: "info" },
  },
});

const reqLogger = log4js.getLogger();
const errLogger = log4js.getLogger("err");
const feLogger = log4js.getLogger("felog");

const router = express.Router();

router.get("/falseReport", (req, res) => {
  errLogger.info({
    message: req.query.message,
    source: req.query.source,
    lineno: req.query.lineno,
    colno: req.query.colno,
    error: req.query.error,
  });
  res.send("Success");
});

router.get("/logReport", (req, res) => {
  reqLogger.info(req.query);
  res.send("Success");
});

router.get("/felog", (req, res) => {
  console.log(req.url);
  feLogger.info(req.query);
  res.send("Success");
});

module.exports = router;
