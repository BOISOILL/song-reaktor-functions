const {setGlobalOptions} = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp(); // ✅ REQUIRED

setGlobalOptions({maxInstances: 10});

// Import modular functions
exports.testFunction = require("./src/callable/testFunction").testFunction;
exports.sendVerificationCode = require("./src/callable/sendVerificationCode").sendVerificationCode;
exports.verifyCode = require("./src/callable/verifyCode").verifyCode;
exports.sendPasswordResetCode = require("./src/callable/sendPasswordResetCode").sendPasswordResetCode;
exports.verifyPasswordResetCode = require("./src/callable/verifyPasswordResetCode").verifyPasswordResetCode;
exports.resetPasswordWithCode = require("./src/callable/resetPasswordWithCode").resetPasswordWithCode;