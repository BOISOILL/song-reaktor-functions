const functions = require("firebase-functions");
const admin = require("firebase-admin");
// Do not call admin.initializeApp() here.

exports.getSimilarFanInterests = functions.https.onCall(async (request) => {
  const data = request.data || request.body?.data || request.body || request;
  const songId = data.songId;

  if (!songId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "songId is required."
    );
  }

  const db = admin.firestore();

  const lovedThisSongSnap = await db
    .collection("reaktions")
    .where("songId", "==", songId)
    .where("score", ">=", 8)
    .get();

  const fanUserDocIds = new Set();

  lovedThisSongSnap.forEach((doc) => {
    const reaktion = doc.data() || {};
    if (reaktion.userDocId) {
      fanUserDocIds.add(reaktion.userDocId);
    }
  });

  if (fanUserDocIds.size === 0) {
    return {
      success: true,
      songId,
      baseFanCount: 0,
      similarSongs: [],
    };
  }

  const fanIdsArray = Array.from(fanUserDocIds);
  const similarSongCounts = {};
  const similarSongNames = {};

  for (let i = 0; i < fanIdsArray.length; i += 10) {
    const batch = fanIdsArray.slice(i, i + 10);

    const otherLovedSongsSnap = await db
      .collection("reaktions")
      .where("userDocId", "in", batch)
      .where("score", ">=", 8)
      .get();

    otherLovedSongsSnap.forEach((doc) => {
      const reaktion = doc.data() || {};
      const otherSongId = reaktion.songId;

      if (!otherSongId || otherSongId === songId) {
        return;
      }

      similarSongCounts[otherSongId] =
        (similarSongCounts[otherSongId] || 0) + 1;

      similarSongNames[otherSongId] =
        reaktion.songName || similarSongNames[otherSongId] || "Unknown Song";
    });
  }

  const baseFanCount = fanIdsArray.length;

  const similarSongs = Object.entries(similarSongCounts)
    .map(([otherSongId, count]) => {
      const matchPercent = Math.round((count / baseFanCount) * 100);

      return {
        songId: otherSongId,
        songName: similarSongNames[otherSongId],
        sharedFanCount: count,
        baseFanCount,
        matchPercent,
      };
    })
    .sort((a, b) => b.matchPercent - a.matchPercent)
    .slice(0, 5);

  return {
    success: true,
    songId,
    baseFanCount,
    similarSongs,
  };
});
