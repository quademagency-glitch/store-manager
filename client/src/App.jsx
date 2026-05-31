import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './lib/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Sales from './pages/Sales';
import Inventory from './pages/Inventory';
import Alerts from './pages/Alerts';
import Reconciliation from './pages/Reconciliation';
import Settings from './pages/Settings';
import PlatformAdmin from './pages/PlatformAdmin';
import ForgotPassword from './pages/ForgotPassword';
import UpdatePassword from './pages/UpdatePassword';
import SmartRedirect from './components/SmartRedirect';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/update-password" element={<UpdatePassword />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/products"
            element={
              <ProtectedRoute>
                <Products />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sales"
            element={
              <ProtectedRoute>
                <Sales />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventory"
            element={
              <ProtectedRoute>
                <Inventory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/alerts"
            element={
              <ProtectedRoute>
                <Alerts />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reconciliation"
            element={
              <ProtectedRoute requiredPermission="view_analytics">
                <Reconciliation />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute requiredPermission="manage_users">
                <Settings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/platform-admin"
            element={
              <ProtectedRoute requiredPermission="manage_platform">
                <PlatformAdmin />
              </ProtectedRoute>
            }
          />
          {/* Smart redirect based on role */}
          <Route path="*" element={<SmartRedirect />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
