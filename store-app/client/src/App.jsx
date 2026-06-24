import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/AuthContext';
import { ThemeProvider } from './lib/ThemeContext';
import { ToastProvider } from './hooks/useToast';
import { ConfirmProvider } from './hooks/useConfirm';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

import Sales from './pages/Sales';
import Inventory from './pages/Inventory';
import Alerts from './pages/Alerts';
import Reconciliation from './pages/Reconciliation';
import Settings from "./pages/Settings";
import Customers from "./pages/Customers";
import CustomerDetail from "./pages/CustomerDetail";
import Returns from "./pages/Returns";
import SalesRecord from "./pages/SalesRecord";
import TillAccount from "./pages/TillAccount";
import PlatformAdmin from "./pages/PlatformAdmin";
import ForgotPassword from "./pages/ForgotPassword";
import UpdatePassword from './pages/UpdatePassword';
import InvoiceList from './pages/InvoiceList';
import InvoiceView from './pages/InvoiceView';
import SmartRedirect from './components/SmartRedirect';
import UserProfile from './pages/UserProfile';
import Suppliers from './pages/Suppliers';
import PurchaseOrders from './pages/PurchaseOrders';
import CustomerOrders from './pages/CustomerOrders';
import CRMCommunications from './pages/CRMCommunications';
import AccountsReceivableLedger from './pages/AccountsReceivable';
import AccountsPayableLedger from './pages/AccountsPayable';
import ImportWizard from './pages/ImportWizard';

import MainLayout from './components/MainLayout';
import ReloadPrompt from './components/ReloadPrompt';

import { ErrorBoundary } from './components/ErrorBoundary';

// Accounting Pages
import AccountingTemplates from './pages/AccountingTemplates';
import AccountingSettings from './pages/AccountingSettings';
import AccountingApprovals from './pages/AccountingApprovals';

// Business Admin Pages
import BusinessOverview from './pages/BusinessAdmin/Overview';
import BusinessOrganization from './pages/BusinessAdmin/Organization';
import BusinessLocations from './pages/BusinessAdmin/Locations';
import BusinessTeam from './pages/BusinessAdmin/TeamManagement';
import BusinessRoles from './pages/BusinessAdmin/RolesManagement';
import Billing from './pages/BusinessAdmin/Billing';
import ShrinkageReport from './pages/BusinessAdmin/ShrinkageReport';
import AttendanceReport from './pages/BusinessAdmin/AttendanceReport';
import CommissionRules from './pages/BusinessAdmin/CommissionRules';
import BusinessSetup from './pages/BusinessAdmin/Setup';

// HR Pages
import Attendance from './pages/HR/Attendance';
import Schedules from './pages/HR/Schedules';
import MyCommissions from './pages/HR/MyCommissions';
import Loyalty from './pages/Loyalty';

