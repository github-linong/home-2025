"use strict";

const path = require("path");
const express = require("express");
const axios = require("axios");
const iconv = require("iconv-lite");
const encoding = require("encoding");
const config = require("../config/env");

const unlockMusic = require(path.join(config.paths.decrypt, "common"));

const router = express.Router();

const defaultKgCookie =
  config.music.kgCookie ||
  "openid=ovzLr4uIWINaQrw_4hkTvQdE9GnI; openkey=JxEAD17xdkEAD0RtAAAAIPZewScviA7Fvvvvr+JHh4/CyGVgT5aUsJnCOAQJ2wCA; uid=1001792532; opentype=1; qua=V1_KMP_KG_5.0.0_001_APP_A";

const defaultKgCookieAlt =
  config.music.kgCookieAlt ||
  "openid=oc2eXjsOEbigCzV3dmTObr_no_z4; openkey=TiEACV75njkAD0LwAAAAICimDpSYCgmDv0MQFQeEgAwXKtN4JFrvQq2/5gM5+Dax";

router.use((req, res, next) => {
  if (
    req.path.indexOf("/utf82gb2312") === 0 ||
    req.path.indexOf("/hex2utf8") === 0
  ) {
    console.log(
      "proxy_kg_Time:",
      Date.now(),
      JSON.stringify({ path: req.path, params: req.params })
    );
  } else {
    console.log(
      "proxy_kg_Time:",
      Date.now(),
      JSON.stringify({
        path: req.path,
        query: req.query,
        body: req.body,
        params: req.params,
      })
    );
  }
  next();
});

router.use("/kg-qq_search", (req, res) => {
  const key = req.query.searchValue;
  axios({
    url: "https://node.kg.qq.com/webapp/proxy",
    params: {
      ns: "search",
      cmd: "search.search",
      nocache: Date.now(),
      t_s_key: key,
    },
    headers: { referer: "https://node.kg.qq.com" },
  })
    .then((v) => {
      res.json({
        state: 1000,
        data: v.data.data["search.search"].v_song,
      });
    })
    .catch((v) => {
      res.json({
        state: 1002,
        errorMsg: v.message || v,
        msg: "catch",
      });
    });
});

router.use("/kg-qq_protoKsonginfo", (req, res) => {
  const key = req.query.searchValue;
  axios({
    url: "https://node.kg.qq.com/webapp/proxy",
    params: {
      ns: "proto_ksonginfo",
      cmd: "ksonginfo.get",
      mapExt:
        "JTdCJTIyZmlsZSUyMiUzQSUyMnByb3RvX2tzb25naW5mb0pjZSUyMiUyQyUyMmNtZE5hbWUlMjIlM0ElMjJHZXRLU29uZ0luZm9SZXElMjIlMkMlMjJ3bnNDb25maWclMjIlM0ElN0IlMjJhcHBpZCUyMiUzQTEwMDA1NTclN0QlMkMlMjJsNWFwaSUyMiUzQSU3QiUyMm1vZGlkJTIyJTNBMjk0MDE3JTJDJTIyY21kJTIyJTNBMTExNDExMiU3RCU3RA==",
      nocache: Date.now(),
      t_iHitedSong: 1,
      t_mapContent: '{"emContentType": 1000}',
      t_strKSongMid: key,
    },
    headers: {
      cookie: defaultKgCookie,
      referer: "https://node.kg.qq.com",
    },
  })
    .then((v) => {
      res.json({
        state: 1000,
        data: v.data.data["ksonginfo.get"],
      });
    })
    .catch((v) => {
      res.json({
        state: 1002,
        errorMsg: v.message || v,
        msg: "catch",
      });
    });
});

router.use("/kg-qq_getksongfileURL", (req, res) => {
  axios({
    url: "https://node.kg.qq.com/webapp/proxy",
    params: {
      ns: "proto_ksonginfo",
      cmd: "ksonginfo.geturl",
      ns_inbuf: "",
      mapExt:
        "JTdCJTIyZmlsZSUyMiUzQSUyMnByb3RvX2tzb25naW5mb0pjZSUyMiUyQyUyMmNtZE5hbWUlMjIlM0ElMjJLU29uZ0dldFVybFJlcSUyMiUyQyUyMnduc0NvbmZpZyUyMiUzQSU3QiUyMmFwcGlkJTIyJTNBMTAwMDU1NyU3RCUyQyUyMmw1YXBpJTIyJTNBJTdCJTIybW9kaWQlMjIlM0EyOTQwMTclMkMlMjJjbWQlMjIlM0ExMTE0MTEyJTdEJTdE",
      g_tk_openkey: 1289634077,
      t_ksong_mid: req.query.ksongmid || "002R6mOx2igRCt",
      t_accompany_filemid: req.query.accompanymid || "002qAuBS1ylgOJ",
      t_song_filemid: req.query.songmid || "000K7xzB2znSRN",
      t_udid: 586764699,
      t_quality: 0,
    },
    headers: {
      cookie: defaultKgCookie,
      referer: "https://node.kg.qq.com",
    },
  })
    .then((v) => {
      res.json({
        state: 1000,
        data: v.data.data["ksonginfo.geturl"],
      });
    })
    .catch((v) => {
      res.json({
        state: 1002,
        errorMsg: v.message || v,
        msg: "catch",
      });
    });
});

