import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NavBar } from './components/layout/NavBar';
import { PushPrompt } from './components/common/PushPrompt';
import { RequireCO, RequireFacility, RequireAdmin, RequireCoordinator } from './components/layout/RouteGuard';

import Landing from './pages/Landing';
import { RegisterPage, LoginPage } from './pages/Auth';
import NotFound from './pages/NotFound';

import CODashboard from './pages/co/Dashboard';
import BrowseShifts from './pages/co/BrowseShifts';
import MyApplications from './pages/co/MyApplications';
import COProfile from './pages/co/Profile';

import FacilityDashboard from './pages/facility/Dashboard';
import PostShift from './pages/facility/PostShift';
import ManageShifts from './pages/facility/ManageShifts';
import ShiftDetail from './pages/facility/ShiftDetail';
import FacilityProfile from './pages/facility/Profile';
import BrowseCOs from './pages/facility/BrowseCOs';

import AdminDashboard from './pages/admin/Dashboard';
import AdminFacilities from './pages/admin/Facilities';
import AdminWorkers from './pages/admin/Workers';
import AdminShifts from './pages/admin/Shifts';
import AdminPayments from './pages/admin/Payments';
import AdminFeedback from './pages/admin/Feedback';
import AdminCoordinators from './pages/admin/Coordinators';
import AdminLeads from './pages/admin/Leads';
import CoordinatorShell from './pages/coordinator/CoordinatorShell';
import Pipeline from './pages/coordinator/Pipeline';
import LeadDetail from './pages/coordinator/LeadDetail';
import Todo from './pages/coordinator/Todo';
import AddLead from './pages/coordinator/AddLead';
import Playbook from './pages/coordinator/Playbook';

import COPayments from './pages/co/Payments';

import InviteSetup from './pages/InviteSetup';
import InvitePending from './pages/InvitePending';
import AuthConfirmed from './pages/AuthConfirmed';
import ICAGate from './components/legal/ICAGate';
import FeedbackPage from './pages/Feedback';

// NavBar only on dashboard pages — landing and auth pages manage their own headers
function AppShell() {
  const { pathname } = useLocation();
  const showNav = pathname !== '/' && !pathname.startsWith('/auth') && !pathname.startsWith('/invite') && pathname !== '/feedback'
    && !pathname.startsWith('/coordinator');

  return (
    <div className="min-h-screen bg-gray-50">
      {showNav && <NavBar />}
      {showNav && <PushPrompt />}
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/auth/register" element={<RegisterPage />} />
        <Route path="/auth/login" element={<LoginPage />} />
        <Route path="/auth/confirmed" element={<AuthConfirmed />} />

        <Route path="/co/dashboard" element={<RequireCO><ICAGate><CODashboard /></ICAGate></RequireCO>} />
        <Route path="/co/shifts" element={<RequireCO><ICAGate><BrowseShifts /></ICAGate></RequireCO>} />
        <Route path="/co/applications" element={<RequireCO><ICAGate><MyApplications /></ICAGate></RequireCO>} />
        <Route path="/co/profile"   element={<RequireCO><ICAGate><COProfile /></ICAGate></RequireCO>} />
        <Route path="/co/payments"  element={<RequireCO><ICAGate><COPayments /></ICAGate></RequireCO>} />

        <Route path="/facility/dashboard" element={<RequireFacility><FacilityDashboard /></RequireFacility>} />
        <Route path="/facility/post-shift" element={<RequireFacility><PostShift /></RequireFacility>} />
        <Route path="/facility/shifts" element={<RequireFacility><ManageShifts /></RequireFacility>} />
        <Route path="/facility/shifts/:id" element={<RequireFacility><ShiftDetail /></RequireFacility>} />
        <Route path="/facility/browse-cos" element={<RequireFacility><BrowseCOs /></RequireFacility>} />
        <Route path="/facility/profile" element={<RequireFacility><FacilityProfile /></RequireFacility>} />

        <Route path="/admin/dashboard"  element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
        <Route path="/admin/facilities" element={<RequireAdmin><AdminFacilities /></RequireAdmin>} />
        <Route path="/admin/workers"    element={<RequireAdmin><AdminWorkers /></RequireAdmin>} />
        <Route path="/admin/shifts"     element={<RequireAdmin><AdminShifts /></RequireAdmin>} />
        <Route path="/admin/payments"   element={<RequireAdmin><AdminPayments /></RequireAdmin>} />
        <Route path="/admin/feedback"   element={<RequireAdmin><AdminFeedback /></RequireAdmin>} />
        <Route path="/admin/coordinators" element={<RequireAdmin><AdminCoordinators /></RequireAdmin>} />
        <Route path="/admin/leads"        element={<RequireAdmin><AdminLeads /></RequireAdmin>} />

        {/* Coordinator area: mobile-first, own header and bottom tabs */}
        <Route path="/coordinator" element={<RequireCoordinator><CoordinatorShell /></RequireCoordinator>}>
          <Route index element={<Pipeline />} />
          <Route path="todo" element={<Todo />} />
          <Route path="playbook" element={<Playbook />} />
          <Route path="new" element={<AddLead />} />
          <Route path="leads/:id" element={<LeadDetail />} />
        </Route>
        <Route path="/admin"            element={<Navigate to="/admin/dashboard" replace />} />

        {/* Invite flow — no auth guard, no NavBar */}
        <Route path="/feedback" element={<FeedbackPage />} />
        <Route path="/invite/setup"   element={<InviteSetup />} />
        <Route path="/invite/pending" element={<InvitePending />} />

        <Route path="/co" element={<Navigate to="/co/dashboard" replace />} />
        <Route path="/facility" element={<Navigate to="/facility/dashboard" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  );
}
