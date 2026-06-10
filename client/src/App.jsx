import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

import Sales from './pages/Sales';
import Inventory from './pages/Inventory';
import Alerts from './pages/Alerts';
import Reconciliation from './pages/Reconciliation';
import Settings from "./pages/Settings";
import Customers from "./pages/Customers";
import Returns from "./pages/Returns";
import SalesRecord from "./pages/SalesRecord";
import PlatformAdmin from "./pages/PlatformAdmin";
import ForgotPassword from "./pages/ForgotPassword";
import UpdatePassword from './pages/UpdatePassword';
import InvoiceList from './pages/InvoiceList';
import InvoiceView from './pages/InvoiceView';
import SmartRedirect from './components/SmartRedirect';
import UserProfile from './pages/UserProfile';

import MainLayout from './components/MainLayout';

// Business Admin Pages
import BusinessOverview from './pages/BusinessAdmin/Overview';
import BusinessOrganization from './pages/BusinessAdmin/Organization';
import BusinessLocations from './pages/BusinessAdmin/Locations';
import BusinessTeam from './pages/BusinessAdmin/TeamManagement';
import BusinessRoles from './pages/BusinessAdmin/RolesManagement';
import Billing from './pages/BusinessAdmin/Billing';
import ShrinkageReport from './pages/BusinessAdmin/ShrinkageReport';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/update-password" element={<UpdatePassword />} />
          <Route path="/platform-admin" element={
            <ProtectedRoute requiredPermission="manage_platform"><PlatformAdmin /></ProtectedRoute>
          } />
          {/* ── UNIFIED LOGGED-IN ROUTES ── */}
          <Route
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/products" element={<Navigate to="/inventory" replace />} />
            <Route path="/sales" element={
              <ProtectedRoute requiredPermission="create_sales"><Sales /></ProtectedRoute>
            } />
            <Route path="/returns" element={
              <ProtectedRoute><Returns /></ProtectedRoute>
            } />
            <Route path="/sales-record" element={
              <ProtectedRoute><SalesRecord /></ProtectedRoute>
            } />
            <Route path="/customers" element={
              <ProtectedRoute><Customers /></ProtectedRoute>
            } />
            <Route path="/inventory" element={
              <ProtectedRoute><Inventory /></ProtectedRoute>
            } />
            <Route path="/alerts" element={
              <ProtectedRoute requiredPermission="view_analytics"><Alerts /></ProtectedRoute>
            } />
            
            {/* Protected sub-routes handled within components or layout level */}
            <Route path="/reconciliation" element={
              <ProtectedRoute requiredPermission="view_analytics"><Reconciliation /></ProtectedRoute>
            } />
            <Route path="/invoice" element={<ProtectedRoute><InvoiceList /></ProtectedRoute>} />
            <Route path="/invoice/:id" element={
              <ProtectedRoute><InvoiceView /></ProtectedRoute>
            } />
            <Route path="/settings" element={
              <ProtectedRoute requiredPermission="manage_users"><Settings /></ProtectedRoute>
            } />
            <Route path="/profile" element={
              <ProtectedRoute><UserProfile /></ProtectedRoute>
            } />

            {/* Business Admin Portal Routes */}
            <Route path="/business-admin" element={
              <ProtectedRoute requiredPermission="manage_business"><BusinessOverview /></ProtectedRoute>
            } />
            <Route path="/business-admin/organization" element={
              <ProtectedRoute requiredPermission="manage_business"><BusinessOrganization /></ProtectedRoute>
            } />
            <Route path="/business-admin/locations" element={
              <ProtectedRoute requiredPermission="manage_business"><BusinessLocations /></ProtectedRoute>
            } />
            <Route path="/business-admin/team" element={
              <ProtectedRoute requiredPermission="manage_business"><BusinessTeam /></ProtectedRoute>
            } />
            <Route path="/business-admin/roles" element={
              <ProtectedRoute requiredPermission="manage_users"><BusinessRoles /></ProtectedRoute>
            } />
            <Route path="/business-admin/billing" element={
              <ProtectedRoute requiredPermission="manage_business"><Billing /></ProtectedRoute>
            } />
            <Route path="/business-admin/shrinkage" element={
              <ProtectedRoute requiredPermission="manage_business"><ShrinkageReport /></ProtectedRoute>
            } />
          </Route>

          {/* Smart redirect based on role */}
          <Route path="*" element={<SmartRedirect />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