// Report Pages
import ProfitLoss from './pages/Reports/ProfitLoss';
import AccountsReceivable from './pages/Reports/AccountsReceivable';

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <ConfirmProvider>
          <BrowserRouter>
            <AuthProvider>
              <ErrorBoundary>
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
                      <ProtectedRoute requiredPermission="manage_returns"><Returns /></ProtectedRoute>
                    } />
                    <Route path="/sales-record" element={
                      <ProtectedRoute><SalesRecord /></ProtectedRoute>
                    } />
                    <Route path="/till-account" element={
                      <ProtectedRoute requiredPermission="manage_till"><TillAccount /></ProtectedRoute>
                    } />
                    <Route path="/customers" element={
                      <ProtectedRoute><Customers /></ProtectedRoute>
                    } />
                    <Route path="/customers/:id" element={
                      <ProtectedRoute><CustomerDetail /></ProtectedRoute>
                    } />
                    <Route path="/customer-orders" element={
                      <ProtectedRoute><CustomerOrders /></ProtectedRoute>
                    } />
                    <Route path="/crm-communications" element={
                      <ProtectedRoute requiredPermission="manage_marketing"><CRMCommunications /></ProtectedRoute>
                    } />
                    <Route path="/accounts-receivable" element={
                      <ProtectedRoute requiredPermission="manage_financials"><AccountsReceivableLedger /></ProtectedRoute>
                    } />
                    <Route path="/accounts-payable" element={
                      <ProtectedRoute requiredPermission="manage_financials"><AccountsPayableLedger /></ProtectedRoute>
                    } />
                    <Route path="/imports/:entityType" element={
                      <ProtectedRoute requiredPermission="manage_financials"><ImportWizard /></ProtectedRoute>
                    } />
                    <Route path="/inventory" element={
                      <ProtectedRoute requiredPermission="view_inventory"><Inventory /></ProtectedRoute>
                    } />
                    <Route path="/alerts" element={
                      <ProtectedRoute requiredPermission="view_alerts"><Alerts /></ProtectedRoute>
                    } />
                    <Route path="/suppliers" element={
                      <ProtectedRoute requiredPermission="manage_suppliers"><Suppliers /></ProtectedRoute>
                    } />
                    <Route path="/purchase-orders" element={
                      <ProtectedRoute requiredPermission="view_purchases"><PurchaseOrders /></ProtectedRoute>
                    } />
                    {/* Protected sub-routes handled within components or layout level */}
                    <Route path="/reconciliation" element={
                      <ProtectedRoute requiredPermission="manage_reconciliation"><Reconciliation /></ProtectedRoute>
                    } />
                    <Route path="/invoice" element={<ProtectedRoute requiredPermission="manage_business"><InvoiceList /></ProtectedRoute>} />
                    <Route path="/invoice/:id" element={
                      <ProtectedRoute requiredPermission="manage_business"><InvoiceView /></ProtectedRoute>
                    } />
                    <Route path="/accounting-templates" element={
                      <ProtectedRoute requiredPermission="view_accounting"><AccountingTemplates /></ProtectedRoute>
                    } />
                    <Route path="/accounting-settings" element={
                      <ProtectedRoute requiredPermission="manage_accounting_settings"><AccountingSettings /></ProtectedRoute>
                    } />
                    <Route path="/accounting-approvals" element={
                      <ProtectedRoute requiredPermission="approve_accounting"><AccountingApprovals /></ProtectedRoute>
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
                      <ProtectedRoute requiredPermission="manage_organization"><BusinessOrganization /></ProtectedRoute>
                    } />
                    <Route path="/business-admin/locations" element={
                      <ProtectedRoute requiredPermission="manage_locations"><BusinessLocations /></ProtectedRoute>
                    } />
                    <Route path="/business-admin/team" element={
                      <ProtectedRoute requiredPermission="manage_users"><BusinessTeam /></ProtectedRoute>
                    } />
                    <Route path="/business-admin/roles" element={
                      <ProtectedRoute requiredPermission="manage_roles"><BusinessRoles /></ProtectedRoute>
                    } />
                    <Route path="/business-admin/billing" element={
                      <ProtectedRoute requiredPermission="manage_billing"><Billing /></ProtectedRoute>
                    } />
                    <Route path="/business-admin/shrinkage" element={
                      <ProtectedRoute requiredPermission="view_shrinkage_report"><ShrinkageReport /></ProtectedRoute>
                    } />
                    <Route path="/business-admin/attendance-report" element={
                      <ProtectedRoute requiredPermission="view_attendance_report"><AttendanceReport /></ProtectedRoute>
                    } />
                    <Route path="/business-admin/commission-rules" element={
                      <ProtectedRoute requiredPermission="manage_commission_rules"><CommissionRules /></ProtectedRoute>
                    } />
                    <Route path="/business-admin/setup" element={
                      <ProtectedRoute requiredPermission="manage_business"><BusinessSetup /></ProtectedRoute>
                    } />

                    {/* HR Pages */}
                    <Route path="/hr/attendance" element={
                      <ProtectedRoute><Attendance /></ProtectedRoute>
                    } />
                    <Route path="/hr/schedules" element={
                      <ProtectedRoute requiredPermission="manage_hr_schedules"><Schedules /></ProtectedRoute>
                    } />
                    <Route path="/hr/my-commissions" element={
                      <ProtectedRoute requiredPermission="view_my_commissions"><MyCommissions /></ProtectedRoute>
                    } />
                    <Route path="/loyalty" element={
                      <ProtectedRoute requiredPermission="manage_loyalty"><Loyalty /></ProtectedRoute>
                    } />

                    {/* Reports Pages */}
                    <Route path="/reports/pnl" element={
                      <ProtectedRoute requiredPermission="view_financial_reports"><ProfitLoss /></ProtectedRoute>
                    } />
                    <Route path="/reports/accounts-receivable" element={
                      <ProtectedRoute requiredPermission="view_financial_reports"><AccountsReceivable /></ProtectedRoute>
                    } />
                  </Route>

                  {/* Smart redirect based on role */}
                  <Route path="*" element={<SmartRedirect />} />
                </Routes>
                <ReloadPrompt />
              </ErrorBoundary>
            </AuthProvider>
          </BrowserRouter>
        </ConfirmProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
