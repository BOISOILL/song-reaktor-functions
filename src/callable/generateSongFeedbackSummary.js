const functions = require("firebase-functions");
const admin = require("firebase-admin");
// Do not call admin.initializeApp() here.

function classifyScore(percent) {
  if (percent >= 90) return "Smash Hit";
  if (percent >= 80) return "A Single";
  if (percent >= 70) return "Album Song";
  return "Still Needs Work";
}

exports.generateSongFeedbackSummary = functions.https.onCall(async (request) => {
  const data = request.data || {};
  const songId = data.songId;

  if (!songId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "songId is required."
    );
  }

  const db = admin.firestore();

  const songRef = db.collection("studio_uploads").doc(songId);
  const songSnap = await songRef.get();

  if (!songSnap.exists) {
    throw new functions.https.HttpsError(
      "not-found",
      "Song not found."
    );
  }

  const songData = songSnap.data() || {};

  const reaktionsSnap = await db
    .collection("reaktions")
    .where("songId", "==", songId)
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();

  const comments = [];
  let totalScore = 0;
  let count = 0;
  let highScores = 0;
  let lowScores = 0;
  let maxTimeCount = 0;
  let engagedCount = 0;

  reaktionsSnap.forEach((doc) => {
    const r = doc.data() || {};
    const score = Number(r.score || 0);

    if (score > 0) {
      totalScore += score;
      count += 1;
    }

    if (score >= 8) highScores += 1;
    if (score <= 6) lowScores += 1;

    if (r.listenerRetention === "Max-Time Listener") maxTimeCount += 1;
    if (r.listenerRetention === "Engaged Listen") engagedCount += 1;

    if (r.comments && String(r.comments).trim() !== "") {
      comments.push(String(r.comments).trim());
    }
  });

  const avgScorePercent =
    count > 0 ? Math.round((totalScore / (count * 9)) * 100) : 0;

  const classification = classifyScore(avgScorePercent);

  let releaseRecommendation = "Needs more listener data.";

  if (avgScorePercent >= 90 && highScores >= 3) {
    releaseRecommendation = "Push this song hard. It is showing Smash Hit potential.";
  } else if (avgScorePercent >= 80) {
    releaseRecommendation = "This looks like a strong single candidate. Consider promoting it.";
  } else if (avgScorePercent >= 70) {
    releaseRecommendation = "This may work as an album song, but it may need more testing before major promotion.";
  } else if (count > 0) {
    releaseRecommendation = "Hold off on promotion. Improve the song and retest.";
  }

  const listenerSummary =
    comments.length > 0
      ? comments.slice(0, 5).join(" | ")
      : "No written listener comments yet.";

  const feedbackSummary = {
    songId,
    songName: songData.song_name || songData.songName || "",
    artistName: songData.artist_name || songData.artistName || "",
    totalReaktions: count,
    avgScorePercent,
    classification,
    highScoreCount: highScores,
    lowScoreCount: lowScores,
    maxTimeCount,
    engagedCount,
    listenerSummary,
    releaseRecommendation,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await songRef.set(
    {
      aiFeedbackSummary: feedbackSummary,
      aiFeedbackUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    success: true,
    ...feedbackSummary,
  };
});
