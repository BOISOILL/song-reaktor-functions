const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { Timestamp, FieldValue } = require("firebase-admin/firestore");

const db = admin.firestore();
const MAX_ATTEMPTS = 5;

exports.verifyPasswordResetCode = onCall(async (request) => {
  try {
    const data = request.data || {};

    const email = String(data.email || "").trim().toLowerCase();
    const code = String(data.code || "").trim();

    if (!email || !code) {
      throw new HttpsError(
        "invalid-argument",
        "Missing email or code."
      );
    }

    const docID = email;
    const resetRef = db.collection("pending_password_resets").doc(docID);
    const resetSnap = await resetRef.get();

    if (!resetSnap.exists) {
      throw new HttpsError(
        "not-found",
        "Password reset request not found."
      );
    }

    const resetData = resetSnap.data();

    if (resetData.locked === true) {
      throw new HttpsError(
        "resource-exhausted",
        "Too many failed attempts. Please request a new reset code."
      );
    }

    if (resetData.codeUsed === true || resetData.isComplete === true) {
      throw new HttpsError(
        "failed-precondition",
        "This password reset code has already been used."
      );
    }

    const savedCode = String(resetData.code || "").trim();
    const expiresAt = resetData.expiresAt;
    const attemptCount = Number(resetData.attemptCount || 0);

    if (!savedCode) {
      throw new HttpsError(
        "failed-precondition",
        "Stored password reset code is missing."
      );
    }

    if (!(expiresAt instanceof Timestamp)) {
      throw new HttpsError(
        "internal",
        "Stored expiration timestamp is invalid."
      );
    }

    if (expiresAt.toMillis() < Date.now()) {
      await resetRef.update({
        locked: true,
        expired: true,
        expiredAt: FieldValue.serverTimestamp(),
        code: FieldValue.delete(),
        attemptCount: 0,
        lastAttemptAt: FieldValue.serverTimestamp(),
      });

      throw new HttpsError(
        "deadline-exceeded",
        "Password reset code has expired."
      );
    }

    if (savedCode !== code) {
      const newAttemptCount = attemptCount + 1;
      const shouldLock = newAttemptCount >= MAX_ATTEMPTS;

      await resetRef.update({
        attemptCount: newAttemptCount,
        locked: shouldLock,
        lastAttemptAt: FieldValue.serverTimestamp(),
      });

      if (shouldLock) {
        throw new HttpsError(
          "resource-exhausted",
          "Too many failed attempts. Please request a new reset code."
        );
      }

      throw new HttpsError(
        "invalid-argument",
        "Invalid password reset code."
      );
    }

    await resetRef.update({
      codeVerified: true,
      verifiedAt: FieldValue.serverTimestamp(),
      attemptCount: 0,
      locked: false,
      expired: false,
      lastAttemptAt: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      message: "Password reset code verified.",
      canResetPassword: true,
    };
  } catch (error) {
    console.error("verifyPasswordResetCode failed:", error);

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError(
      "internal",
      error.message || "Password reset code verification failed."
    );
  }
});