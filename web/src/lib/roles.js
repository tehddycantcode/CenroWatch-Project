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
