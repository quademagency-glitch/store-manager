require('dotenv').config();
const { supabaseAdmin } = require('./db/supabase');

async function seed() {
  console.log('Fetching first active business...');
  const { data: businesses, error: bizErr } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .limit(1);
    
  if (bizErr || !businesses || businesses.length === 0) {
    console.error('No business found to attach templates to.', bizErr);
    process.exit(1);
  }
  
  const businessId = businesses[0].id;
  
  const templates = [
    {
      business_id: businessId,
      name: 'Mobile Money Deposit',
      description: 'Record deposits made via mobile money (MoMo, M-Pesa, etc).',
      type: 'deposit',
      assigned_roles: ['Cashier', 'Salesperson', 'Business Admin'],
      fields_schema: [
        {
          id: '1',
          label: 'Transaction Charges',
          type: 'number',
          required: false,
          options: '',
          showIf: ''
        }
      ]
    },
    {
      business_id: businessId,
      name: 'POS Machine Deposit',
      description: 'Record card payments settled from a POS machine.',
      type: 'deposit',
      assigned_roles: ['Cashier', 'Salesperson', 'Business Admin'],
      fields_schema: [
        {
          id: '2',
          label: 'POS Machine Name',
          type: 'dropdown',
          required: true,
          options: 'Stripe, Square, Clover, FirstData',
          showIf: ''
        },
        {
          id: '3',
          label: 'Transaction Charges',
          type: 'number',
          required: false,
          options: '',
          showIf: ''
        }
      ]
    },
    {
      business_id: businessId,
      name: 'Bank Deposit',
      description: 'Record physical cash deposited into a bank account.',
      type: 'deposit',
      assigned_roles: ['Cashier', 'Manager', 'Business Admin'],
      fields_schema: [
        {
          id: '4',
          label: 'Bank Name',
          type: 'dropdown',
          required: true,
          options: 'Chase, Bank of America, Wells Fargo, Citi',
          showIf: ''
        }
      ]
    },
    {
      business_id: businessId,
      name: 'General Expense',
      description: 'Record a standard business expense.',
      type: 'expense',
      assigned_roles: ['Cashier', 'Manager', 'Business Admin'],
      fields_schema: [
        {
          id: '5',
          label: 'Expense Category',
          type: 'dropdown',
          required: true,
          options: 'Office Supplies, Utilities, Maintenance, Travel, Meals, Marketing',
          showIf: ''
        }
      ]
    }
  ];

  console.log('Inserting default templates...');
  const { error } = await supabaseAdmin.from('accounting_templates').insert(templates);

  if (error) {
    console.error('Failed to insert templates', error);
  } else {
    console.log('Successfully seeded default templates!');
  }
  
  process.exit(0);
}

seed();
