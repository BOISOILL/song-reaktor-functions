const functions = require("firebase-functions");
const admin = require("firebase-admin");
// Do not call admin.initializeApp() here.

function classifyScore(percent) {
  if (percent >= 90) return "Smash Hit";
  if (percent >= 80) return "A Single";
  if (percent >= 70) return "Album Song";
  return "Still Needs Work";
}

function getFinalDecision(avgScorePercent, highScoreCount, lowScoreCount) {
  if (avgScorePercent >= 90 && lowScoreCount === 0) {
    return "RELEASE — Strong Smash Hit signal";
  }
  if (avgScorePercent >= 90 && lowScoreCount > 0) {
    return "CONDITIONAL — Strong score, but fix weak points before release";
  }
  if (avgScorePercent >= 80) {
    return "RELEASE CANDIDATE — Strong single potential";
  }
  if (avgScorePercent >= 70) {
    return "RETEST — Album song potential, but not enough single conviction";
  }
  if (highScoreCount > 0 && lowScoreCount > 0) {
    return "WAIT — Polarizing record. Fix rejection signals before release";
  }
  return "WAIT — Do not release in current form";
}

function getSignal(avgScorePercent, highScoreCount, lowScoreCount, genericCommentCount) {
  if (highScoreCount > 0 && lowScoreCount > 0) return "Polarizing Record";
  if (avgScorePercent >= 90 && genericCommentCount >= highScoreCount) {
    return "Low-Conviction Signal";
  }
  if (avgScorePercent >= 90) return "Strong Hit Signal";
  if (avgScorePercent >= 80) return "Single Potential";
  if (avgScorePercent >= 70) return "Album Song Signal";
  return "Needs Work Signal";
}

function getConfidence(count) {
  if (count >= 50) return "High";
  if (count >= 20) return "Moderate";
  if (count >= 10) return "Early";
  return "Low — more Reaktions needed";
}

