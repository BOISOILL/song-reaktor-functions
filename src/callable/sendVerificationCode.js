const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { Timestamp, FieldValue } = require("firebase-admin/firestore");
const crypto = require("crypto");
const { sendEmail } = require("../helpers/sendEmail");
const { generate6DigitCode } = require("../helpers/generateCode");

const db = admin.firestore();

exports.sendVerificationCode = onCall(async (request) => {
  try {
    const data = request.data || {};

    const email = String(data.email || "").trim().toLowerCase();
    let deviceID = String(data.deviceID || data.deviceId || "").trim();
    const isGuest = !!data.isGuest;
    const userType = String(data.userType || "listener").trim();

    if (!email) {
      throw new HttpsError("invalid-argument", "Missing email.");
    }

    // Auto-create deviceID if frontend didn't provide one
    if (!deviceID) {
      deviceID = crypto.randomUUID();
    }

    const docID = `${email}_${deviceID}`;
    const docRef = db.collection("pending_verifications").doc(docID);

    const existingDoc = await docRef.get();

    if (existingDoc.exists) {
      const lastCreated = existingDoc.data().createdAt?.toDate();
      if (lastCreated && Date.now() - lastCreated.getTime() < 30 * 1000) {
        throw new HttpsError(
          "resource-exhausted",
          "Please wait before requesting another code."
        );
      }
    }

    const code = generate6DigitCode();
    const expiresAt = Timestamp.fromDate(
      new Date(Date.now() + 10 * 60 * 1000)
    );

    await docRef.set({
      email,
      deviceID,
      code,
      isGuest,
      userType,
      isVerified: false,
      expiresAt,
      createdAt: FieldValue.serverTimestamp(),
      attemptCount: 0,
      locked: false,
      expired: false,
      codeUsed: false,
    });

    await sendEmail(
      email,
      "Your Song Reaktor Code",
      `
        <h2>Your verification code</h2>
        <h1>${code}</h1>
        <p>This expires in 10 minutes.</p>
      `
    );

    return {
      success: true,
      message: "Verification code sent.",
      deviceID, // return it so FlutterFlow can reuse it
    };
  } catch (error) {
    console.error("sendVerificationCode failed:", error);

    if (error instanceof HttpsError) throw error;

    throw new HttpsError(
      "internal",
      error.message || "Failed to send verification code."
    );
  }
});