import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/AuthContext';
import { ThemeProvider } from './lib/ThemeContext';
import { ToastProvider } from './hooks/useToast';
import { ConfirmProvider } from './hooks/useConfirm';
import PostHogPageView from './components/PostHogPageView';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
/* Eager, like Login. Both are entry points for people arriving from
   the marketing site, and Signup is 4KB: lazy, it was a second
   network round trip that could not even begin until the 542KB entry
   chunk had downloaded and executed. Folding it in costs nothing and
   removes a serialized hop from the slowest path we have. */
import Signup from './pages/Signup';
const Dashboard = lazy(() => import('./pages/Dashboard'));

const Sales = lazy(() => import('./pages/Sales'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Alerts = lazy(() => import('./pages/Alerts'));
const Reconciliation = lazy(() => import('./pages/Reconciliation'));
const Settings = lazy(() => import('./pages/Settings'));
const Customers = lazy(() => import('./pages/Customers'));
const CustomerDetail = lazy(() => import('./pages/CustomerDetail'));
const Returns = lazy(() => import('./pages/Returns'));
const SalesRecord = lazy(() => import('./pages/SalesRecord'));
const TillAccount = lazy(() => import('./pages/TillAccount'));
const PlatformAdmin = lazy(() => import('./pages/PlatformAdmin'));
import ForgotPassword from "./pages/ForgotPassword";
import UpdatePassword from './pages/UpdatePassword';
const InvoiceList = lazy(() => import('./pages/InvoiceList'));
const InvoiceView = lazy(() => import('./pages/InvoiceView'));
import SmartRedirect from './components/SmartRedirect';
const UserProfile = lazy(() => import('./pages/UserProfile'));
const Suppliers = lazy(() => import('./pages/Suppliers'));
const PurchaseOrders = lazy(() => import('./pages/PurchaseOrders'));
const CustomerOrders = lazy(() => import('./pages/CustomerOrders'));
const CRMCommunications = lazy(() => import('./pages/CRMCommunications'));
const AccountsReceivableLedger = lazy(() => import('./pages/AccountsReceivable'));
const AccountsPayableLedger = lazy(() => import('./pages/AccountsPayable'));
const ImportWizard = lazy(() => import('./pages/ImportWizard'));
const HelpCenter = lazy(() => import('./pages/HelpCenter'));

import ReloadPrompt from './components/ReloadPrompt';
/* The signed-in chrome, kept out of the entry chunk. See AppShell.jsx. */
const AppShell = lazy(() => import('./components/AppShell'));

import { ErrorBoundary } from './components/ErrorBoundary';
import { ALERTS_PERMISSIONS } from './constants/permissions';

// Accounting Pages
const AccountingTemplates = lazy(() => import('./pages/AccountingTemplates'));
const AccountingSettings = lazy(() => import('./pages/AccountingSettings'));
const AccountingApprovals = lazy(() => import('./pages/AccountingApprovals'));

// Business Admin Pages
const BusinessOverview = lazy(() => import('./pages/BusinessAdmin/Overview'));
const BusinessOrganization = lazy(() => import('./pages/BusinessAdmin/Organization'));
const BusinessLocations = lazy(() => import('./pages/BusinessAdmin/Locations'));
const BusinessTeam = lazy(() => import('./pages/BusinessAdmin/TeamManagement'));
const BusinessRoles = lazy(() => import('./pages/BusinessAdmin/RolesManagement'));
const Billing = lazy(() => import('./pages/BusinessAdmin/Billing'));
const ShrinkageReport = lazy(() => import('./pages/BusinessAdmin/ShrinkageReport'));
const AttendanceReport = lazy(() => import('./pages/BusinessAdmin/AttendanceReport'));
const CommissionRules = lazy(() => import('./pages/BusinessAdmin/CommissionRules'));
const BusinessSetup = lazy(() => import('./pages/BusinessAdmin/Setup'));
const Integrations = lazy(() => import('./pages/BusinessAdmin/Integrations'));
const AuditLog = lazy(() => import('./pages/BusinessAdmin/AuditLog'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Terms = lazy(() => import('./pages/Terms'));
const Dpa = lazy(() => import('./pages/Dpa'));

// HR Pages
const Attendance = lazy(() => import('./pages/HR/Attendance'));
const Schedules = lazy(() => import('./pages/HR/Schedules'));
const MyCommissions = lazy(() => import('./pages/HR/MyCommissions'));
const Loyalty = lazy(() => import('./pages/Loyalty'));

// Report Pages
const ProfitLoss = lazy(() => import('./pages/Reports/ProfitLoss'));
const AccountsReceivable = lazy(() => import('./pages/Reports/AccountsReceivable'));

/** Test fixture for the route error boundary. Never reachable in production. */
function ThrowOnRender() {
  throw new Error('Deliberate test error from /__boom');
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <ConfirmProvider>
          <BrowserRouter>
            <PostHogPageView />
            <AuthProvider>
              <ErrorBoundary>
                {/* Routes are code-split, so a first visit to one has to wait
                    on its chunk. The fallback is deliberately empty rather
                    than a spinner: every route already renders its own loading
                    state while it fetches, and a second, differently-shaped
                    loader flashing in front of it read as a layout jump. */}
                <Suspense fallback={<div className="route-suspense-fallback" />}>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/signup" element={<Signup />} />
                  {/* Public, and deliberately outside ProtectedRoute: these are
                      linked from the marketing footer and the signup form, so
                      most readers arrive without an account. */}
                  <Route path="/privacy" element={<Privacy />} />
                  <Route path="/terms" element={<Terms />} />
                  <Route path="/dpa" element={<Dpa />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/update-password" element={<UpdatePassword />} />
                  <Route path="/platform-admin" element={
                    <ProtectedRoute requiredPermission="manage_platform"><PlatformAdmin /></ProtectedRoute>
                  } />
                  {/* ── UNIFIED LOGGED-IN ROUTES ── */}
                  {/* AppShell is the sidebar plus the product tour that points
                      at it. Both live behind this route rather than wrapping
                      the whole app: every tour step targets the sidebar, so
                      there is nothing for it to do on /login or /signup, and
                      starting it there would ambush people who are not signed
                      in. Keeping it here is also what lets it be lazy. */}
                  <Route
                    element={
                      <ProtectedRoute>
                        <AppShell />
                      </ProtectedRoute>
                    }
                  >
                    <Route path="/dashboard" element={<Dashboard />} />
                    {/* A route that throws on render, so the route-level error
                        boundary can be tested against a real React error
                        rather than a simulated one. Stripped from production
                        builds by the DEV guard: Vite evaluates
                        import.meta.env.DEV to false there and drops the
                        branch. Without it the boundary would be code nobody
                        has ever seen work. */}
                    {import.meta.env.DEV && (
                      <Route path="/__boom" element={<ThrowOnRender />} />
                    )}
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
                      <ProtectedRoute requiredPermission={ALERTS_PERMISSIONS}><Alerts /></ProtectedRoute>
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
                    {/* No permission gate: everyone who can sign in can read
                        the help, including the roles whose questions it most
                        often answers. */}
                    <Route path="/help" element={
                      <ProtectedRoute><HelpCenter /></ProtectedRoute>
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
                    <Route path="/business-admin/integrations" element={
                      <ProtectedRoute requiredPermission="manage_integrations"><Integrations /></ProtectedRoute>
                    } />
                    <Route path="/business-admin/audit-log" element={
                      <ProtectedRoute requiredPermission="manage_business"><AuditLog /></ProtectedRoute>
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
                </Suspense>
                <ReloadPrompt />
              </ErrorBoundary>
            </AuthProvider>
          </BrowserRouter>
        </ConfirmProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
