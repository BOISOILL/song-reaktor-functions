const functions = require("firebase-functions");
const admin = require("firebase-admin");
// Do not call admin.initializeApp() here.

exports.submitDemoReaktion = functions.https.onCall(async (request) => {
  const data = request.data || request.body?.data || request.body || request;

  const guestSessionId = data.guestSessionId;
  const explorerSessionId = data.explorerSessionId;
  const demoSongId = data.demoSongId;
  const demoRating = data.demoRating;

  console.log("Incoming payload:", data);
  console.log("explorerSessionId:", explorerSessionId);
  console.log("demoSongId:", demoSongId);
  console.log("demoRating:", demoRating);

  if (!explorerSessionId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "explorerSessionId is required."
    );
  }

  if (!demoSongId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "demoSongId is required."
    );
  }

  const db = admin.firestore();
  const explorerRef = db.collection("explorer_sessions").doc(explorerSessionId);

  await db.runTransaction(async (transaction) => {
    const explorerSnap = await transaction.get(explorerRef);

    console.log("Explorer exists:", explorerSnap.exists);

    if (!explorerSnap.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Explorer session not found."
      );
    }

    const explorerData = explorerSnap.data() || {};

    const currentSongIndex = explorerData.currentSongIndex || 0;
    const unlockedSongIndex = explorerData.unlockedSongIndex || 0;
    const completedSongIds = explorerData.completedSongIds || [];

    const nextSongIndex = currentSongIndex + 1;

    const updatedCompletedSongIds = completedSongIds.includes(demoSongId)
      ? completedSongIds
      : [...completedSongIds, demoSongId];

    transaction.update(explorerRef, {
      completedSongIds: updatedCompletedSongIds,
      lastCompletedSongId: demoSongId,
      currentSongIndex: nextSongIndex,
      unlockedSongIndex: Math.max(unlockedSongIndex, nextSongIndex),
      lastDemoRating: demoRating || null,
      totalReaktions: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  if (guestSessionId) {
    const guestRef = db.collection("guest_sessions").doc(guestSessionId);

    await guestRef.set(
      {
        lastScreen: "my_studio",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  return {
    success: true,
    guestSessionId,
    explorerSessionId,
    demoSongId,
    demoRating,
    demoReaktionSubmitted: true,
    debugMessage: "Explorer session update completed",
  };
});