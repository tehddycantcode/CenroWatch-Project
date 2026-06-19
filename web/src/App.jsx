import { Routes, Route } from 'react-router-dom';
import LandingPage from '@/pages/public/LandingPage';
import Placeholder from '@/components/Placeholder';
import NotFound from '@/components/NotFound';

// Route map for Sprints 1–4. Each non-landing route renders a labeled placeholder
// until its feature is built. `area` groups them; `sprint` tags the delivery.
const routes = [
  // Public (Sprints 1–2)
  { path: '/map', title: 'Public GIS Incident Map', area: 'Public', sprint: 'Sprint 2' },
  { path: '/feed', title: 'Environmental Reports Feed', area: 'Public', sprint: 'Sprint 2' },
  { path: '/wildlife', title: 'Wildlife & Biodiversity', area: 'Public', sprint: 'Sprint 2' },
  { path: '/login', title: 'Login', area: 'Auth', sprint: 'Sprint 1' },
  { path: '/register', title: 'Resident Registration', area: 'Auth', sprint: 'Sprint 1' },

  // Resident (Sprints 1–2)
  { path: '/resident/dashboard', title: 'Resident Dashboard', area: 'Resident', sprint: 'Sprint 1' },
  { path: '/resident/report-complaint', title: 'Report Environmental Complaint', area: 'Resident', sprint: 'Sprint 2' },
  { path: '/resident/report-wildlife', title: 'Report Wildlife Sighting / Turnover', area: 'Resident', sprint: 'Sprint 2' },
  { path: '/resident/request-service', title: 'Request Environmental Service', area: 'Resident', sprint: 'Sprint 2' },
  { path: '/resident/my-reports', title: 'My Reports', area: 'Resident', sprint: 'Sprint 2' },
  { path: '/resident/track/:trackingId', title: 'Track Report', area: 'Resident', sprint: 'Sprint 2' },

  // CENRO Staff (Sprint 3)
  { path: '/staff/dashboard', title: 'Staff Dashboard', area: 'CENRO Staff', sprint: 'Sprint 3' },
  { path: '/staff/complaints', title: 'Complaints Validation Queue', area: 'CENRO Staff', sprint: 'Sprint 3' },
  { path: '/staff/complaints/:id', title: 'Complaint Detail', area: 'CENRO Staff', sprint: 'Sprint 3' },
  { path: '/staff/wildlife', title: 'Wildlife Management', area: 'CENRO Staff', sprint: 'Sprint 3' },
  { path: '/staff/wildlife/:id', title: 'Wildlife Case Detail', area: 'CENRO Staff', sprint: 'Sprint 3' },
  { path: '/staff/requests', title: 'Environmental Requests Queue', area: 'CENRO Staff', sprint: 'Sprint 3' },
  { path: '/staff/requests/:id', title: 'Request Detail', area: 'CENRO Staff', sprint: 'Sprint 3' },

  // Administrator (Sprint 4)
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
      {routes.map((r) => (
        <Route
          key={r.path}
          path={r.path}
          element={<Placeholder title={r.title} sprint={r.sprint} area={r.area} />}
        />
      ))}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
