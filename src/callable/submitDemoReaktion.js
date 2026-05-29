const functions = require("firebase-functions");
const admin = require("firebase-admin");
// Do not call admin.initializeApp() here.

function calculateListenerStats(totalReaktions) {
  let voiceWeight = 1;
  let listenerTier = "Listener";
  let nextTierTarget = 10;

  if (totalReaktions >= 10) {
    voiceWeight = 2;
    listenerTier = "Single Sniper";
    nextTierTarget = 25;
  }

  if (totalReaktions >= 25) {
    voiceWeight = 3;
    listenerTier = "Hit Finder";
    nextTierTarget = 50;
  }

  if (totalReaktions >= 50) {
    voiceWeight = 4;
    listenerTier = "D.A.M.B. Certified";
    nextTierTarget = 100;
  }

  if (totalReaktions >= 100) {
    voiceWeight = 5;
    listenerTier = "Trend Setter";
    nextTierTarget = 250;
  }

  if (totalReaktions >= 250) {
    voiceWeight = 6;
    listenerTier = "Tastemaker";
    nextTierTarget = 500;
  }

  if (totalReaktions >= 500) {
    voiceWeight = 7;
    listenerTier = "A&R Assassin";
    nextTierTarget = 1000;
  }

  if (totalReaktions >= 1000) {
    voiceWeight = 10;
    listenerTier = "D.A.M.B. Needle Elite";
    nextTierTarget = 1000;
  }

  const tierStart =
    totalReaktions >= 1000 ? 1000 :
    totalReaktions >= 500 ? 500 :
    totalReaktions >= 250 ? 250 :
    totalReaktions >= 100 ? 100 :
    totalReaktions >= 50 ? 50 :
    totalReaktions >= 25 ? 25 :
    totalReaktions >= 10 ? 10 :
    0;

  const tierRange = nextTierTarget - tierStart;

  const progressPercent =
    totalReaktions >= 1000
      ? 100
      : Math.min(
          Math.round(((totalReaktions - tierStart) / tierRange) * 100),
          100
        );

  return {
    voiceWeight,
    listenerTier,
    progressPercent,
    nextTierTarget,
  };
}

exports.submitDemoReaktion = functions.https.onCall(async (request) => {
  const data = request.data || request.body?.data || request.body || request;

  const guestSessionId = data.guestSessionId || "";
  const explorerSessionId = data.explorerSessionId;
  const userEmail = data.userEmail;
  const userDocId = data.userDocId;
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

  if (!userDocId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "userDocId is required."
    );
  }

  const db = admin.firestore();

  const explorerRef = db.collection("explorer_sessions").doc(explorerSessionId);
  const userRef = db.collection("users").doc(userDocId);
  const reaktionRef = db.collection("reaktions").doc();

  await db.runTransaction(async (transaction) => {
    const explorerSnap = await transaction.get(explorerRef);
    const userSnap = await transaction.get(userRef);

    if (!explorerSnap.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Explorer session not found."
      );
    }

    const explorerData = explorerSnap.data() || {};
    const userData = userSnap.exists ? userSnap.data() || {} : {};

    const currentSongIndex = explorerData.currentSongIndex || 0;
    const unlockedSongIndex = explorerData.unlockedSongIndex || 0;
    const completedSongIds = explorerData.completedSongIds || [];

    const nextSongIndex = currentSongIndex + 1;

    const updatedCompletedSongIds = completedSongIds.includes(demoSongId)
      ? completedSongIds
      : [...completedSongIds, demoSongId];

    const newTotalReaktions = (userData.totalReaktions || 0) + 1;
    const newDambCoins = (userData.dambCoins || 0) + 1;
    const listenerStats = calculateListenerStats(newTotalReaktions);

    transaction.set(reaktionRef, {
      guestSessionId,
      explorerSessionId,
      userEmail,
      userDocId,
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
      userDocId,
      userEmail,
      mode: "demo",
      status: "active",
    
      completedSongIds: updatedCompletedSongIds,
      lastCompletedSongId: demoSongId,
      currentSongIndex: nextSongIndex,
      unlockedSongIndex: Math.max(unlockedSongIndex, nextSongIndex),
      lastDemoRating: demoRating || null,
      totalReaktions: admin.firestore.FieldValue.increment(1),
    
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    transaction.set(
      userRef,
      {
        email: userEmail,
        memberSinceYear:
          userData.memberSinceYear ||
          (userData.created_time?.toDate
            ? userData.created_time.toDate().getFullYear().toString()
            : new Date().getFullYear().toString()),
    
        totalReaktions: newTotalReaktions,
        dambCoins: newDambCoins,
        voiceWeight: listenerStats.voiceWeight,
        progressPercent: listenerStats.progressPercent,
        listenerTier: listenerStats.listenerTier,
        nextTierTarget: listenerStats.nextTierTarget,
    
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
    userDocId,
    demoSongId,
    demoRating,
    demoReaktionSubmitted: true,
    debugMessage: "Reaktion saved, session advanced, listener stats updated.",
  };
});