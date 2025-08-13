const functions = require("firebase-functions/v1"); // Use v1 API for Firestore triggers
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

async function updateCityStateFromZip(snap, context) {
  const data = snap.data();
  const zip = data.zip_code;

  if (!zip) return;

  const zipDoc = await db.collection("zip_lookup").doc(zip).get();
  if (!zipDoc.exists) return;

  const { city, state } = zipDoc.data();
  await snap.ref.update({ city, state });
}

// Trigger on document creation
exports.addCityStateFromZip = functions.firestore
  .document("studio_uploads/{docId}")
  .onCreate(updateCityStateFromZip);

// Trigger on document update
exports.updateCityStateFromZip = functions.firestore
  .document("studio_uploads/{docId}")
  .onUpdate(async (change, context) => {
    const beforeZip = change.before.data().zip_code;
    const afterZip = change.after.data().zip_code;

    if (!afterZip || beforeZip === afterZip) return;

    await updateCityStateFromZip(change.after, context);
  });
/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {onRequest} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
