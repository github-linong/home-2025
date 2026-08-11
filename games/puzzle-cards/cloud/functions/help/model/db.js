// cloud/model/db.js
// 云数据库访问封装。云函数内通过 wx-server-sdk 初始化后，这里统一建集合引用。
// 设计要点：所有写操作带 _updateTime；读取走索引字段；统一用 db.command 做原子自增。

let _db = null;

function getDB() {
  if (_db) return _db;
  // wx-server-sdk 在云函数运行时全局可用；本地单测时由 test 注入。
  const cloud = require('wx-server-sdk');
  _db = cloud.database();
  return _db;
}

// 允许在本地（单测 / 脚本）注入一个 mock 数据库。
function setDB(db) {
  _db = db;
}

function collection(name) {
  return getDB().collection(name);
}

const _ = () => getDB().command;
const _aggregate = () => getDB().command.aggregate;

module.exports = {
  getDB,
  setDB,
  collection,
  cmd: _,
  agg: _aggregate,
};
