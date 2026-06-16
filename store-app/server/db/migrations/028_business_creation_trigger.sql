-- Migration 028: Auto-seed Accounting Templates on Business Creation

CREATE OR REPLACE FUNCTION public.seed_default_accounting_templates()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert default templates for the new business
  INSERT INTO public.accounting_templates (business_id, name, description, type, assigned_roles, fields_schema)
  VALUES 
    (
      NEW.id, 
      'Mobile Money Deposit', 
      'Record deposits made via mobile money (MoMo, M-Pesa, etc).', 
      'deposit', 
      '["Cashier", "Salesperson", "Business Admin"]'::jsonb, 
      '[{"id": "1", "label": "Transaction Charges", "type": "number", "required": false, "options": "", "showIf": ""}]'::jsonb
    ),
    (
      NEW.id, 
      'POS Machine Deposit', 
      'Record card payments settled from a POS machine.', 
      'deposit', 
      '["Cashier", "Salesperson", "Business Admin"]'::jsonb, 
      '[{"id": "2", "label": "POS Machine Name", "type": "dropdown", "required": true, "options": "Stripe, Square, Clover, FirstData", "showIf": ""}, {"id": "3", "label": "Transaction Charges", "type": "number", "required": false, "options": "", "showIf": ""}]'::jsonb
    ),
    (
      NEW.id, 
      'Bank Deposit', 
      'Record physical cash deposited into a bank account.', 
      'deposit', 
      '["Cashier", "Manager", "Business Admin"]'::jsonb, 
      '[{"id": "4", "label": "Bank Name", "type": "dropdown", "required": true, "options": "Chase, Bank of America, Wells Fargo, Citi", "showIf": ""}]'::jsonb
    ),
    (
      NEW.id, 
      'General Expense', 
      'Record a standard business expense.', 
      'expense', 
      '["Cashier", "Manager", "Business Admin"]'::jsonb, 
      '[{"id": "5", "label": "Expense Category", "type": "dropdown", "required": true, "options": "Office Supplies, Utilities, Maintenance, Travel, Meals, Marketing", "showIf": ""}]'::jsonb
    );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists to allow re-running
DROP TRIGGER IF EXISTS on_business_created_seed_templates ON public.businesses;

-- Create the trigger
CREATE TRIGGER on_business_created_seed_templates
AFTER INSERT ON public.businesses
FOR EACH ROW
EXECUTE FUNCTION public.seed_default_accounting_templates();
