const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

const db = admin.firestore();

exports.exitGuestOnboarding = onCall(async (request) => {
  const data = request.data || {};

  const guestSessionId = data.guestSessionId;
  const currentIndex = data.currentIndex;
  const lastIndex = data.lastIndex;

  if (!guestSessionId || typeof guestSessionId !== "string") {
    throw new HttpsError("invalid-argument", "Missing guestSessionId.");
  }

  if (typeof currentIndex !== "number") {
    throw new HttpsError("invalid-argument", "Invalid currentIndex.");
  }

  if (typeof lastIndex !== "number") {
    throw new HttpsError("invalid-argument", "Invalid lastIndex.");
  }

  const ref = db.collection("guest_sessions").doc(guestSessionId);
  const snap = await ref.get();

  if (!snap.exists) {
    throw new HttpsError("not-found", "Guest session not found.");
  }

  const isCompleted = currentIndex >= lastIndex;

  const updateData = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (isCompleted) {
    updateData.status = "completed";
    updateData.demoStatus = "complete";
    updateData.isOnboardingComplete = true;
    updateData.completedAt = FieldValue.serverTimestamp();
  } else {
    updateData.status = "skipped";
    updateData.demoStatus = "skipped";
    updateData.isOnboardingComplete = false;
    updateData.skippedAt = FieldValue.serverTimestamp();
  }

  await ref.update(updateData);

  return {
    success: true,
    status: updateData.status,
    demoStatus: updateData.demoStatus,
    isOnboardingComplete: updateData.isOnboardingComplete,
  };
});