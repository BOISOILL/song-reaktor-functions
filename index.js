// --------------------- imports & setup (unchanged) ---------------------
const { onObjectFinalized } = require("firebase-functions/v2/storage");
const { onCall, onRequest } = require("firebase-functions/v2/https");
const functions = require("firebase-functions"); // For Gen1 triggers
const admin = require("firebase-admin");
const { Storage } = require("@google-cloud/storage");
const sgMail = require("@sendgrid/mail");
const nodemailer = require("nodemailer");
const stripeLib = require("stripe");
const path = require("path");
const os = require("os");
const fs = require("fs");
const sharp = require("sharp");

admin.initializeApp();
const db = admin.firestore();
const gcs = new Storage();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "terryd@songreaktor.com",
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

// --------------------- sendVerificationCode (unchanged) ---------------------
exports.sendVerificationCode = onCall(
  {
    cpu: 1,
    secrets: ["GMAIL_APP_PASSWORD"],
  },
  async (data, context) => {
    const email = (data.email || "").trim();
    const deviceID = (data.deviceID || "").trim();
    const isGuest = data.isGuest || false;
    const userType = data.userType || "onboarding";

    if (!email || !deviceID) {
      console.error("❌ Missing email or deviceID");
      return false;
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + 10 * 60 * 1000)
    );
    const docId = `${email}_${deviceID}`;
    const docRef = db.collection("pending_verifications").doc(docId);

    try {
      await docRef.set({
        email,
        code,
        deviceID,
        isGuest,
        userType,
        isVerified: false,
        expiresAt,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await transporter.sendMail({
        from: "terryd@songreaktor.com",
        to: email,
        subject: "🎵 Your Song Reaktor Verification Code",
        html: `
          <p>Your <b>Song Reaktor</b> verification code is:</p>
          <h2 style="color:#4CAF50;">${code}</h2>
          <p>This code will expire in 10 minutes.</p>
          <br>
          <p>– The Song Reaktor Team</p>
        `,
      });

      console.log(`✅ Verification email sent to ${email}`);
      return true;
    } catch (error) {
      console.error("🔥 Error sending verification code:", error);
      return false;
    }
  }
);

// --------------------- verifyCodeV2 (unchanged) ---------------------
exports.verifyCodeV2 = onCall({ cpu: 1 }, async (data, context) => {
  const email = (data.email || "").trim();
  const deviceID = (data.deviceID || "").trim();
  const enteredCode = (data.code || "").trim();

  const docId = `${email}_${deviceID}`;
  const docRef = db.collection("pending_verifications").doc(docId);
  const doc = await docRef.get();

  if (!doc.exists) return false;

  const dataStored = doc.data();
  const savedCode = dataStored.code;
  const expiresAt = dataStored.expiresAt.toDate();

  if (enteredCode !== savedCode || new Date() > expiresAt) {
    return false;
  }

  await docRef.update({ isVerified: true });
  return true;
});

// --------------------- stripeWebhook (unchanged) ---------------------
exports.stripeWebhook = onRequest(
  {
    cpu: 1,
    region: "us-central1",
    cors: true,
    rawBody: true,
    secrets: ["STRIPE_WEBHOOK_SECRET"],
    allowInvalidAppCheckToken: true,
  },
  async (req, res) => {
    const stripeSignature = req.headers["stripe-signature"];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!req.rawBody) {
      return res.status(400).send("Missing rawBody.");
    }

    let event;
    try {
      event = stripeLib.webhooks.constructEvent(
        req.rawBody,
        stripeSignature,
        endpointSecret
      );
    } catch (err) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
      try {
        const session = event.data.object;
        const email =
          session.customer_details?.email ||
          session.metadata?.email ||
          "unknown";
        const orderNumber = `${Math.floor(100000 + Math.random() * 900000)}`;

        await db.collection("orders").add({
          order_number: orderNumber,
          email,
          is_used: false,
          created_at: admin.firestore.FieldValue.serverTimestamp(),
        });

        await transporter.sendMail({
          from: "terryd@songreaktor.com",
          to: email,
          subject: "✅ Your Song Reaktor Order #",
          html: `
            <p>Thanks for your purchase!</p>
            <p>Your <b>Order Number</b> is:</p>
            <h2 style="color:#4CAF50;">${orderNumber}</h2>
            <p>Enter this number in the app to upload your song.</p>
            <br>
            <p>– The Song Reaktor Team</p>
          `,
        });

        console.log(`📧 Order confirmation sent to ${email}`);
        return res.json({ received: true });
      } catch (error) {
        console.error("🔥 Error during Stripe order flow:", error);
        return res.status(500).send("Internal Error");
      }
    }

    res.json({ received: true });
  }
);

