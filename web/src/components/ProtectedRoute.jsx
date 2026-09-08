import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { blockedRouteFallback } from '@/lib/roles';
import FullScreenLoader from './FullScreenLoader';

// Guards a route. `roles` (optional array) restricts access by role; a logged-in
// user without the right role is redirected by blockedRouteFallback (their own
// home, or the staff view of a report link they are allowed to see).
export default function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={blockedRouteFallback(location, user.role)} replace />;

  return children;
}