function getKgInfo(strKSongMid, cookie) {
  return axios({
    url: "http://cgi.kg.qq.com/fcgi-bin/fcg_ksonginfo_get",
    params: {
      g_tk_openkey: "7014983",
      g_tk: "7014983",
      strKSongMid: strKSongMid || "002R6mOx2igRCt",
      mapContent: "CONTENT_LRC:0,CONTENT_NOTE:0,CONTENT_QRC:0,CONTENT_ROMA:0",
      outCharset: "utf-8",
      format: "json",
    },
    headers: {
      cookie: cookie || defaultKgCookieAlt,
      referer: "https://node.kg.qq.com",
    },
  });
}

router.use("/kg-qq_getKsongInfo", (req, res) => {
  getKgInfo(req.query.searchValue)
    .then((v) => {
      res.json({
        state: 1000,
        data: v.data.data,
      });
    })
    .catch((v) => {
      res.json({
        state: 1002,
        errorMsg: v.message || v,
        msg: "catch",
      });
    });
});

router.use("/tkmUrl2m4a", (req, res) => {
  axios({
    url: req.query.url,
    responseType: "arraybuffer",
  }).then((v) => {
    const result = unlockMusic.CommonDecrypt({
      name: "KC40002qAuBS1ylgOJ.tkm",
      raw: v.data,
    });
    result.then((decoded) => {
      res.send(Buffer.from(decoded.musicDecoded)).end();
    });
  });
});

router.use("/playlist", (req, res) => {
  const key = req.query.searchValue;
  const key_type = req.query.searchType;
  const business = req.query.business;
  switch (business) {
    case "qq":
      if (key_type === "id") {
        axios(
          `https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&new_format=1&disstid=${key}&g_tk_new_20200303=5381&g_tk=5381&loginUin=2328774194&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0`,
          {
            headers: {
              referer: "https://c.y.qq.com/qzone/fcg-binfcg_",
            },
          }
        )
          .then((v) => {
            const item = ((v.data && v.data.cdlist) || [])[0];
            if (item) {
              res.json({
                state: 1000,
                data: {
                  dissInfo: {
                    dissId: item.dissid,
                    dissName: item.dissname,
                    dissTag: item.tags && item.tags.map((t) => t.name).join(),
                  },
                  songList: item.songlist.map((s) => ({
                    songId: s.id,
                    song_name: s.name || s.title,
                    song_title: s.title || s.name,
                    singerName:
                      s.singer && s.singer.map((x) => x.name || x.title).join(),
                    albumName: s.album && (s.album.name || s.album.title),
                  })),
                },
              });
            } else {
              res.json({ state: 1001, msg: "空" });
            }
          })
          .catch((v) => {
            res.json({
              state: 1002,
              errorMsg: v.message || v,
              msg: "catch",
            });
          });
      }
      break;
    case "163":
      if (key_type === "id") {
        axios(`${config.music.neteaseApiBase}/playlist/detail?id=${key}`)
          .then((v) => {
            const item = v.data && v.data.playlist;
            if (item) {
              return axios(
                `${config.music.neteaseApiBase}/song/detail?ids=${item.trackIds
                  .map((t) => t.id)
                  .join()}`
              ).then((songsResp) => {
                res.json({
                  state: 1000,
                  data: {
                    dissInfo: {
                      dissId: item.id,
                      dissName: item.name,
                      dissTag: item.tags && item.tags.join(),
                    },
                    songList: songsResp.data.songs.map((s) => ({
                      songId: s.id,
                      song_name: s.name || s.title,
                      song_title: s.title || s.name,
                      singerName: s.ar && s.ar.map((x) => x.name).join(),
                      albumName: s.al && s.al.name,
                    })),
                  },
                });
              });
            }
            res.json({ state: 1001, msg: "空" });
          })
          .catch((v) => {
            res.json({
              state: 1002,
              errorMsg: v.message || v,
              msg: "catch",
            });
          });
      }
      break;
    default:
      return res.json({
        state: 1005,
        msg: "异常数据",
        query: req.query,
      });
  }
});

router.use("/hex2utf8", (req, res) => {
  const b = Buffer.from(
    req.body.searchValue || req.query.searchValue || "",
    "hex"
  );
  res.send(b.toString("utf8")).end();
});

router.use("/utf82gb2312", (req, res) => {
  const str = req.body.searchValue || req.query.searchValue;
  res.send(encoding.convert(str, "gb2312")).end();
});

router.use("/utf82gb23122hex", (req, res) => {
  const str = req.body.searchValue || req.query.searchValue;
  res.send(iconv.decode(iconv.encode(str, "utf8"), "gbk").toString("hex")).end();
});

router.use("*", (_req, res) => {
  res.json({ state: 1000, message: "*" });
});

module.exports = router;
