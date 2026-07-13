"use strict";

const fs = require("fs");
const path = require("path");
const request = require("request");
const qs = require("querystring");
const express = require("express");
const upload = require("../lib/multer-upload");
const config = require("../config/env");
const { getAccessToken } = require("../services/baidu-token");
const { archiveUploadAndCleanup } = require("../services/oss");

const router = express.Router();

const mergeTemplateBase64 = fs
  .readFileSync(config.paths.mergeTemplate, "utf8")
  .trim();

function fileToBase64(filePath) {
  return Buffer.from(fs.readFileSync(filePath)).toString("base64");
}

function sendBaiduJson(res, error, response, body) {
  let data;
  try {
    data = typeof body === "string" ? JSON.parse(body) : body;
  } catch {
    data = body;
  }
  if (!error && response && response.statusCode === 200) {
    res.json({ state: 1000, data });
  } else {
    console.log("upload upstream error", {
      statusCode: response && response.statusCode,
      body,
    });
    res.json({ state: 2000, data });
  }
}

/** Read file for AI, then archive to OSS and remove local copy. */
async function readBase64ThenArchive(file) {
  const _base64 = fileToBase64(path.resolve(file.path));
  const archived = await archiveUploadAndCleanup(file);
  return { _base64, archived };
}

router.post("/upload_any", upload.any(), async (req, res) => {
  try {
    const files = req.files || [];
    const { urls, archived } = await archiveUploadAndCleanup(files);
    const payload = {
      state: 1000,
      files: files.length,
    };
    // Additive fields — demos that only check `files` keep working.
    // Public urls are omitted until OSS_PUBLIC_READ=true.
    if (archived) {
      payload.storage = "oss";
      if (urls.length) payload.urls = urls;
    }
    res.json(payload);
  } catch (err) {
    console.error(err);
    res.json({ state: 2000, files: 0, data: String(err.message || err) });
  }
});

router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const { _base64 } = await readBase64ThenArchive(req.file);
    const param = qs.stringify({ access_token: getAccessToken() });
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
  } catch (err) {
    console.error(err);
    res.json({ state: 2000, data: String(err.message || err) });
  }
});

router.post("/upload_baidu_classify", upload.single("file"), async (req, res) => {
  try {
    const { _base64 } = await readBase64ThenArchive(req.file);
    const type = req.body.type || "foreground";
    const param = qs.stringify({ access_token: getAccessToken() });
    request.post(
      {
        url: `https://aip.baidubce.com/rest/2.0/image-classify/v1/body_seg?${param}`,
        form: {
          access_token: getAccessToken(),
          type,
          image: encodeURI(_base64),
        },
      },
      (error, response, body) => sendBaiduJson(res, error, response, body)
    );
  } catch (err) {
    console.error(err);
    res.json({ state: 2000, data: String(err.message || err) });
  }
});

router.post("/upload_baidu_face_merge", upload.single("file"), async (req, res) => {
  try {
    const { _base64 } = await readBase64ThenArchive(req.file);
    const merge_degree = req.body.merge_degree || "COMPLETE";
    const param = qs.stringify({ access_token: getAccessToken() });
    request.post(
      {
        url: `https://aip.baidubce.com/rest/2.0/face/v1/merge?${param}`,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          image_template: {
            image: encodeURI(
              mergeTemplateBase64.replace("data:image/jpeg;base64,", "")
            ),
            image_type: "BASE64",
          },
          merge_degree,
          image_target: {
            image: encodeURI(_base64),
            image_type: "BASE64",
          },
        }),
      },
      (error, response, body) => sendBaiduJson(res, error, response, body)
    );
  } catch (err) {
    console.error(err);
    res.json({ state: 2000, data: String(err.message || err) });
  }
});

router.post("/upload_baidu_face_detect_any", upload.single("file"), async (req, res) => {
  const body_json = req.body.json;
  const param = qs.stringify({ access_token: getAccessToken() });
  // File may be optional; archive if present
  if (req.file) {
    await archiveUploadAndCleanup(req.file).catch((err) =>
      console.error(err)
    );
  }
  request.post(
    {
      url: `https://aip.baidubce.com/rest/2.0/face/v3/detect?${param}`,
      headers: { "content-type": "application/json" },
      body: body_json,
    },
    (error, response, body) => sendBaiduJson(res, error, response, body)
  );
});

router.post("/upload_baidu_face_merge_any", upload.single("file"), async (req, res) => {
  const body_json = req.body.json;
  const param = qs.stringify({ access_token: getAccessToken() });
  if (req.file) {
    await archiveUploadAndCleanup(req.file).catch((err) =>
      console.error(err)
    );
  }
  request.post(
    {
      url: `https://aip.baidubce.com/rest/2.0/face/v1/merge?${param}`,
      headers: { "content-type": "application/json" },
      body: body_json,
    },
    (error, response, body) => sendBaiduJson(res, error, response, body)
  );
});

router.post("/upload_faceplusplus_merge", upload.single("file"), async (req, res) => {
  try {
    const { _base64 } = await readBase64ThenArchive(req.file);
    const merge_rate = req.body.merge_rate || 80;
    const feature_rate = req.body.feature_rate || 50;
    request.post(
      {
        url: "https://api-cn.faceplusplus.com/imagepp/v1/mergeface",
        form: {
          api_key: config.facepp.apiKey,
          merge_rate,
          feature_rate,
          api_secret: config.facepp.apiSecret,
          template_base64: mergeTemplateBase64,
          merge_base64: encodeURI(_base64),
        },
      },
      (error, response, body) => sendBaiduJson(res, error, response, body)
    );
  } catch (err) {
    console.error(err);
    res.json({ state: 2000, data: String(err.message || err) });
  }
});

router.post(
  "/upload_faceplusplus_humanbodyppSegment",
  upload.single("file"),
  async (req, res) => {
    try {
      const { _base64 } = await readBase64ThenArchive(req.file);
      const return_grayscale = req.body.return_grayscale || 0;
      request.post(
        {
          url: "https://api-cn.faceplusplus.com/humanbodypp/v2/segment",
          form: {
            api_key: config.facepp.apiKey,
            return_grayscale,
            api_secret: config.facepp.apiSecret,
            image_base64: encodeURI(_base64),
          },
        },
        (error, response, body) => sendBaiduJson(res, error, response, body)
      );
    } catch (err) {
      console.error(err);
      res.json({ state: 2000, data: String(err.message || err) });
    }
  }
);

module.exports = router;
