"use strict";

const { createApp } = require("./app");
const config = require("./config/env");
const { fetchAccessToken } = require("./services/baidu-token");

const app = createApp();

const server = app.listen(config.port, () => {
  const addr = server.address();
  console.log(
    `lilnong legacy API listening at http://127.0.0.1:${addr.port}`
  );
});

// Match home-2023: pull Baidu token on boot (and refresh)
fetchAccessToken();

module.exports = server;
