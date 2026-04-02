const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { Timestamp, FieldValue } = require("firebase-admin/firestore");

const db = admin.firestore();

function validatePassword(password) {
  if (typeof password !== "string") return false;
  return password.length >= 8;
}

exports.resetPasswordWithCode = onCall(async (request) => {
  try {
    const data = request.data || {};

    const email = String(data.email || "").trim().toLowerCase();
    const code = String(data.code || "").trim();
    const newPassword = String(data.newPassword || "");
    const confirmPassword = String(data.confirmPassword || "");

    if (!email || !code || !newPassword || !confirmPassword) {
      throw new HttpsError(
        "invalid-argument",
        "Missing email, code, or new password."
      );
    }

    if (newPassword !== confirmPassword) {
      throw new HttpsError("invalid-argument", "Passwords do not match.");
    }

    if (!validatePassword(newPassword)) {
      throw new HttpsError(
        "invalid-argument",
        "Password must be at least 8 characters."
      );
    }

    const docID = email;
    const resetRef = db.collection("pending_password_resets").doc(docID);
    const userDocRef = db.collection("users").doc(email);

    const resetSnap = await resetRef.get();

    if (!resetSnap.exists) {
      throw new HttpsError("not-found", "Password reset request not found.");
    }

    const resetData = resetSnap.data();

    if (resetData.isComplete === true || resetData.codeUsed === true) {
      throw new HttpsError(
        "failed-precondition",
        "This password reset request has already been completed."
      );
    }

    if (resetData.locked === true) {
      throw new HttpsError(
        "resource-exhausted",
        "This password reset request is locked. Please request a new code."
      );
    }

    const expiresAt = resetData.expiresAt;
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
      });

      throw new HttpsError(
        "deadline-exceeded",
        "Password reset code has expired."
      );
    }

    if (resetData.codeVerified !== true) {
      throw new HttpsError(
        "failed-precondition",
        "Verify the password reset code before setting a new password."
      );
    }

    const savedCode = String(resetData.code || "").trim();
    if (savedCode !== code) {
      throw new HttpsError(
        "invalid-argument",
        "Password reset code does not match."
      );
    }

    const authUser = await admin.auth().getUserByEmail(email);
    await admin.auth().updateUser(authUser.uid, {
      password: newPassword,
    });

    await userDocRef.set(
      {
        email,
        updatedAt: FieldValue.serverTimestamp(),
        lastPasswordResetAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await resetRef.update({
      isComplete: true,
      codeUsed: true,
      completedAt: FieldValue.serverTimestamp(),
      code: FieldValue.delete(),
      locked: false,
      expired: false,
    });

    return {
      success: true,
      message: "Password updated successfully.",
    };
  } catch (error) {
    console.error("resetPasswordWithCode failed:", error);

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError(
      "internal",
      error.message || "Failed to reset password."
    );
  }
});