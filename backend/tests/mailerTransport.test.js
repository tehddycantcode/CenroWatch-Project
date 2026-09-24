// How mail actually leaves this system.
//
// There are two transports and the choice between them is the point of this
// file. The deployed host BLOCKS OUTBOUND SMTP - measured from inside the
// container on 2026-09-24, ports 25/465/587 to smtp.gmail.com all time out
// after 6s while api.github.com:443 connects in 44ms - so anything that talks
// SMTP from there sends nothing at all, silently.
//
// This file used to assert `options.family === 4`, added after:
//   [mailer] failed to email ...: connect ENETUNREACH 2607:f8b0:4023:c0b::6d:465
// on the theory that an AAAA record was the cause. That test passed for weeks
// while mail was completely broken, because it only proved the option had been
// PASSED - nodemailer 9 has no `family` option (not one reference in its lib/),
// so it was never read. Asserting that a setting was supplied is not the same
// as asserting it does something.

jest.mock('nodemailer', () => ({ createTransport: jest.fn(() => ({ sendMail: jest.fn() })) }));

const KEYS = ['BREVO_API_KEY', 'EMAIL_USER', 'EMAIL_PASS', 'EMAIL_FROM'];
const saved = {};

// mailer.js caches its SMTP transport in a module-level variable, so a second
// send in the same module instance never calls createTransport again and the
// mock reads empty. Each test therefore gets a fresh module registry - and
// nodemailer must be required AFTER the reset, or the test would hold a
// different mock object from the one the code under test received.
function load() {
  jest.resetModules();
  return { nodemailer: require('nodemailer'), mailer: require('../src/utils/mailer') };
}

beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k];
  for (const k of KEYS) delete process.env[k];
  jest.clearAllMocks();
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('choosing a transport', () => {
  test('an API key routes mail over HTTPS, not SMTP', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-test';
    process.env.EMAIL_FROM = 'CENROWATCH <cenro@example.com>';
    global.fetch = jest.fn(async () => ({ ok: true, status: 201, json: async () => ({ messageId: 'abc' }) }));

    const out = await load().mailer.sendMail({ to: 'juan@example.com', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' });

    expect(out).toEqual({ sent: true });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.headers['api-key']).toBe('xkeysib-test');
    expect(JSON.parse(init.body)).toEqual({
      sender: { name: 'CENROWATCH', email: 'cenro@example.com' },
      to: [{ email: 'juan@example.com' }],
      subject: 'Hi',
      htmlContent: '<p>Hi</p>',
      textContent: 'Hi',
    });
  });

  // SMTP still has to work on a laptop, where Gmail is reachable. Both setups
  // in CLAUDE.md depend on it and neither sets BREVO_API_KEY.
  test('without an API key it falls back to SMTP', async () => {
    process.env.EMAIL_USER = 'cenro@example.com';
    process.env.EMAIL_PASS = 'abcdefghijklmnop';
    global.fetch = jest.fn();
    const { mailer, nodemailer } = load();

    await mailer.sendMail({ to: 'someone@example.com', subject: 'x', text: 'y' });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
    const options = nodemailer.createTransport.mock.calls[0][0];
    expect(options.service).toBe('gmail');
    expect(options.auth).toEqual({ user: 'cenro@example.com', pass: 'abcdefghijklmnop' });
  });

  // The old defaults held a request for two minutes against a dead mail server.
  test('the SMTP transport gives up quickly rather than holding the request', async () => {
    process.env.EMAIL_USER = 'cenro@example.com';
    process.env.EMAIL_PASS = 'abcdefghijklmnop';
    const { mailer, nodemailer } = load();

    await mailer.sendMail({ to: 'someone@example.com', subject: 'x', text: 'y' });
    const options = nodemailer.createTransport.mock.calls[0][0];

    expect(options.connectionTimeout).toBeLessThanOrEqual(15000);
    expect(options.greetingTimeout).toBeLessThanOrEqual(15000);
    expect(options.socketTimeout).toBeLessThanOrEqual(30000);
  });

  test('with neither configured it reports not sent instead of throwing', async () => {
    const out = await load().mailer.sendMail({ to: 'someone@example.com', subject: 'x', text: 'y' });
    expect(out).toEqual({ sent: false });
  });
});

describe('a refusal must not break the caller', () => {
  // The whole system depends on this: a status update, a registration and a
  // verification code all continue when mail fails.
  test('an API error resolves { sent: false } rather than rejecting', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-test';
    process.env.EMAIL_FROM = 'cenro@example.com';
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ code: 'invalid_parameter', message: 'sender is not valid' }),
    }));

    await expect(load().mailer.sendMail({ to: 'juan@example.com', subject: 'x', text: 'y' }))
      .resolves.toEqual({ sent: false });
  });

  test('a network failure resolves { sent: false } rather than rejecting', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-test';
    process.env.EMAIL_FROM = 'cenro@example.com';
    global.fetch = jest.fn(async () => { throw new Error('ETIMEDOUT'); });

    await expect(load().mailer.sendMail({ to: 'juan@example.com', subject: 'x', text: 'y' }))
      .resolves.toEqual({ sent: false });
  });
});

describe('the sender address', () => {
  // Brevo wants name and address as separate fields, and the address has to be
  // a verified sender in the account or it answers 400.
  test('"Name <addr>" is split into the two fields Brevo expects', async () => {
    process.env.BREVO_API_KEY = 'k';
    process.env.EMAIL_FROM = 'CENRO Cabuyao <cenro@example.com>';
    global.fetch = jest.fn(async () => ({ ok: true, status: 201, json: async () => ({}) }));

    await load().mailer.sendMail({ to: 'a@b.c', subject: 'x', text: 'y' });

    expect(JSON.parse(global.fetch.mock.calls[0][1].body).sender)
      .toEqual({ name: 'CENRO Cabuyao', email: 'cenro@example.com' });
  });

  test('a bare address still yields a usable sender', async () => {
    process.env.BREVO_API_KEY = 'k';
    process.env.EMAIL_FROM = 'cenro@example.com';
    global.fetch = jest.fn(async () => ({ ok: true, status: 201, json: async () => ({}) }));

    await load().mailer.sendMail({ to: 'a@b.c', subject: 'x', text: 'y' });

    expect(JSON.parse(global.fetch.mock.calls[0][1].body).sender)
      .toEqual({ name: 'CENROWATCH', email: 'cenro@example.com' });
  });
});
