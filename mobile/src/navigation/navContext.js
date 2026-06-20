import { createContext, useContext } from 'react';

// Resident navigation context — kept in its own module so the navigator and the
// screen-chrome components (header, form shell) can share it without forming an
// import cycle through ResidentNavigator.
export const NavContext = createContext(null);

export function useResidentNav() {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useResidentNav must be used within a ResidentNavigator');
  return ctx;
}
