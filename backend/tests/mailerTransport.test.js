// How the Gmail transport is configured.
//
// Both settings here come from the same production incident (2026-09-23), and
// neither is cosmetic:
//
//   [mailer] failed to email ...: connect ENETUNREACH 2607:f8b0:4023:c0b::6d:465
//   POST /api/v1/auth/register 201 120329.722 ms
//
// DNS returned an AAAA record for smtp.gmail.com, the container had no outbound
// IPv6 route, and the connection was unreachable. Nodemailer's default timeouts
// then held the socket for TWO MINUTES before giving up - which a resident
// experiences as a registration button that spins for two minutes and then
// works. The account was always created (the send is deliberately swallowed);
// the wait was the whole defect.

jest.mock('nodemailer', () => ({ createTransport: jest.fn(() => ({ sendMail: jest.fn() })) }));

const nodemailer = require('nodemailer');

describe('the Gmail transport', () => {
  let options;

  // No jest.resetModules() here: it clears the module registry, so mailer would
  // receive a DIFFERENT nodemailer mock from the one this file holds a
  // reference to, and mock.calls would read empty no matter what the code did.
  beforeAll(async () => {
    process.env.EMAIL_USER = 'cenro@example.com';
    process.env.EMAIL_PASS = 'abcdefghijklmnop';
    const mailer = require('../src/utils/mailer');
    await mailer.sendMail({ to: 'someone@example.com', subject: 'x', text: 'y' });
    options = nodemailer.createTransport.mock.calls[0][0];
  });

  // The actual fix. Without it the resolver is free to hand back an IPv6
  // address the host cannot route to.
  test('connects over IPv4 only', () => {
    expect(options.family).toBe(4);
  });

  // Nodemailer's defaults are 2 minutes to connect and 10 minutes on the
  // socket. A mail outage should cost a request a few seconds, not minutes.
  test('gives up quickly rather than holding the request', () => {
    expect(options.connectionTimeout).toBeLessThanOrEqual(15000);
    expect(options.greetingTimeout).toBeLessThanOrEqual(15000);
    expect(options.socketTimeout).toBeLessThanOrEqual(30000);
  });

  test('still uses the configured Gmail credentials', () => {
    expect(options.service).toBe('gmail');
    expect(options.auth).toEqual({ user: 'cenro@example.com', pass: 'abcdefghijklmnop' });
  });
});
