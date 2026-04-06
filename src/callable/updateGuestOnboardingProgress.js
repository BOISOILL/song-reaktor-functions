const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

const db = admin.firestore();

exports.updateGuestOnboardingProgress = onCall({ cpu: 1 }, async (request) => {
  const data = request.data || {};

  const guestSessionId = (data.guestSessionId || "").trim();
  const newIndex = Number(data.newIndex);

  if (!guestSessionId) {
    throw new HttpsError("invalid-argument", "Missing guestSessionId.");
  }

  if (Number.isNaN(newIndex) || newIndex < 0) {
    throw new HttpsError("invalid-argument", "Missing or invalid newIndex.");
  }

  const screenMap = {
    0: "welcome_onboarding",
    1: "lots_to_explore",
    2: "damb_needle",
    3: "listening_studios",
    4: "empower_music_fans",
    5: "damb_coins",
    6: "the_moment",
  };

  const sessionRef = db.collection("guest_sessions").doc(guestSessionId);
  const sessionSnap = await sessionRef.get();

  if (!sessionSnap.exists) {
    throw new HttpsError("not-found", "Guest session not found.");
  }

  const sessionData = sessionSnap.data() || {};
  const previousSlidesSeen =
    typeof sessionData.slidesSeen === "number" ? sessionData.slidesSeen : 0;

  const newSlidesSeen = Math.max(previousSlidesSeen, newIndex + 1);

  await sessionRef.update({
    currentSlideIndex: newIndex,
    slidesSeen: newSlidesSeen,
    lastScreen: screenMap[newIndex] || "onboarding",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    success: true,
    guestSessionId,
    currentSlideIndex: newIndex,
    slidesSeen: newSlidesSeen,
    lastScreen: screenMap[newIndex] || "onboarding",
  };
});