// --------------------- getLatestOrderCode (unchanged) ---------------------
exports.getLatestOrderCode = onCall({ cpu: 1 }, async (data, context) => {
  const email = (data.email || "").trim();

  if (!email) {
    return { success: false, message: "Missing email." };
  }

  const ordersRef = db.collection("orders");

  try {
    const snapshot = await ordersRef
      .where("email", "==", email)
      .where("is_used", "==", false)
      .orderBy("created_at", "desc")
      .limit(1)
      .get();

    if (snapshot.empty) {
      return { success: false, message: "No unused order found." };
    }

    const doc = snapshot.docs[0];
    const orderCode = doc.data().order_number || "";

    return {
      success: true,
      orderCode,
      fullOrder: orderCode,
    };
  } catch (error) {
    console.error("🔥 Error in getLatestOrderCode:", error);
    return { success: false, message: "Server error." };
  }
});

// --------------------- getCityStateByZip (unchanged) ---------------------
exports.getCityStateByZip = onCall({ cpu: 1 }, async (data, context) => {
  const zip = (data.zip || "").trim();

  if (!zip) {
    return { success: false, message: "Missing ZIP code." };
  }

  try {
    const doc = await db.collection("zip_lookup").doc(zip).get();

    if (!doc.exists) {
      return { success: false, message: "ZIP code not found." };
    }

    const { city, state } = doc.data();

    return {
      success: true,
      city,
      state,
    };
  } catch (error) {
    console.error("🔥 Error in getCityStateByZip:", error);
    return { success: false, message: "Server error." };
  }
});

// --------------------- createCheckoutSession (left as-is) ---------------------
exports.createCheckoutSession = onCall(
  {
    region: "us-central1",
    secrets: ["STRIPE_SECRET_KEY"],
  },
  async (req) => {
    // ⬇️ Left unchanged to avoid breaking anything
    const stripe = stripeLib(STRIPE_SECRET_KEY.value());
    const { email, orderNumber } = req.data;

    if (!email || !orderNumber) {
      console.error("❌ Missing email or orderNumber:", { email, orderNumber });
      throw new Error("Missing email or orderNumber");
    }

    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: "Song Reaktor Upload Credit",
                description: "1 song upload + 10 Reaktions",
              },
              unit_amount: 2000,
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: "https://yourdomain.com/success",
        cancel_url: "https://yourdomain.com/cancel",
        customer_email: email,
        client_reference_id: orderNumber,
      });

      console.log("✅ Stripe session created:", session.url);
      return {
        url: session.url,
        sessionId: session.id,
      };
    } catch (err) {
      console.error("🔥 Stripe session creation failed:", err);
      throw new Error("Stripe session creation failed");
    }
  }
);

// --------------------- sendVerificationEmailV2 (unchanged) ---------------------
exports.sendVerificationEmailV2 = onCall(
  {
    cpu: 1,
    secrets: ["SENDGRID_API_KEY"],
  },
  async (data, context) => {
    const { email, code, name = "Guest" } = data;

    console.log("📩 Incoming data:", data);

    if (!email || !code) {
      console.error("❌ Missing email or code:", { email, code });
      throw new Error("Missing email or code");
    }

    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    const msg = {
      to: email,
      from: { email: "terryd@songreaktor.com", name: "Song Reaktor" },
      subject: "🎵 Your Song Reaktor Login Code",
      html: `
        <body style="font-family: Arial, sans-serif; background-color: #111; color: #eee; text-align: center; padding: 40px;">
          <h2>🎧 Welcome to Song Reaktor 🎧</h2>
          <p>Your 6-digit verification code is:</p>
          <h1 style="font-size: 36px; letter-spacing: 4px;">${code}</h1>
          <p>This code will expire shortly. Enter it in the app to proceed.</p>
        </body>
      `,
    };

    try {
      await sgMail.send(msg);
      console.log(`✅ Email sent to ${email}`);
      return { success: true };
    } catch (error) {
      console.error("SendGrid Error:", error.response?.body || error.message);
      throw new Error("Failed to send email.");
    }
  }
);

