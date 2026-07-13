"use strict";

const express = require("express");
const axios = require("axios");

const router = express.Router();

router.use((req, res, next) => {
  console.log("proxy_Time:", Date.now(), req.path);
  next();
});

function getShareUrl(url) {
  return axios(url).then((v) => v.request.res.responseUrl);
}

function matchItemid(url) {
  return url.match(/(\d+)\/?$/)[1];
}

function getItemInfo(id) {
  return axios(
    `https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${id}`
  )
    .then((v) => v.data)
    .then((v) =>
      v.item_list[0].video.play_addr.url_list[0].replace("playwm", "play")
    );
}

router.get("/douyin/getVideoUrl", (req, res) => {
  getShareUrl(req.query.url)
    .then((v) => v.split("?")[0])
    .then(matchItemid)
    .then(getItemInfo)
    .then((v) => {
      res.send({ state: 1000, url: v });
    })
    .catch((v) => {
      res.send({ state: 2000, url: v.message });
    });
});

router.get("/douyin/getVideoSource", (req, res) => {
  getShareUrl(req.query.url)
    .then((v) => v.split("?")[0])
    .then(matchItemid)
    .then(getItemInfo)
    .then((v) => {
      axios({
        url: v,
        responseType: "stream",
        headers: {
          "user-agent":
            "Mozilla/5.0 (Linux; Android 9; V1838A Build/PKQ1.190302.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/66.0.3359.126 MQQBrowser/6.2 TBS/45016 Mobile Safari/537.36 MMWEBID/1314 MicroMessenger/7.0.19.1560(0x27000933) Process/tools NetType/WIFI Language/zh_CN ABI/arm64",
        },
      }).then((resp) => {
        const buffers = [];
        resp.data.on("data", (chunk) => buffers.push(chunk));
        resp.data.on("end", () => {
          res.send(Buffer.concat(buffers));
        });
        resp.data.on("error", (err) => {
          console.log("error", err.stack);
        });
      });
    });
});

module.exports = router;
