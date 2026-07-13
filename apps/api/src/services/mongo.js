"use strict";

const { MongoClient } = require("mongodb");
const config = require("../config/env");

async function withDb(dbName, fn) {
  const client = new MongoClient(config.mongo.uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    return await fn(db);
  } finally {
    await client.close().catch(() => {});
  }
}

module.exports = { withDb };
