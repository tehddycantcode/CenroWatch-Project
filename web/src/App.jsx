import { Routes, Route } from 'react-router-dom';
import LandingPage from '@/pages/public/LandingPage';
import LoginPage from '@/pages/auth/LoginPage';
import RegisterPage from '@/pages/auth/RegisterPage';
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage';
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage';
import ProtectedRoute from '@/components/ProtectedRoute';
import ResidentLayout from '@/components/resident/ResidentLayout';
import DashboardPage from '@/pages/resident/DashboardPage';
import ComplaintFormPage from '@/pages/resident/ComplaintFormPage';
import WildlifeFormPage from '@/pages/resident/WildlifeFormPage';
import ServiceRequestFormPage from '@/pages/resident/ServiceRequestFormPage';
import MyReportsPage from '@/pages/resident/MyReportsPage';
import TrackReportPage from '@/pages/resident/TrackReportPage';
import ProfilePage from '@/pages/resident/ProfilePage';
import PublicMapPage from '@/pages/public/PublicMapPage';
import ReportsFeedPage from '@/pages/public/ReportsFeedPage';
import AnonymousReportPage from '@/pages/public/AnonymousReportPage';
import PublicTrackPage from '@/pages/public/PublicTrackPage';
import PrivacyPage from '@/pages/public/PrivacyPage';
import WildlifePage from '@/pages/public/WildlifePage';
import StaffLayout from '@/components/staff/StaffLayout';
import StaffDashboardPage from '@/pages/staff/StaffDashboardPage';
import ComplaintsQueuePage from '@/pages/staff/ComplaintsQueuePage';
import ComplaintDetailPage from '@/pages/staff/ComplaintDetailPage';
import LogWalkInPage from '@/pages/staff/LogWalkInPage';
import WildlifeQueuePage from '@/pages/staff/WildlifeQueuePage';
import WildlifeDetailPage from '@/pages/staff/WildlifeDetailPage';
import RequestsQueuePage from '@/pages/staff/RequestsQueuePage';
import RequestDetailPage from '@/pages/staff/RequestDetailPage';
import AdminLayout from '@/components/admin/AdminLayout';
import AdminDashboardPage from '@/pages/admin/AdminDashboardPage';
import AdminAnalyticsPage from '@/pages/admin/AdminAnalyticsPage';
import AdminUsersPage from '@/pages/admin/AdminUsersPage';
import AdminArchivePage from '@/pages/admin/AdminArchivePage';
import AdminAuditLogsPage from '@/pages/admin/AdminAuditLogsPage';
import AdminSettingsPage from '@/pages/admin/AdminSettingsPage';
import AdminCategoriesPage from '@/pages/admin/AdminCategoriesPage';
import NotFound from '@/components/NotFound';
import ErrorBoundary from '@/components/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
    <Routes>
      <Route path="/" element={<LandingPage />} />

      {/* Auth (Sprint 1) */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Public GIS map + reports feed (Sprint 2) */}
      <Route path="/map" element={<PublicMapPage />} />
      <Route path="/feed" element={<ReportsFeedPage />} />

      {/* Public anonymous/whistleblower reporting + status tracking (no auth) */}
      <Route path="/report-anonymous" element={<AnonymousReportPage />} />
      <Route path="/track" element={<PublicTrackPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />

      {/* Public Wildlife & Biodiversity educational module (no auth) */}
      <Route path="/wildlife" element={<WildlifePage />} />

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
        <Route path="/resident/profile" element={<ProfilePage />} />
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
        <Route path="/staff/log-walkin" element={<LogWalkInPage />} />
        <Route path="/staff/complaints" element={<ComplaintsQueuePage />} />
        <Route path="/staff/complaints/:id" element={<ComplaintDetailPage />} />
        <Route path="/staff/wildlife" element={<WildlifeQueuePage />} />
        <Route path="/staff/wildlife/:id" element={<WildlifeDetailPage />} />
        <Route path="/staff/requests" element={<RequestsQueuePage />} />
        <Route path="/staff/requests/:id" element={<RequestDetailPage />} />
      </Route>

      {/* Admin interface (Sprint 4) — nested under AdminLayout, Admin-only.
          The all-reports views reuse the staff queue pages (which list all
          reports); row clicks open the staff detail/workflow view. */}
      <Route
        element={
          <ProtectedRoute roles={['Admin']}>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
        <Route path="/admin/analytics" element={<AdminAnalyticsPage />} />
        <Route path="/admin/complaints" element={<ComplaintsQueuePage />} />
        <Route path="/admin/complaints/:id" element={<ComplaintDetailPage />} />
        <Route path="/admin/wildlife" element={<WildlifeQueuePage />} />
        <Route path="/admin/wildlife/:id" element={<WildlifeDetailPage />} />
        <Route path="/admin/requests" element={<RequestsQueuePage />} />
        <Route path="/admin/requests/:id" element={<RequestDetailPage />} />
        <Route path="/admin/users" element={<AdminUsersPage />} />
        <Route path="/admin/archive" element={<AdminArchivePage />} />
        <Route path="/admin/audit-logs" element={<AdminAuditLogsPage />} />
        <Route path="/admin/categories" element={<AdminCategoriesPage />} />
        <Route path="/admin/settings" element={<AdminSettingsPage />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
    </ErrorBoundary>
  );
}
