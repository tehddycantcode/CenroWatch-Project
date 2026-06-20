import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { roleHome } from '@/lib/roles';
import FullScreenLoader from './FullScreenLoader';

// Guards a route. `roles` (optional array) restricts access by role; a logged-in
// user without the right role is bounced to their own home instead of /login.
export default function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={roleHome(user.role)} replace />;

  return children;
}
