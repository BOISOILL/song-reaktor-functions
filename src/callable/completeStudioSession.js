const {onCall, HttpsError} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const {FieldValue, Timestamp} = require("firebase-admin/firestore");

const db = admin.firestore();

exports.completeStudioSession = onCall(
    {
      region: "us-central1",
      timeoutSeconds: 60,
      memory: "256MiB",
    },
    async (request) => {
      const data = request.data || {};
      const auth = request.auth || null;

      const userId = typeof data.userId === "string" ? data.userId.trim() : "";
      const sessionId = typeof data.sessionId === "string" ? data.sessionId.trim() : "";

      if (!userId) {
        throw new HttpsError("invalid-argument", "Missing userId.");
      }

      if (!sessionId) {
        throw new HttpsError("invalid-argument", "Missing sessionId.");
      }

      if (auth && auth.uid && auth.uid !== userId) {
        throw new HttpsError("permission-denied", "Authenticated user does not match userId.");
      }

      const userRef = db.collection("users").doc(userId);
      const sessionRef = db.collection("studio_sessions").doc(sessionId);
      const rewardRef = db.collection("reward_events").doc();

      const now = Timestamp.now();

      const result = await db.runTransaction(async (tx) => {
        const [userSnap, sessionSnap] = await Promise.all([
          tx.get(userRef),
          tx.get(sessionRef),
        ]);

        if (!sessionSnap.exists) {
          throw new HttpsError("not-found", "Studio session not found.");
        }

        const session = sessionSnap.data();

        if (!session || session.user_id !== userId) {
          throw new HttpsError("permission-denied", "This studio session does not belong to this user.");
        }

        if (session.status === "completed") {
          return {
            ok: true,
            alreadyCompleted: true,
            firstStudioUnlocked: false,
            status: userSnap.exists ? (userSnap.data().status || null) : null,
            discoveryCharge: userSnap.exists ? (userSnap.data().discovery_charge || 0) : 0,
            explorerCharge: userSnap.exists ? (userSnap.data().explorer_charge || 0) : 0,
          };
        }

        const songsCompleted = Number(session.songs_completed || 0);
        const songsTotal = Number(session.songs_total || 0);

        if (!songsTotal || songsCompleted < songsTotal) {
          throw new HttpsError(
              "failed-precondition",
              `Studio is not complete yet. Completed ${songsCompleted} of ${songsTotal}.`,
          );
        }

        const user = userSnap.exists ? userSnap.data() : {};
        const hasCompletedFirstFullStudio = Boolean(user.has_completed_first_full_studio);

        const discoveryChargeMax = Number(user.discovery_charge_max || 100);
        const explorerChargeMax = Number(user.explorer_charge_max || 100);

        let firstStudioUnlocked = false;

        tx.update(sessionRef, {
          status: "completed",
          completed_at: now,
          updated_at: now,
        });

        const baseUserUpdates = {
          last_active_at: now,
          updated_at: now,
          studio_completion_count: FieldValue.increment(1),
        };

        if (!hasCompletedFirstFullStudio) {
          firstStudioUnlocked = true;

          Object.assign(baseUserUpdates, {
            has_completed_first_full_studio: true,
            status: "Fresh Ear",
            explorer_access_unlocked: true,
            discovery_charge: discoveryChargeMax,
            explorer_charge: Math.min(50, explorerChargeMax),
            fresh_ear_unlocked_at: now,
          });

          tx.set(
              rewardRef,
              {
                user_id: userId,
                type: "unlock",
                title: "Fresh Ear unlocked",
                body: "You completed your first full studio and officially joined Reaktor Nation.",
                is_read: false,
                created_at: now,
                metadata: {
                  unlock_key: "fresh_ear",
                  session_id: sessionId,
                },
              },
              {merge: true},
          );
        }

        if (userSnap.exists) {
          tx.update(userRef, baseUserUpdates);
        } else {
          tx.set(
              userRef,
              {
                status: firstStudioUnlocked ? "Fresh Ear" : "listener",
                has_completed_first_full_studio: firstStudioUnlocked,
                explorer_access_unlocked: firstStudioUnlocked,
                discovery_charge: firstStudioUnlocked ? discoveryChargeMax : 0,
                explorer_charge: firstStudioUnlocked ? Math.min(50, explorerChargeMax) : 0,
                discovery_charge_max: discoveryChargeMax,
                explorer_charge_max: explorerChargeMax,
                studio_completion_count: 1,
                last_active_at: now,
                updated_at: now,
                created_at: now,
                fresh_ear_unlocked_at: firstStudioUnlocked ? now : null,
              },
              {merge: true},
          );
        }

        return {
          ok: true,
          alreadyCompleted: false,
          firstStudioUnlocked,
          status: firstStudioUnlocked ? "Fresh Ear" : (user.status || "listener"),
          discoveryCharge: firstStudioUnlocked ?
          discoveryChargeMax :
          Number(user.discovery_charge || 0),
          explorerCharge: firstStudioUnlocked ?
          Math.min(50, explorerChargeMax) :
          Number(user.explorer_charge || 0),
        };
      });

      return result;
    },
);