// --------------------- onReaktionWrite (updates only the reaktion doc) ---------------------
exports.onReaktionWrite = functions.firestore
  .document("reaktions/{reaktionId}")
  .onWrite(async (change, context) => {
    const newValue = change.after.exists ? change.after.data() : null;
    const oldValue = change.before.exists ? change.before.data() : null;

    const songName = newValue?.song_name || oldValue?.song_name;
    const artistName = newValue?.artist_name || oldValue?.artist_name;
    const orderNumber = newValue?.order_number || oldValue?.order_number;

    if (!songName || !artistName || !orderNumber) {
      console.log("❌ Missing one of: song_name, artist_name, or order_number.");
      return null;
    }

    try {
      // 1) Recompute average across all reaktions for this song/order
      const snap = await db
        .collection("reaktions")
        .where("song_name", "==", songName)
        .where("artist_name", "==", artistName)
        .where("order_number", "==", orderNumber)
        .get();

      if (snap.empty) return null;

      const scores = snap.docs.map((d) => d.data().emoji_score || 0);
      const avgRaw = scores.reduce((a, b) => a + b, 0) / scores.length;
      const avgPct = parseFloat(((avgRaw / 9) * 100).toFixed(1));

      // 2) Pull cover image from matching studio_uploads (read-only)
      const uploadQ = await db
        .collection("studio_uploads")
        .where("song_name", "==", songName)
        .where("artist_name", "==", artistName)
        .where("order_number", "==", orderNumber)
        .limit(1)
        .get();

      const coverImageUrl = uploadQ.empty
        ? ""
        : uploadQ.docs[0].data().cover_image_url || "";

      // 3) Update ONLY the reaktion doc that changed (avoid loop/noise)
      if (change.after.exists) {
        const updates = {};
        if ((newValue?.avg_score_percent ?? null) !== avgPct) {
          updates.avg_score_percent = avgPct;
        }
        if (coverImageUrl && newValue?.cover_image_url !== coverImageUrl) {
          updates.cover_image_url = coverImageUrl;
        }
        if (Object.keys(updates).length) {
          await change.after.ref.update(updates);
        }
      }

      // 4) Optional per-user marker (only on CREATE)
      if (!change.before.exists) {
        const userIdOrEmail = newValue.user_id || newValue.user_email;
        if (userIdOrEmail && orderNumber) {
          await db
            .collection("users")
            .doc(userIdOrEmail)
            .collection("reacted")
            .doc(String(orderNumber))
            .set(
              {
                reacted: true,
                at: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
        }
      }

      console.log(
        `✅ avg ${avgPct}% computed for ${songName} / ${artistName} / ${orderNumber}`
      );
      return null;
    } catch (err) {
      console.error("🔥 onReaktionWrite error:", err);
      return null;
    }
  });

// --------------------- getMyStudioOrders (single v2 callable) ---------------------
exports.getMyStudioOrders = onCall({ cpu: 1 }, async (data, context) => {
  // use auth email if present; else allow explicit data.email
  const userEmail = context.auth?.token?.email || (data.email || "").trim();
  if (!userEmail) {
    throw new Error("Unauthenticated: no user email.");
  }

  // optional: studio filter => { field: "studio", equals: "A" }
  const studioFilter = data.studioFilter;

  // 1) Get order_numbers this user reacted to
  const reakSnap = await db
    .collection("reaktions")
    .where("user_email", "==", userEmail)
    .select("order_number")
    .get();

  const reacted = new Set(
    reakSnap.docs
      .map((d) => d.get("order_number"))
      .filter((v) => v !== undefined && v !== null)
      .map((v) => String(v))
  );

  // 2) Get studio_uploads (optionally scoped)
  let query = db.collection("studio_uploads");
  if (studioFilter?.field && studioFilter?.equals !== undefined) {
    query = query.where(studioFilter.field, "==", studioFilter.equals);
  }

  const upSnap = await query.get();

  // 3) Exclude reacted + shape result
  const items = upSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((d) => !reacted.has(String(d.order_number)));

  return { items };
});
// === one-time cleanup: strip avg_score_percent from studio_uploads ===
exports.removeAvgFromUploads = onRequest({ region: "us-central1", cors: true }, async (req, res) => {
  try {
    const confirm =
      (req.method === "POST" ? req.body?.confirm : req.query?.confirm) || "";
    if (confirm !== "YES") {
      res.status(400).send(
        `Safety check: add ?confirm=YES to the URL (GET) or send { "confirm": "YES" } in POST body.`
      );
      return;
    }

    const batchSize = 300;
    let total = 0;

    while (true) {
      const snap = await db
        .collection("studio_uploads")
        .where("avg_score_percent", "!=", null)
        .limit(batchSize)
        .get();

      if (snap.empty) break;

      const batch = db.batch();
      snap.docs.forEach((doc) => {
        batch.update(doc.ref, { avg_score_percent: admin.firestore.FieldValue.delete() });
      });
      await batch.commit();
      total += snap.size;

      if (snap.size < batchSize) break;
    }

    res.json({ ok: true, removedCount: total });
  } catch (e) {
    console.error("removeAvgFromUploads error:", e);
    res.status(500).send("Error: " + e.message);
  }
});

// Optional callable version (trigger from client if you want)
exports.removeAvgFromUploadsCallable = onCall({ region: "us-central1" }, async (data, context) => {
  if (data?.confirm !== "YES") {
    throw new functions.https.HttpsError("failed-precondition", "Send { confirm: 'YES' } to run.");
  }

  const batchSize = 300;
  let total = 0;

  while (true) {
    const snap = await db
      .collection("studio_uploads")
      .where("avg_score_percent", "!=", null)
      .limit(batchSize)
      .get();

    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach((doc) => {
      batch.update(doc.ref, { avg_score_percent: admin.firestore.FieldValue.delete() });
    });
    await batch.commit();
    total += snap.size;

    if (snap.size < batchSize) break;
  }

  return { ok: true, removedCount: total };
});

