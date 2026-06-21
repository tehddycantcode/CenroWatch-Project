import { Routes, Route } from 'react-router-dom';
import LandingPage from '@/pages/public/LandingPage';
import LoginPage from '@/pages/auth/LoginPage';
import RegisterPage from '@/pages/auth/RegisterPage';
import ProtectedRoute from '@/components/ProtectedRoute';
import ResidentLayout from '@/components/resident/ResidentLayout';
import DashboardPage from '@/pages/resident/DashboardPage';
import ComplaintFormPage from '@/pages/resident/ComplaintFormPage';
import WildlifeFormPage from '@/pages/resident/WildlifeFormPage';
import ServiceRequestFormPage from '@/pages/resident/ServiceRequestFormPage';
import MyReportsPage from '@/pages/resident/MyReportsPage';
import TrackReportPage from '@/pages/resident/TrackReportPage';
import PublicMapPage from '@/pages/public/PublicMapPage';
import ReportsFeedPage from '@/pages/public/ReportsFeedPage';
import StaffLayout from '@/components/staff/StaffLayout';
import StaffDashboardPage from '@/pages/staff/StaffDashboardPage';
import ComplaintsQueuePage from '@/pages/staff/ComplaintsQueuePage';
import ComplaintDetailPage from '@/pages/staff/ComplaintDetailPage';
import WildlifeQueuePage from '@/pages/staff/WildlifeQueuePage';
import WildlifeDetailPage from '@/pages/staff/WildlifeDetailPage';
import RequestsQueuePage from '@/pages/staff/RequestsQueuePage';
import RequestDetailPage from '@/pages/staff/RequestDetailPage';
import Placeholder from '@/components/Placeholder';
import NotFound from '@/components/NotFound';

const AREA_ROLES = {
  Admin: ['Admin'],
};

// Public placeholder routes (no auth) — still placeholders until their sprint.
const publicRoutes = [
  { path: '/wildlife', title: 'Wildlife & Biodiversity', area: 'Public', sprint: 'Sprint 2' },
];

// Admin remains a role-gated placeholder until Sprint 4. (The CENRO Staff
// interface is implemented below under StaffLayout.)
const protectedRoutes = [
  { path: '/admin/dashboard', title: 'Admin Analytics Dashboard', area: 'Admin', sprint: 'Sprint 4' },
  { path: '/admin/analytics', title: 'Analytics & GIS Dashboard', area: 'Admin', sprint: 'Sprint 4' },
  { path: '/admin/users', title: 'User Account Management', area: 'Admin', sprint: 'Sprint 4' },
  { path: '/admin/complaints', title: 'All Complaints', area: 'Admin', sprint: 'Sprint 4' },
  { path: '/admin/wildlife', title: 'All Wildlife Cases', area: 'Admin', sprint: 'Sprint 4' },
  { path: '/admin/requests', title: 'All Environmental Requests', area: 'Admin', sprint: 'Sprint 4' },
  { path: '/admin/audit-logs', title: 'Audit Log Viewer', area: 'Admin', sprint: 'Sprint 4' },
  { path: '/admin/settings', title: 'System Settings', area: 'Admin', sprint: 'Sprint 4' },
];

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />

      {/* Auth (Sprint 1) */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Public GIS map + reports feed (Sprint 2) */}
      <Route path="/map" element={<PublicMapPage />} />
      <Route path="/feed" element={<ReportsFeedPage />} />

      {/* Resident interface (Sprint 2) — nested under the shared layout, role-gated */}
      <Route
        element={
          <ProtectedRoute roles={['Resident']}>
            <ResidentLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/resident/dashboard" element={<DashboardPage />} />
        <Route path="/resident/report-complaint" element={<ComplaintFormPage />} />
        <Route path="/resident/report-wildlife" element={<WildlifeFormPage />} />
        <Route path="/resident/request-service" element={<ServiceRequestFormPage />} />
        <Route path="/resident/my-reports" element={<MyReportsPage />} />
        <Route path="/resident/track/:trackingId" element={<TrackReportPage />} />
      </Route>

      {/* CENRO Staff interface (Sprint 3) — nested under StaffLayout, role-gated.
          Admin is allowed too, mirroring the backend authorize('CENRO_Staff','Admin'). */}
      <Route
        element={
          <ProtectedRoute roles={['CENRO_Staff', 'Admin']}>
            <StaffLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/staff/dashboard" element={<StaffDashboardPage />} />
        <Route path="/staff/complaints" element={<ComplaintsQueuePage />} />
        <Route path="/staff/complaints/:id" element={<ComplaintDetailPage />} />
        <Route path="/staff/wildlife" element={<WildlifeQueuePage />} />
        <Route path="/staff/wildlife/:id" element={<WildlifeDetailPage />} />
        <Route path="/staff/requests" element={<RequestsQueuePage />} />
        <Route path="/staff/requests/:id" element={<RequestDetailPage />} />
      </Route>

      {/* Public placeholders */}
      {publicRoutes.map((r) => (
        <Route key={r.path} path={r.path} element={<Placeholder title={r.title} sprint={r.sprint} area={r.area} />} />
      ))}

      {/* Staff + Admin placeholders (role-gated) */}
      {protectedRoutes.map((r) => (
        <Route
          key={r.path}
          path={r.path}
          element={
            <ProtectedRoute roles={AREA_ROLES[r.area]}>
              <Placeholder title={r.title} sprint={r.sprint} area={r.area} />
            </ProtectedRoute>
          }
        />
      ))}

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
