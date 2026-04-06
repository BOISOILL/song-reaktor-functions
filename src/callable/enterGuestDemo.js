const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

const db = admin.firestore();

exports.enterGuestDemo = onCall(async (request) => {
  const data = request.data || {};
  const guestSessionId = data.guestSessionId;

  if (!guestSessionId || typeof guestSessionId !== "string") {
    throw new HttpsError("invalid-argument", "Missing guestSessionId.");
  }

  const ref = db.collection("guest_sessions").doc(guestSessionId);
  const snap = await ref.get();

  if (!snap.exists) {
    throw new HttpsError("not-found", "Guest session not found.");
  }

  await ref.update({
    hasEnteredDemo: true,
    demoStartedAt: FieldValue.serverTimestamp(),
    lastScreen: "my_studio",
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    success: true,
    guestSessionId,
    hasEnteredDemo: true,
    lastScreen: "my_studio",
  };
});