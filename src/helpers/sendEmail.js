const nodemailer = require("nodemailer");

// ⚠️ TEMP setup (we will secure this next step)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "boisoillbeats@gmail.com",
    pass: "joddxwaegydwpgvr",
  },
});

async function sendEmail(to, subject, html) {
  const mailOptions = {
    from: "Song Reaktor <terryd@songreaktor.com>",
    to,
    subject,
    html,
  };

  await transporter.sendMail(mailOptions);
}

module.exports = {
  sendEmail,
};
