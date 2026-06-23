// Feature catalog for platform_plans.features (JSONB), sourced from QuadERP_Pricing_Matrix.csv
export const FEATURE_LABELS = {
  // Point of Sale (POS)
  pos_touch: 'Touch-Optimized Register',
  pos_multi_payment: 'Multi-Payment (Cash/Card/Momo)',
  pos_returns: 'Returns & Refunds',
  pos_till: 'Till Management (Cash Drawer)',
  // Inventory & Stock Control
  inv_realtime: 'Real-time Stock Sync',
  inv_low_stock: 'Low Stock Alerts',
  inv_adjustments: 'Stock Adjustments & Reconciliation',
  inv_transfers: 'Multi-Store Stock Transfers',
  inv_routing: 'Centralized Warehouse Routing',
  // Business Dashboard & Analytics
  analytics_basic: 'Basic Sales Metrics & Charts',
  analytics_top_selling: 'Top Selling Products',
  analytics_loss_prevention: 'Advanced Loss Prevention Alerts',
  analytics_employee: 'Employee Performance Tracking',
  analytics_cross_location: 'Cross-Location Comparison',
  // Integrated Accounting & Invoicing
  acc_b2b_invoice: 'B2B Invoicing Generation',
  acc_ar: 'Accounts Receivable (Who Owes You)',
  acc_ap: 'Accounts Payable (Who You Owe)',
  acc_expense: 'Basic Expense Logging',
  // CRM & Customer Loyalty
  crm_profiles: 'Customer Profiles & History',
  crm_loyalty: 'Loyalty Points & Rewards',
  crm_marketing: 'Marketing Comms (SMS/Email)',
  // Purchasing & Supply Chain
  po_directory: 'Supplier Directory',
  po_create: 'Create Purchase Orders (POs)',
  po_auto_receive: 'Auto-Receive POs into Stock',
  // Staff Management & Security
  staff_basic: 'Basic Staff Profiles',
  staff_advanced_roles: 'Advanced Role-Based Permissions',
  staff_audit: 'Detailed Activity Audit Logs',
  // Enterprise / Technical Extras
  api_access: 'Custom API Integrations',
  legacy_migration: 'Legacy Data Migration',
  onsite_training: 'On-site Staff Training',
  custom_sla: 'Custom SLA (99.9% Uptime)',
};
