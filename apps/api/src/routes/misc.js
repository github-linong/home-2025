"use strict";

const fs = require("fs");
const path = require("path");
const express = require("express");
const md5 = require("md5");
const config = require("../config/env");

const router = express.Router();

const elAutocompleteList = [
  { value: "三全鲜食（北新泾店）", address: "长宁区新渔路144号" },
  { value: "Hot honey 首尔炸鸡（仙霞路）", address: "上海市长宁区淞虹路661号" },
  {
    value: "新旺角茶餐厅",
    address: "上海市普陀区真北路988号创邑金沙谷6号楼113",
  },
  { value: "泷千家(天山西路店)", address: "天山西路438号" },
  {
    value: "胖仙女纸杯蛋糕（上海凌空店）",
    address: "上海市长宁区金钟路968号1幢18号楼一层商铺18-101",
  },
  { value: "贡茶", address: "上海市长宁区金钟路633号" },
  {
    value: "豪大大香鸡排超级奶爸",
    address: "上海市嘉定区曹安公路曹安路1685号",
  },
  { value: "茶芝兰（奶茶，手抓饼）", address: "上海市普陀区同普路1435号" },
  { value: "十二泷町", address: "上海市北翟路1444弄81号B幢-107" },
  { value: "星移浓缩咖啡", address: "上海市嘉定区新郁路817号" },
];

router.get("/favicon.ico", (req, res) => {
  res.sendFile("favicon_32.ico", {
    root: config.paths.assets,
    dotfiles: "deny",
  });
});

function sendMpVerify(req, res) {
  res.sendFile("MP_verify_T75gI0a75VaqqwBR.txt", {
    root: config.paths.assets,
    dotfiles: "deny",
  });
}

router.get("/MP_verify_T75gI0a75VaqqwBR.txt", sendMpVerify);
router.get("/mp/MP_verify_T75gI0a75VaqqwBR.txt", sendMpVerify);

router.get(/\/xss(.js)?/, (req, res) => {
  res.sendFile("xss.js", {
    root: config.paths.assets,
    dotfiles: "deny",
  });
});

router.post("/post", (req, res) => {
  res.json({
    state: 1000,
    query: req.query,
    body: req.body,
    params: req.params,
    data: req.data,
    time: Date.now(),
  });
});

router.use("/robots.txt", (_req, res) => {
  res.send(`User-agent: *
Disallow:`);
});

router.use("/baidu-verify-AFE128CA78.txt", (_req, res) => {
  res.send("d45669f519871ad03853ce7d2eea51a5");
});

router.get("/element/:name", (_req, res) => {
  res.send("当前路径废弃。微信：LN4518。QQ：920110633");
});

router.get("/autoTheme/*", (_req, res) => {
  res.send("当前路径废弃。微信：LN4518。QQ：920110633");
});

router.get("/jgq/*", (_req, res) => {
  res.send("当前路径废弃。微信：LN4518。QQ：920110633");
});

router.use("/createfont", (req, res) => {
  console.log("/createfont", req.query.txt, req.body);
  let Fontmin;
  let rename;
  try {
    Fontmin = require("fontmin");
    rename = require("gulp-rename");
  } catch (err) {
    return res.json({
      state: 2000,
      data: `fontmin unavailable: ${err.message}`,
    });
  }

  const txt =
    (req.query.txt || req.body.txt || "") +
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789~!@#$%^&*()-_+=|[]{};:\\"\',<.>/?。？！，、；：“”‘（）《》〈〉【】『』「」﹃﹄〔〕…—～￥';
  const txtMD5 = md5(txt);
  const returnURL = `${config.publicBaseUrl}/static/fontmin/${txtMD5}`;

  fs.mkdirSync(config.paths.fontmin, { recursive: true });

  new Fontmin()
    .src(config.paths.fontSource)
    .use(rename(`${txtMD5}.ttf`))
    .use(Fontmin.glyph({ text: txt, hinting: false }))
    .use(Fontmin.ttf2eot())
    .use(Fontmin.ttf2woff())
    .use(Fontmin.ttf2svg())
    .use(Fontmin.css({ fontFamily: "myFamily" }))
    .dest(config.paths.fontmin)
    .run((err) => {
      if (err) {
        console.error(err);
        return res.json({ state: 2000, data: String(err.message || err) });
      }
      res.send({
        state: 1000,
        url: `${returnURL}.ttf`,
        cssUrl: `${returnURL}.css`,
      });
    });
});

router.get("/tapi/el_autocomplete", (req, res) => {
  res.send({
    state: 1000,
    data: elAutocompleteList
      .filter((v) => v.value.indexOf(req.query.keywords || "") !== -1)
      .slice(0, 10),
  });
});

router.use("/console", (req, res, next) => {
  console.log({
    params: req.params,
    path: req.path,
    body: req.body,
    query: req.query,
  });
  next();
});

router.get("/", (_req, res) => {
  res.json({
    state: 1000,
    service: "lilnong-legacy-api",
    message: "home-2023 compatible Express API",
  });
});

module.exports = router;