exports.generateReaktorAnalyzerReport = functions.https.onCall(async (request) => {
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
    throw new functions.https.HttpsError("not-found", "Song not found.");
  }

  const songData = songSnap.data() || {};

  const reaktionsSnap = await db
  .collection("reaktions")
  .where("songId", "==", songId)
  .limit(100)
  .get();

  let totalScore = 0;
  let count = 0;
  let highScoreCount = 0;
  let lowScoreCount = 0;
  let maxTimeCount = 0;
  let extendedCount = 0;
  let commentCount = 0;
  let genericCommentCount = 0;
  let fanLeadCount = 0;

  const lovedComments = [];
  const needsWorkComments = [];
  const allComments = [];

  reaktionsSnap.forEach((doc) => {
    const r = doc.data() || {};
    const score = Number(r.score || 0);
    const comment = String(r.comments || "").trim();

    if (score > 0) {
      totalScore += score;
      count += 1;
    }

    if (score >= 8) {
      highScoreCount += 1;
      fanLeadCount += 1;
      if (comment) lovedComments.push(comment);
    }

    if (score <= 6) {
      lowScoreCount += 1;
      if (comment) needsWorkComments.push(comment);
    }

    if (r.usedMaxExtension === true || r.listenerRetention === "Max-Time Listener") {
      maxTimeCount += 1;
    }

    if (Number(r.extraTimeRequestedMs || 0) > 0) {
      extendedCount += 1;
    }

    if (comment) {
      commentCount += 1;
      allComments.push(comment);

      const lower = comment.toLowerCase();
      const isGeneric =
        lower === "fire" ||
        lower === "good" ||
        lower === "solid" ||
        lower === "nice" ||
        lower.includes("cool") ||
        lower.includes("vibe") ||
        lower.includes("hard");

      if (isGeneric) genericCommentCount += 1;
    }
  });

  const avgScorePercent =
    count > 0 ? Math.round((totalScore / (count * 9)) * 100) : 0;

  const classification = classifyScore(avgScorePercent);
  const finalDecision = getFinalDecision(
    avgScorePercent,
    highScoreCount,
    lowScoreCount
  );
  const signal = getSignal(
    avgScorePercent,
    highScoreCount,
    lowScoreCount,
    genericCommentCount
  );
  const confidenceLevel = getConfidence(count);

  const extensionRate = count > 0 ? Math.round((extendedCount / count) * 100) : 0;
  const maxTimeRate = count > 0 ? Math.round((maxTimeCount / count) * 100) : 0;
  const commentRate = count > 0 ? Math.round((commentCount / count) * 100) : 0;
  const fanLeadRate = count > 0 ? Math.round((fanLeadCount / count) * 100) : 0;

  const buyingSignal =
    fanLeadRate >= 60
      ? "Strong buying-potential signal. Many listeners scored this song like future supporters."
      : fanLeadRate >= 30
        ? "Moderate buying-potential signal. There are fan leads, but more conviction is needed."
        : "Weak buying-potential signal. Listeners are not yet showing enough support intent.";

  const releaseRisk =
    lowScoreCount > highScoreCount
      ? "High release risk — rejection signals are stronger than support signals."
      : signal === "Low-Conviction Signal"
        ? "Replay risk — listeners like it, but feedback may not prove obsession yet."
        : avgScorePercent >= 80
          ? "Moderate release risk — strong response, but confirm retention and fan support."
          : "High release risk — improve and retest before investing in promotion.";

  const validationRequired =
    count < 20
      ? "More listener data is needed before making a final release decision."
      : "Enough early data exists to guide the next move, but retesting can improve confidence.";

  const report = {
    songId,
    songName: songData.song_name || songData.songName || "",
    artistName: songData.artist_name || songData.artistName || "",

    finalDecision,
    dambNeedleScore: avgScorePercent,
    classification,
    signal,
    confidenceLevel,
    releaseRisk,
    validationRequired,

    overallScoreInsight:
      avgScorePercent >= 90
        ? "The score is elite. The key question is whether listeners are deeply invested or only giving surface-level approval."
        : avgScorePercent >= 80
          ? "The song is showing strong single potential. The next focus is proving replay value and fan support."
          : avgScorePercent >= 70
            ? "The song has value, but the response is not strong enough yet to justify major promotion."
            : "The current response suggests the song needs improvement before release.",

    whatListenersLoved:
      lovedComments.length > 0
        ? lovedComments.slice(0, 5)
        : ["No strong positive written comments yet."],

    whatNeedsWork:
      needsWorkComments.length > 0
        ? needsWorkComments.slice(0, 5)
        : ["No clear negative written comments yet. Watch for low-conviction praise."],

    keyPatternInsight:
      signal === "Polarizing Record"
        ? "This song is creating both strong supporters and strong rejection. That can be powerful, but it must be stabilized before release."
        : signal === "Low-Conviction Signal"
          ? "The scores are strong, but the language may not prove deep emotional commitment yet."
          : "The listener response is pointing toward a clear classification. The next step is validating support behavior.",

    reaktorAnalyzerOpinion:
      avgScorePercent >= 80
        ? "Focus on proving replay value, fan support, and city-level demand before spending heavily on promotion."
        : "Improve the strongest weak point listeners identified, then retest with a similar audience.",

    buyingSignal,
    tourPotential:
      fanLeadCount >= 10
        ? "Potential tour/market signal exists. Review ZIP and city clusters before making location decisions."
        : "Not enough fan lead volume yet to make strong tour or market decisions.",

    hitPotential:
      avgScorePercent >= 90
        ? "High potential, but final release confidence depends on retention, conviction, and fan-support behavior."
        : avgScorePercent >= 80
          ? "Commercial potential exists. More evidence is needed before calling it a smash."
          : "Potential exists, but the song is not currently showing enough support for a major push.",

    finalRealityCheck:
      "A high score alone is not the whole answer. Song Reaktor is measuring whether listeners liked it, stayed engaged, and showed signs of real support.",

    metrics: {
      totalReaktions: count,
      highScoreCount,
      lowScoreCount,
      commentRate,
      extensionRate,
      maxTimeRate,
      fanLeadCount,
      fanLeadRate,
    },

    sampleComments: allComments.slice(0, 10),

    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await songRef.set(
    {
      reaktorAnalyzerReport: report,
      reaktorAnalyzerUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    success: true,
    ...report,
  };
});
