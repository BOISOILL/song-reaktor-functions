const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

// Set up Gmail SMTP
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "terryd@songreaktor.com",
    pass: "teiwrsrezmcrlopa", // replace this with your real Gmail app password!
  },
});

exports.sendVerificationCode = functions.https.onCall(async (data, context) => {
  const email = (data.email || "").trim();
  const deviceID = (data.deviceID || "").trim();
  const isGuest = data.isGuest || false;
  const userType = data.userType || "onboarding";

  console.log("📩 sendVerificationCode CALLED", { email, deviceID, isGuest, userType });

  if (!email || !deviceID) {
    console.error("❌ Missing email or deviceID");
    return false;
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000)); // 10 minutes

  const db = admin.firestore();
  const docId = `${email}_${deviceID}`;
  const docRef = db.collection("pending_verifications").doc(docId);

  try {
    console.log("📝 Writing verification to Firestore...");
    await docRef.set({
      email,
      code,
      deviceID,
      isVerified: false,
      isGuest,
      userType,
      expiresAt,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log("📬 Sending verification email...");

    const mailOptions = {
      from: "terryd@songreaktor.com",
      to: email,
      subject: "🎵 Your Song Reaktor 6-Digit Verification Code",
      text: `Your verification code is: ${code}`,
      html: `
        <p style="font-family:Arial,sans-serif;font-size:16px;color:#333;">
          Your <b>Song Reaktor</b> verification code is:<br><br>
          <h2 style="color:#4CAF50;">${code}</h2>
          <p>This code will expire in 10 minutes.</p>
        </p>
        <p>- The Song Reaktor Team</p>
      `,
    };

    await transporter.sendMail(mailOptions);

    console.log(`✅ Email sent successfully to ${email}`);
    return true;
  } catch (error) {
    console.error("🔥 Firestore write or email send failed:", error);
    return false;
  }
});
