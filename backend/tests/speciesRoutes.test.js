// The public species list — mounted at /api/v1/species, unauthenticated.
//
// It backs two things: the species picker on the resident wildlife form, and
// the public species guide, which a visitor reads without ever signing in.
// That second reader is why this file exists on its own rather than living
// inside a handler test: the thing worth guarding against is someone adding
// `router.use(authenticate)` to this router later, which would 401 the
// signed-out guide. The second test below asserts that absence directly,
// not just the presence of the mount.

describe('public species route', () => {
  test('the species router exposes GET /', () => {
    const router = require('../src/routes/species.routes');
    const routes = router.stack
      .filter((l) => l.route)
      .map((l) => `${Object.keys(l.route.methods)[0].toUpperCase()} ${l.route.path}`);
    expect(routes).toContain('GET /');
  });

  test('IT IS MOUNTED, AND CARRIES NO authenticate MIDDLEWARE', () => {
    // The wildlife form reads it and so does the public species guide, which is
    // reachable without an account. A router.use(authenticate) added here later
    // would break the signed-out guide with a 401 - so the absence is asserted,
    // not just the presence of the mount.
    const fs = require('fs');
    const index = fs.readFileSync(require.resolve('../src/routes/index'), 'utf8');
    expect(index).toMatch(/router\.use\('\/species'/);
    const routeFile = fs.readFileSync(require.resolve('../src/routes/species.routes'), 'utf8');
    expect(routeFile).not.toMatch(/authenticate/);
  });
});
