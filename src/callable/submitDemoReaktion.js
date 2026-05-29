const functions = require("firebase-functions");
const admin = require("firebase-admin");
// Do not call admin.initializeApp() here.

exports.submitDemoReaktion = functions.https.onCall(async (request) => {
  const data = request.data || request.body?.data || request.body || request;

  const guestSessionId = data.guestSessionId || "";
  const explorerSessionId = data.explorerSessionId;
  const userEmail = data.userEmail;
  const demoSongId = data.demoSongId;
  const demoRating = data.demoRating;
  const comments = data.comments || "";

  const actualListenMs = data.actualListenMs || 0;
  const requiredListenMs = data.requiredListenMs || 30000;
  const extraTimeRequestedMs = data.extraTimeRequestedMs || 0;
  const logoTapCount = data.logoTapCount || 0;
  const usedMaxExtension = data.usedMaxExtension || false;
  const endedAtMs = data.endedAtMs || actualListenMs;

  const songName = data.songName || "";
  const artistName = data.artistName || "";
  const artistEmail = data.artistEmail || "";

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

  if (!userEmail) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "userEmail is required."
    );
  }

  const db = admin.firestore();

  const explorerRef = db.collection("explorer_sessions").doc(explorerSessionId);
  const userQuery = await db
  .collection("users")
  .where("email", "==", userEmail)
  .limit(1)
  .get();

if (userQuery.empty) {
  throw new functions.https.HttpsError(
    "not-found",
    "User document not found."
  );
}

const userRef = userQuery.docs[0].ref;
  const reaktionRef = db.collection("reaktions").doc();

  await db.runTransaction(async (transaction) => {
    const explorerSnap = await transaction.get(explorerRef);

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

    transaction.set(reaktionRef, {
      guestSessionId,
      explorerSessionId,
      userEmail,
      songId: demoSongId,
      songName,
      artistName,
      artistEmail,
      score: demoRating,
      comments,

      actualListenMs,
      requiredListenMs,
      extraTimeRequestedMs,
      logoTapCount,
      usedMaxExtension,
      endedAtMs,

      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      reaktionSubmittedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

   transaction.update(explorerRef, {
  completedSongIds: updatedCompletedSongIds,
  lastCompletedSongId: demoSongId,
  currentSongIndex: nextSongIndex,
  unlockedSongIndex: Math.max(unlockedSongIndex, nextSongIndex),

  lastDemoRating: demoRating || null,

  totalReaktions:
    admin.firestore.FieldValue.increment(1),

  updatedAt:
    admin.firestore.FieldValue.serverTimestamp(),
});

        transaction.set(
      userRef,
      {
        email: userEmail,

        totalReaktions: admin.firestore.FieldValue.increment(1),
        dambCoins: admin.firestore.FieldValue.increment(1),

        voiceWeight: admin.firestore.FieldValue.increment(1),

        progressPercent: admin.firestore.FieldValue.increment(1),

        listenerTier: "Rookie Reaktor",

        lastReaktionAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
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
    reaktionId: reaktionRef.id,
    guestSessionId,
    explorerSessionId,
    demoSongId,
    demoRating,
    demoReaktionSubmitted: true,
    debugMessage: "Reaktion saved, session advanced, user total updated.",
  };
});