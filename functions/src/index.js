"use strict";

const {getApps, initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {
  FieldValue,
  Timestamp,
  getFirestore,
} = require("firebase-admin/firestore");
const {onCall} = require("firebase-functions/v2/https");
const bcrypt = require("bcryptjs");

const {createConfirmTokenHandler} = require("./confirmToken");
const {createLoginWithPinHandler} = require("./loginWithPin");
const {createReportTokenHandler} = require("./reportToken");

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();
const callableOptions = {region: "asia-east1"};

exports.loginWithPin = onCall(
  callableOptions,
  createLoginWithPinHandler({
    db,
    bcrypt,
    auth: getAuth(),
    now: () => Timestamp.now(),
    fromMillis: (milliseconds) => Timestamp.fromMillis(milliseconds),
  })
);

exports.reportToken = onCall(
  callableOptions,
  createReportTokenHandler({
    db,
    serverTimestamp: () => FieldValue.serverTimestamp(),
  })
);

exports.confirmToken = onCall(
  callableOptions,
  createConfirmTokenHandler({
    db,
    serverTimestamp: () => FieldValue.serverTimestamp(),
    increment: (amount) => FieldValue.increment(amount),
  })
);
