const functions = require("firebase-functions");
const admin = require("firebase-admin");
// Do not call admin.initializeApp() here.

function classifyScore(percent) {
  if (percent >= 90) return "Smash Hit";
  if (percent >= 80) return "A Single";
  if (percent >= 70) return "Album Song";
  return "Still Needs Work";
}

function classifyListenerRetention(actualListenMs) {
  if (actualListenMs < 30000) return "Skipped Early";
  if (actualListenMs < 60000) return "Minimum Listen";
  if (actualListenMs < 90000) return "Engaged Listen";
  return "Max-Time Listener";
}

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

  const coverImageUrl = data.coverImageUrl || "";
  const orderNumber = data.orderNumber || "";
  const deviceId = data.deviceId || "";
  const userName = data.userName || "";
  const userCity = data.userCity || "";
  const userState = data.userState || "";
  const userZipCode = data.userZipCode || "";
  const userImage = data.userImage || "";
  const maxAllowedListenMs = data.maxAllowedListenMs || 90000;
  const submittedAfterUnlockMs = data.submittedAfterUnlockMs || 0;

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
  const songRef = db.collection("studio_uploads").doc(demoSongId);

  const scorePercent = Math.round((demoRating / 9) * 100);
  const songClassification = classifyScore(scorePercent);
  const listenerRetention = classifyListenerRetention(actualListenMs);
  const fanQualified = demoRating >= 8;

  await db.runTransaction(async (transaction) => {
    const explorerSnap = await transaction.get(explorerRef);
    const userSnap = await transaction.get(userRef);
    const songSnap = await transaction.get(songRef);

    if (!explorerSnap.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Explorer session not found."
      );
    }

    const explorerData = explorerSnap.data() || {};
    const userData = userSnap.exists ? userSnap.data() || {} : {};
    const songData = songSnap.exists ? songSnap.data() || {} : {};

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

    const existingSongReaktionCount = songData.total_reaktions || 0;
    const existingAvgPercent = songData.avg_score_percent || 0;

    const existingTotalScorePoints =
      songData.total_score_points ||
      Math.round((existingAvgPercent / 100) * 9 * existingSongReaktionCount);

    const newSongReaktionCount = existingSongReaktionCount + 1;
    const newTotalScorePoints = existingTotalScorePoints + demoRating;

    const newAvgScorePercentage = Math.round(
      (newTotalScorePoints / (newSongReaktionCount * 9)) * 100
    );

    const overallClassification = classifyScore(newAvgScorePercentage);

    const retentionUpdate = {
      minimum_listen_count: songData.minimum_listen_count || 0,
      engaged_listen_count: songData.engaged_listen_count || 0,
      max_time_count: songData.max_time_count || 0,
      early_skip_count: songData.early_skip_count || 0,
    };

    if (listenerRetention === "Skipped Early") {
      retentionUpdate.early_skip_count += 1;
    } else if (listenerRetention === "Minimum Listen") {
      retentionUpdate.minimum_listen_count += 1;
    } else if (listenerRetention === "Engaged Listen") {
      retentionUpdate.engaged_listen_count += 1;
    } else if (listenerRetention === "Max-Time Listener") {
      retentionUpdate.max_time_count += 1;
    }

    transaction.set(reaktionRef, {
      guestSessionId,
      explorerSessionId,
      userEmail,
      userDocId,
    
      songId: demoSongId,
      songName,
      artistName,
      artistEmail,
      coverImageUrl,
      orderNumber,
    
      score: demoRating,
      sliderValue: demoRating,
    
      songScorePercent: scorePercent,
      individualClassification: songClassification,
    
      comments,
    
      fanQualified,
    
      actualListenMs,
      requiredListenMs,
      maxAllowedListenMs,
      extraTimeRequestedMs,
      logoTapCount,
      usedMaxExtension,
      endedAtMs,
      submittedAfterUnlockMs,
      listenerRetention,
    
      deviceId,
      userName,
      userCity,
      userState,
      userZipCode,
      userImage,
    
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      reaktionSubmittedAt: admin.firestore.FieldValue.serverTimestamp(),
      reaktTime: admin.firestore.FieldValue.serverTimestamp(),
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
      songRef,
      {
        total_reaktions: newSongReaktionCount,
        total_score_points: newTotalScorePoints,
        avg_score_percent: newAvgScorePercentage,
        avg_score_percentage: newAvgScorePercentage,
        classification: overallClassification,
        overallClassification,

        minimum_listen_count: retentionUpdate.minimum_listen_count,
        engaged_listen_count: retentionUpdate.engaged_listen_count,
        max_time_count: retentionUpdate.max_time_count,
        early_skip_count: retentionUpdate.early_skip_count,

        lastReaktionAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

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
    scorePercent,
    songClassification,
    listenerRetention,
    fanQualified,
    demoReaktionSubmitted: true,
    debugMessage: "Reaktion saved, song stats updated, listener stats updated.",
  };
});