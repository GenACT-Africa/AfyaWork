import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NavBar } from './components/layout/NavBar';
import { RequireCO, RequireFacility } from './components/layout/RouteGuard';

import Landing from './pages/Landing';
import { RegisterPage, LoginPage } from './pages/Auth';
import NotFound from './pages/NotFound';

// CO pages
import CODashboard from './pages/co/Dashboard';
import BrowseShifts from './pages/co/BrowseShifts';
import MyApplications from './pages/co/MyApplications';
import COProfile from './pages/co/Profile';

// Facility pages
import FacilityDashboard from './pages/facility/Dashboard';
import PostShift from './pages/facility/PostShift';
import ManageShifts from './pages/facility/ManageShifts';
import ShiftDetail from './pages/facility/ShiftDetail';
import FacilityProfile from './pages/facility/Profile';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="min-h-screen bg-gray-50">
          <NavBar />
          <Routes>
            {/* Public */}
            <Route path="/" element={<Landing />} />
            <Route path="/auth/register" element={<RegisterPage />} />
            <Route path="/auth/login" element={<LoginPage />} />

            {/* CO routes */}
            <Route path="/co/dashboard" element={<RequireCO><CODashboard /></RequireCO>} />
            <Route path="/co/shifts" element={<RequireCO><BrowseShifts /></RequireCO>} />
            <Route path="/co/applications" element={<RequireCO><MyApplications /></RequireCO>} />
            <Route path="/co/profile" element={<RequireCO><COProfile /></RequireCO>} />

            {/* Facility routes */}
            <Route path="/facility/dashboard" element={<RequireFacility><FacilityDashboard /></RequireFacility>} />
            <Route path="/facility/post-shift" element={<RequireFacility><PostShift /></RequireFacility>} />
            <Route path="/facility/shifts" element={<RequireFacility><ManageShifts /></RequireFacility>} />
            <Route path="/facility/shifts/:id" element={<RequireFacility><ShiftDetail /></RequireFacility>} />
            <Route path="/facility/profile" element={<RequireFacility><FacilityProfile /></RequireFacility>} />

            {/* Fallbacks */}
            <Route path="/co" element={<Navigate to="/co/dashboard" replace />} />
            <Route path="/facility" element={<Navigate to="/facility/dashboard" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}
