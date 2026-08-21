#!/usr/bin/env node
// Pre-flight check for outbound email.
//
// WHY THIS EXISTS: mailer.sendMail never throws. That is deliberate - a report's
// status must not fail to save because Gmail is down - but it means a broken
// mailbox is INVISIBLE from the outside. sendVerificationCode does not inspect
// the result either, so a resident is told "we emailed you a code" and simply
// never receives one. The only trace is a console.error line in whichever
// terminal the API happens to be running in.
//
// Gmail App Passwords are revoked automatically whenever the Google account's
// own password changes, so this breaks without anyone touching the project. Run
// this before a demo or a survey session:
//
//   npm run check-mail                 verify the credentials and connection
//   npm run check-mail -- you@mail.com  ...and send a real test message there

require('dotenv').config();
const nodemailer = require('nodemailer');
const { isConfigured } = require('../src/utils/mailer');

const target = process.argv[2];

function fail(msg, hint) {
  console.error(`\n  FAIL  ${msg}`);
  if (hint) console.error(`        ${hint}`);
  process.exit(1);
}

(async () => {
  console.log('\nCENROWATCH mail pre-flight\n');

  if (!isConfigured()) {
    fail(
      'EMAIL_USER / EMAIL_PASS are missing or still the placeholder.',
      'Email is in dev mode: nothing sends, sendMail logs and returns { sent: false }.'
    );
  }
  console.log(`  user  ${process.env.EMAIL_USER}`);
  console.log(`  from  ${process.env.EMAIL_FROM || process.env.EMAIL_USER}`);

  const transport = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });

  try {
    await transport.verify();
    console.log('\n  OK    SMTP connection and credentials accepted.');
  } catch (err) {
    // 535 is what a revoked or mistyped App Password looks like. Name it, since
    // the raw Gmail text ("Username and Password not accepted") sends people to
    // re-check the address when the password is the thing that died.
    const revoked = /535|Username and Password not accepted|BadCredentials/i.test(err.message);
    fail(
      `SMTP rejected the credentials: ${err.message}`,
      revoked
        ? 'Almost always a revoked App Password. Google revokes ALL of them when the account password changes. Generate a new one at myaccount.google.com/apppasswords and update EMAIL_PASS.'
        : 'Check network access to smtp.gmail.com:465 - some campus and office networks block outbound SMTP.'
    );
  }

  if (!target) {
    console.log('\n  Pass an address to send a real test message:');
    console.log('    npm run check-mail -- you@example.com\n');
    return;
  }

  try {
    const info = await transport.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: target,
      subject: '[CENROWATCH] Mail pre-flight',
      text: `Outbound email is working.\n\nSent ${new Date().toISOString()} by scripts/check-mail.js.`,
    });
    console.log(`\n  OK    Test message accepted for ${target} (id ${info.messageId}).`);
    console.log('        Confirm it ARRIVED - check spam. Acceptance by Gmail is not delivery.\n');
  } catch (err) {
    fail(`Send failed: ${err.message}`);
  }
})();
