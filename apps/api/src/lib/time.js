"use strict";

function formatTimeNopad(time) {
  return `${time.getFullYear()}-${time.getMonth() + 1}-${time.getDate()} ${time.getHours()}:${time.getMinutes()}:${time.getSeconds()}`;
}

function formatTimePad(time) {
  return `${time.getFullYear()}-${(time.getMonth() + 1 + "").padStart(2, "0")}-${(
    time.getDate() + ""
  ).padStart(2, "0")} ${(time.getHours() + "").padStart(2, "0")}:${(
    time.getMinutes() + ""
  ).padStart(2, "0")}:${(time.getSeconds() + "").padStart(2, "0")}`;
}

function timezonePayload(time = new Date()) {
  return {
    time: time.getTime(),
    timeFormat: formatTimeNopad(time),
    timeFormatPad: formatTimePad(time),
    timezoneOffset: time.getTimezoneOffset(),
  };
}

module.exports = {
  formatTimeNopad,
  formatTimePad,
  timezonePayload,
};
