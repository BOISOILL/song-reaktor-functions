const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { Timestamp, FieldValue } = require("firebase-admin/firestore");

const db = admin.firestore();
const MAX_ATTEMPTS = 5;

exports.verifyCode = onCall(async (request) => {
  try {
    const data = request.data || {};

    const email = String(data.email || "").trim().toLowerCase();
    const deviceID = String(data.deviceID || data.deviceId || "").trim();
    const code = String(data.code || "").trim();

    if (!email || !deviceID || !code) {
      throw new HttpsError(
        "invalid-argument",
        "Missing email, deviceID, or code."
      );
    }

    const verificationDocID = `${email}_${deviceID}`;
    const verificationRef = db.collection("pending_verifications").doc(verificationDocID);
    const userRef = db.collection("users").doc(email);

    const verificationSnap = await verificationRef.get();

    if (!verificationSnap.exists) {
      throw new HttpsError("not-found", "Verification request not found.");
    }

    const verificationData = verificationSnap.data();

    if (verificationData.locked === true) {
      throw new HttpsError(
        "resource-exhausted",
        "Too many failed attempts. Please request a new code."
      );
    }

    if (verificationData.codeUsed === true) {
      throw new HttpsError(
        "failed-precondition",
        "This verification code has already been used."
      );
    }

    const savedCode = String(verificationData.code || "").trim();
    const expiresAt = verificationData.expiresAt;
    const attemptCount = Number(verificationData.attemptCount || 0);
    const isGuest = !!verificationData.isGuest;
    const userType = String(verificationData.userType || "listener").trim();

    if (!savedCode) {
      throw new HttpsError(
        "failed-precondition",
        "Stored verification code is missing."
      );
    }

    if (!(expiresAt instanceof Timestamp)) {
      throw new HttpsError(
        "internal",
        "Stored expiration timestamp is invalid."
      );
    }

    if (expiresAt.toMillis() < Date.now()) {
      await verificationRef.update({
        locked: true,
        expired: true,
        expiredAt: FieldValue.serverTimestamp(),
        code: FieldValue.delete(),
        lastAttemptAt: FieldValue.serverTimestamp(),
      });

      throw new HttpsError(
        "deadline-exceeded",
        "Verification code has expired."
      );
    }

    if (savedCode !== code) {
      const newAttemptCount = attemptCount + 1;
      const shouldLock = newAttemptCount >= MAX_ATTEMPTS;

      await verificationRef.update({
        attemptCount: newAttemptCount,
        locked: shouldLock,
        lastAttemptAt: FieldValue.serverTimestamp(),
      });

      if (shouldLock) {
        throw new HttpsError(
          "resource-exhausted",
          "Too many failed attempts. Please request a new code."
        );
      }

      throw new HttpsError("invalid-argument", "Invalid verification code.");
    }

    const userSnap = await userRef.get();
    const isNewUser = !userSnap.exists;

    if (isNewUser) {
      await userRef.set({
        email,
        userType,
        isGuest,
        isVerified: true,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        lastLoginAt: FieldValue.serverTimestamp(),
        lastVerifiedAt: FieldValue.serverTimestamp(),
        lastDeviceID: deviceID,
        profileComplete: false,
      });
    } else {
      await userRef.set(
        {
          email,
          userType,
          isGuest,
          isVerified: true,
          updatedAt: FieldValue.serverTimestamp(),
          lastLoginAt: FieldValue.serverTimestamp(),
          lastVerifiedAt: FieldValue.serverTimestamp(),
          lastDeviceID: deviceID,
        },
        { merge: true }
      );
    }

    await verificationRef.update({
      isVerified: true,
      verifiedAt: FieldValue.serverTimestamp(),
      codeUsed: true,
      code: FieldValue.delete(),
      attemptCount: 0,
      locked: false,
      expired: false,
      lastAttemptAt: FieldValue.serverTimestamp(),
    });

    const nextStep = isNewUser ? "complete_profile" : "go_to_dashboard";

    return {
      success: true,
      message: "Code verified successfully.",
      isNewUser,
      nextStep,
      user: {
        email,
        userType,
        isGuest,
        isVerified: true,
        lastDeviceID: deviceID,
      },
    };
  } catch (error) {
    console.error("verifyCode failed:", error);

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError(
      "internal",
      error.message || "Code verification failed."
    );
  }
});