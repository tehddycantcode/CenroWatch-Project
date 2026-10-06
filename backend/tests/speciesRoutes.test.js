// The public species list — mounted at /api/v1/species, unauthenticated.
//
// It backs two things: the species picker on the resident wildlife form, and
// the public species guide, which a visitor reads without ever signing in.
// That second reader is why this file exists on its own rather than living
// inside a handler test: the thing worth guarding against is someone adding
// `router.use(authenticate)` to this router later, which would 401 the
// signed-out guide. The second test below asserts that absence structurally -
// by inspecting the router's own layer shape, not by searching the route
// file's source for the word "authenticate", which would fail on an innocent
// comment that merely mentions it.

describe('public species route', () => {
  test('the species router exposes GET /', () => {
    const router = require('../src/routes/species.routes');
    const routes = router.stack
      .filter((l) => l.route)
      .map((l) => `${Object.keys(l.route.methods)[0].toUpperCase()} ${l.route.path}`);
    expect(routes).toContain('GET /');
  });

  test('IT IS MOUNTED, AND THE ROUTER CARRIES NO MIDDLEWARE LAYER OF ITS OWN', () => {
    const fs = require('fs');
    const index = fs.readFileSync(require.resolve('../src/routes/index'), 'utf8');
    expect(index).toMatch(/router\.use\('\/species'/);

    // A layer added by router.use(...) (authenticate or anything else) has no
    // `.route` - only a bare `.handle`. Only router.get/post/etc layers carry
    // `.route`. So "every layer has a route" is true exactly when the only
    // thing registered on this router is the one GET / handler, and becomes
    // false the moment a guard is added - which is the regression this file
    // exists to catch, now asserted on the router's actual shape instead of
    // grepping its source text for a name.
    const router = require('../src/routes/species.routes');
    expect(router.stack.every((layer) => layer.route)).toBe(true);
  });
});

// The admin surface (GET/POST/PATCH /api/v1/admin/species), unlike the router
// above, is nothing special to look at from the outside - it inherits the
// router-level `authenticate, authorize('Admin')` already covering every other
// /admin route, with no guard of its own to get wrong. What IS easy to get
// wrong silently is the per-route handler chain: a typo'd path still 404s
// loudly, but a POST/PATCH route that quietly lost its validator chain (a
// copy-paste that dropped `sv.createSpeciesRules, validate,` and left only the
// controller) would still match on path and method and look mounted correctly
// here, while every 422 this endpoint is supposed to produce stops happening -
// bad input reaches the controller, and only the service's own re-validation
// (a worse-shaped error than the validator gives) stands between it and the
// database. Nothing else in this suite would notice that.
describe('admin species routes', () => {
  const sv = require('../src/validators/species.validators');

  function speciesLayers() {
    const router = require('../src/routes/admin.routes');
    return router.stack.filter((l) => l.route && l.route.path.startsWith('/species'));
  }

  test('exposes GET /species, POST /species and PATCH /species/:id', () => {
    const routes = speciesLayers().map(
      (l) => `${Object.keys(l.route.methods)[0].toUpperCase()} ${l.route.path}`
    );
    expect(routes).toEqual(expect.arrayContaining([
      'GET /species', 'POST /species', 'PATCH /species/:id',
    ]));
  });

  // Express flattens an array of middleware passed to router.post/patch into
  // one Layer per function, so a route's own `route.stack.length` is exactly
  // (its validator rule count) + validate + the controller. Comparing against
  // the validators module's OWN export length (rather than a hardcoded number)
  // means this keeps passing as fields are added to the rules, and still fails
  // the moment a single layer - `validate`, one rule, or the whole chain - goes
  // missing, which a path/method check alone cannot see.
  test('POST and PATCH keep their full validator chain', () => {
    const post = speciesLayers().find((l) => l.route.methods.post);
    const patch = speciesLayers().find((l) => l.route.methods.patch);
    expect(post.route.stack.length).toBe(sv.createSpeciesRules.length + 2);
    expect(patch.route.stack.length).toBe(sv.updateSpeciesRules.length + 2);
  });
});
