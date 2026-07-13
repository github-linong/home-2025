"use strict";

function reflectCors(res, req, { includeOptions = false } = {}) {
  res.header("Access-Control-Allow-Origin", req.headers.origin);
  res.header(
    "Access-Control-Allow-Methods",
    includeOptions ? "GET,PUT,POST,DELETE,OPTIONS" : "GET,PUT,POST,DELETE"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, x-ts, x-key, accesstoken, X-Requested-With, AccessToken, Authorization"
  );
  res.header("Access-Control-Allow-Credentials", "true");
}

module.exports = { reflectCors };
