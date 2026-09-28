// Registration does NOT create a session.
//
// WHY THIS SUITE EXISTS. Registering used to sign the person straight in on both
// transports at once: setSessionCookie for the web app, and `token` in the body
// for the phone. "Redirect to login after registering" is therefore not a client
// change - navigating while a valid session cookie is still set just bounces
// them back, because both LoginPage and RegisterPage send an authenticated
// visitor to their role's home.
//
// THE COOKIE IS GONE AND `token` IS DELIBERATELY STILL THERE. That asymmetry is
// the whole point of this file, and it will look like an unfinished job to
// whoever reads it next:
//
//   The web app authenticates by cookie only. It cannot read the HttpOnly
//   cookie and no longer stores a token, so dropping setSessionCookie is
//   sufficient - the browser genuinely has no session, whatever the body says.
//
//   The INSTALLED mobile app reads res.data.token and hands it to persist(),
//   which does `await SecureStore.setItemAsync(TOKEN_KEY, tk)` unconditionally.
//   SecureStore throws on a non-string value. So removing `token` from this
//   response would make every already-installed APK throw AFTER the account had
//   been created - register() rejects, the screen shows a keychain error, and
//   the obvious retry hits 409 "An account with this email already exists."
//   The user is stuck with an account they cannot tell they have.
//
// Leaving `token` in the body costs nothing: it is the same JWT that used to be
// in the cookie, no client reads it any more, and the OTA-updated app ignores
// it. It can be removed once every installed build has been updated - and only
// then.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-register-no-session';

jest.mock('../src/services/auth.service', () => ({
  register: jest.fn(),
}));
jest.mock('../src/utils/sessionCookie', () => ({
  setSessionCookie: jest.fn(),
  clearSessionCookie: jest.fn(),
  SESSION_COOKIE_NAME: 'cenrowatch_token',
}));

const authService = require('../src/services/auth.service');
const { setSessionCookie } = require('../src/utils/sessionCookie');
const authController = require('../src/controllers/auth.controller');

const USER = { user_id: 9, email: 'new@example.com', first_name: 'New', role: 'Resident' };

function makeRes() {
  return {
    statusCode: null,
    payload: null,
    cookie: jest.fn(),
    status(code) { this.statusCode = code; return this; },
    json(body) { this.payload = body; return this; },
  };
}

const reqFor = () => ({
  body: { email: USER.email, password: 'Passw0rd1', first_name: 'New', last_name: 'User' },
  ip: '203.0.113.9',
});

beforeEach(() => {
  jest.clearAllMocks();
  authService.register.mockResolvedValue({ user: USER, token: 'signed.jwt.value' });
});

describe('POST /auth/register', () => {
  test('does NOT set a session cookie', async () => {
    // The single assertion this whole change rests on. With a cookie set, the
    // web client is signed in no matter where it navigates.
    const res = makeRes();

    await authController.register(reqFor(), res, jest.fn());

    expect(setSessionCookie).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
  });

  test('still reports success and returns the new user', async () => {
    const res = makeRes();

    await authController.register(reqFor(), res, jest.fn());

    expect(res.statusCode).toBe(201);
    expect(res.payload.success).toBe(true);
    expect(res.payload.data.user).toEqual(USER);
  });

  test('STILL returns `token` in the body, on purpose', async () => {
    // Do NOT "finish the job" by deleting this. See the header: an installed
    // APK feeds this value to SecureStore.setItemAsync, which throws on
    // undefined - after the account has already been created, so the retry
    // collides with a 409. This assertion exists to make that deletion fail
    // here rather than on someone's phone.
    const res = makeRes();

    await authController.register(reqFor(), res, jest.fn());

    expect(typeof res.payload.data.token).toBe('string');
    expect(res.payload.data.token.length).toBeGreaterThan(0);
  });

  test('login, by contrast, DOES set the session cookie', async () => {
    // Guards against the change being applied one function too far down.
    const loginService = require('../src/services/auth.service');
    loginService.login = jest.fn().mockResolvedValue({ user: USER, token: 'signed.jwt.value' });
    const res = makeRes();

    await authController.login({ body: { email: USER.email, password: 'x' }, ip: '203.0.113.9' }, res, jest.fn());

    expect(setSessionCookie).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
  });
});
