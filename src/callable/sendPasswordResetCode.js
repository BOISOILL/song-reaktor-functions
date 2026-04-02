const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { Timestamp, FieldValue } = require("firebase-admin/firestore");
const { sendEmail } = require("../helpers/sendEmail");
const { generate6DigitCode } = require("../helpers/generateCode");

const db = admin.firestore();

exports.sendPasswordResetCode = onCall(async (request) => {
  try {
    const data = request.data || {};

    const email = String(data.email || "").trim().toLowerCase();

    if (!email) {
      throw new HttpsError("invalid-argument", "Missing email.");
    }

    let authUser;
    try {
      authUser = await admin.auth().getUserByEmail(email);
    } catch (error) {
      throw new HttpsError("not-found", "No account found for that email.");
    }

    const docID = email;
    const docRef = db.collection("pending_password_resets").doc(docID);

    const existingDoc = await docRef.get();
    if (existingDoc.exists) {
      const lastCreated = existingDoc.data().createdAt?.toDate();
      if (lastCreated && Date.now() - lastCreated.getTime() < 30 * 1000) {
        throw new HttpsError(
          "resource-exhausted",
          "Please wait before requesting another reset code."
        );
      }
    }

    const code = generate6DigitCode();
    const expiresAt = Timestamp.fromDate(
      new Date(Date.now() + 10 * 60 * 1000)
    );

    await docRef.set({
      email,
      uid: authUser.uid,
      code,
      codeUsed: false,
      codeVerified: false,
      attemptCount: 0,
      locked: false,
      expired: false,
      isComplete: false,
      expiresAt,
      createdAt: FieldValue.serverTimestamp(),
      lastAttemptAt: null,
      verifiedAt: null,
      completedAt: null,
    });

    await sendEmail(
      email,
      "Your Song Reaktor Password Reset Code",
      `
        <div style="font-family:Arial,sans-serif;color:#111;line-height:1.5;">
          <h2 style="margin-bottom:8px;">Reset your Song Reaktor password</h2>
          <p>Use this 6-digit code to continue:</p>
          <div style="font-size:32px;font-weight:700;letter-spacing:6px;margin:16px 0;">
            ${code}
          </div>
          <p>This code expires in 10 minutes.</p>
          <p>If you did not request this, you can ignore this email.</p>
        </div>
      `
    );

    return {
      success: true,
      message: "Password reset code sent.",
    };
  } catch (error) {
    console.error("sendPasswordResetCode failed:", error);

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError(
      "internal",
      error.message || "Failed to send password reset code."
    );
  }
});