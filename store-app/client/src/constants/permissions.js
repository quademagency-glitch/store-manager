export const PERMISSION_TREE = [
  {
    id: 'module_store_ops',
    label: 'Store Operations',
    children: [
      {
        id: 'sales_module',
        label: 'Sales & Returns',
        children: [
          { id: 'create_sales', label: 'Create POS Sales' },
          { id: 'view_sales', label: 'View Sales History' },
          { id: 'apply_discounts', label: 'Apply Custom Discounts' },
          { id: 'void_sales', label: 'Void Sales' },
          { id: 'process_refunds', label: 'Process Refunds & Reversals' },
        ]
      },
      {
        id: 'products_module',
        label: 'Products Catalog',
        children: [
          { id: 'view_products', label: 'View Products & Price History' },
          { id: 'create_edit_products', label: 'Create & Edit Products' },
          { id: 'delete_products', label: 'Delete Products' },
          { id: 'bulk_update_prices', label: 'Bulk Update Prices' },
          { id: 'print_price_tags', label: 'Print Price Lists & Tags' },
        ]
      },
      {
        id: 'inventory_module',
        label: 'Inventory Management',
        children: [
          { id: 'view_inventory', label: 'View Stock & Inventory Analytics' },
          { id: 'adjust_stock', label: 'Adjust Stock Quantities manually' },
          { id: 'transfer_stock', label: 'Transfer Stock between Branches' },
          { id: 'receive_goods', label: 'Receive Goods (GRN)' },
          { id: 'manage_batches', label: 'Manage Batches & Expiries' },
          { id: 'manage_stock_thresholds', label: 'Set Low Stock Thresholds' },
        ]
      },
      {
        id: 'purchasing_module',
        label: 'Purchasing & Suppliers',
        children: [
          { id: 'view_purchases', label: 'View Purchase Orders' },
          { id: 'manage_purchases', label: 'Create & Manage Purchase Orders' },
          { id: 'manage_suppliers', label: 'Manage Suppliers Directory' },
        ]
      },
      { id: 'view_alerts', label: 'View System Alerts & Notifications' },
      { id: 'manage_imports', label: 'Bulk Import Data (Import Wizard)' },
    ]
  },
  {
    id: 'module_accounting',
    label: 'Accounting & Finance',
    children: [
      {
        id: 'till_module',
        label: 'Till Account',
        children: [
          { id: 'view_till', label: 'View Till Account Balance' },
          { id: 'manage_till_open_close', label: 'Open & Close Till' },
          { id: 'manage_till_cash_drops', label: 'Perform Cash Drops' },
        ]
      },
      {
        id: 'ar_ap_module',
        label: 'Accounts Receivable & Payable',
        children: [
          { id: 'view_financials', label: 'View AR/AP & Invoices' },
          { id: 'record_payments', label: 'Record Payments for AR/AP' },
          { id: 'manage_financials', label: 'Create/Edit AR/AP Records' },
        ]
      },
      {
        id: 'templates_module',
        label: 'Accounting Templates',
        children: [
          { id: 'view_accounting', label: 'View Accounting Templates' },
          { id: 'manage_accounting_settings', label: 'Manage Accounting Settings' },
          { id: 'manage_accounting_templates', label: 'Create/Edit Templates' },
          { id: 'approve_accounting', label: 'Approve Pending Accounting Entries' },
        ]
      },
      { id: 'manage_reconciliation', label: 'Perform Bank Reconciliation' },
      { id: 'view_financial_reports', label: 'View Financial Reports (P&L, AR Report)' },
    ]
  },
  {
    id: 'module_crm',
    label: 'CRM & Marketing',
    children: [
      {
        id: 'customers_module',
        label: 'Customer Management',
        children: [
          { id: 'view_customers', label: 'View Customer Directory' },
          { id: 'view_customer_orders', label: 'View Customer Specific Orders' },
          { id: 'manage_customers', label: 'Add & Edit Customers' },
        ]
      },
      { id: 'manage_marketing', label: 'Manage Marketing & Comms (SMS/Email)' },
      { id: 'manage_loyalty', label: 'Manage Loyalty Rules & Rewards' },
    ]
  },
  {
    id: 'module_hr',
    label: 'HR & Team',
    children: [
      {
        id: 'attendance_module',
        label: 'Attendance & Schedules',
        children: [
          { id: 'view_schedules', label: 'View Work Schedules' },
          { id: 'manage_hr_schedules', label: 'Create & Edit Schedules' },
        ]
      },
      {
        id: 'team_management_module',
        label: 'Team Management',
        children: [
          { id: 'view_users', label: 'View Team Members' },
          { id: 'manage_users', label: 'Add & Edit Team Members' },
          { id: 'assign_branches', label: 'Assign Users to Branches' },
        ]
      },
      { id: 'view_my_commissions', label: 'View Own Commissions' },
    ]
  },
  {
    id: 'module_admin',
    label: 'Business Administration',
    children: [
      {
        id: 'setup_module',
        label: 'Business Setup',
        children: [
          { id: 'manage_business', label: 'Business Overview Dashboard' },
          { id: 'manage_organization', label: 'Edit Organization Profile' },
          { id: 'manage_locations', label: 'Manage Branch Locations' },
        ]
      },
      {
        id: 'security_module',
        label: 'Security & Rules',
        children: [
          { id: 'manage_roles', label: 'Create & Edit Custom Roles' },
          { id: 'manage_commission_rules', label: 'Set Global Commission Rules' },
        ]
      },
      {
        id: 'admin_reports_module',
        label: 'Admin Reports',
        children: [
          { id: 'view_shrinkage_report', label: 'View Shrinkage / Loss Prevention Report' },
          { id: 'view_attendance_report', label: 'View Global Attendance Report' },
        ]
      },
      { id: 'manage_billing', label: 'Manage Subscription Billing' },
    ]
  }
];

// Helper to get a flat list of all atomic permissions (leaf nodes)
export function getFlatPermissions() {
  const flatList = [];
  const traverse = (nodes) => {
    nodes.forEach(node => {
      if (node.children && node.children.length > 0) {
        traverse(node.children);
      } else {
        flatList.push(node);
      }
    });
  };
  traverse(PERMISSION_TREE);
  return flatList;
}

// Helper to get all leaf node IDs under a specific parent node
export function getLeafIds(node) {
  if (!node.children || node.children.length === 0) {
    return [node.id];
  }
  let ids = [];
  node.children.forEach(child => {
    ids = ids.concat(getLeafIds(child));
  });
  return ids;
}
