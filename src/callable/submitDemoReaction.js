const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

const db = admin.firestore();

exports.submitDemoReaktion = onCall(async (request) => {
  const data = request.data || {};

  const guestSessionId = data.guestSessionId;
  const demoSongId = data.demoSongId;
  const demoRating = data.demoRating;

  if (!guestSessionId || typeof guestSessionId !== "string") {
    throw new HttpsError("invalid-argument", "Missing guestSessionId.");
  }

  if (!demoSongId || typeof demoSongId !== "string") {
    throw new HttpsError("invalid-argument", "Missing demoSongId.");
  }

  if (typeof demoRating !== "number") {
    throw new HttpsError("invalid-argument", "Invalid demoRating.");
  }

  const ref = db.collection("guest_sessions").doc(guestSessionId);
  const snap = await ref.get();

  if (!snap.exists) {
    throw new HttpsError("not-found", "Guest session not found.");
  }

  await ref.update({
    demoSongId,
    demoRating,
    demoReactionSubmitted: true,
    demoReactionSubmittedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    success: true,
    guestSessionId,
    demoSongId,
    demoRating,
    demoReactionSubmitted: true,
  };
});