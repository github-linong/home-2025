"use strict";

const express = require("express");
const config = require("../config/env");

const router = express.Router();

let client = null;

function getClient() {
  if (client) return client;
  if (!config.tencent.secretId || !config.tencent.secretKey) {
    return null;
  }

  try {
    const tencentcloud = require("tencentcloud-sdk-nodejs");
    const FacefusionClient = tencentcloud.facefusion.v20181201.Client;
    client = new FacefusionClient({
      credential: {
        secretId: config.tencent.secretId,
        secretKey: config.tencent.secretKey,
      },
      region: config.tencent.region,
      profile: {
        httpProfile: {
          endpoint: "facefusion.tencentcloudapi.com",
        },
      },
    });
    return client;
  } catch (err) {
    console.warn("[tencent] failed to init client:", err.message);
    return null;
  }
}

router.post("/face_fusion", async (req, rsp) => {
  if (!(req.body.modelId && req.body.base64)) {
    return rsp.json({
      state: 1002,
      data: "入参异常",
    });
  }

  const c = getClient();
  if (!c) {
    return rsp.json({
      state: 1001,
      data: "tencent credentials not configured",
    });
  }

  const params = {
    ProjectId: config.tencent.projectId,
    ModelId: req.body.modelId || config.tencent.defaultModelId,
    Image: req.body.base64 || "",
    RspImgType: "base64",
  };

  try {
    const response = await c.FaceFusion(params);
    rsp.json({ state: 1000, data: response });
  } catch (errMsg) {
    rsp.json({ state: 1001, data: errMsg });
  }
});

module.exports = router;
