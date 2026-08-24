// Where each role lands after authentication.
export function roleHome(role) {
  switch (role) {
    case 'Admin':
      return '/admin/dashboard';
    case 'CENRO_Staff':
      return '/staff/dashboard';
    case 'Resident':
    default:
      return '/resident/dashboard';
  }
}

export const ROLE_LABELS = {
  Admin: 'Administrator',
  CENRO_Staff: 'CENRO Staff',
  Resident: 'Resident',
};

// Emailed report links point at the resident tracking page, which is gated to
// Residents. Staff and Admins are authorised to view any report, so bouncing
// them to their own dashboard silently drops the reference they clicked.
// Send them to the staff view of the SAME report instead: the staff detail
// endpoints accept the tracking id itself (see `whereFor` in the staff
// services), so it passes straight through the :id param.
const STAFF_REPORT_SECTION = { CMP: 'complaints', WLD: 'wildlife', REQ: 'requests' };

/**
 * Where to send a signed-in user who hit a route their role can't open.
 * Falls back to their own home when there's no better destination.
 */
export function blockedRouteFallback(location, role) {
  if (role === 'CENRO_Staff' || role === 'Admin') {
    const m = /^\/resident\/track\/((CMP|WLD|REQ)-\d{4}-\d+)\/?$/.exec(location?.pathname || '');
    const section = m && STAFF_REPORT_SECTION[m[2]];
    if (section) return `/staff/${section}/${m[1]}`;
  }
  return roleHome(role);
}
