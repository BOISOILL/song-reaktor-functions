const {onCall} = require("firebase-functions/v2/https");

exports.testFunction = onCall(async () => {
  return {
    success: true,
    message: "Song Reaktor modular backend working 🚀",
  };
});
