-- ============================================
-- Migration 055: Accounting Starter Pack RPC
-- Migration 028 already auto-seeds 4 default templates on every NEW
-- business via a trigger — but that trigger only fires going forward, so
-- any business created before 028 shipped has none. This extracts the
-- same template list into a reusable, dedup-safe function the trigger
-- and a manual "Install Starter Pack" action (for pre-existing businesses
-- catching up) both call, instead of duplicating the content between SQL
-- and a JS route constant.
-- ============================================

CREATE OR REPLACE FUNCTION public.apply_accounting_starter_pack(p_business_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_inserted INTEGER := 0;
  v_template RECORD;
BEGIN
  FOR v_template IN
    SELECT * FROM (VALUES
      ('Mobile Money Deposit', 'Record deposits made via mobile money (MoMo, M-Pesa, etc).', 'deposit',
        '["Cashier", "Salesperson", "Business Admin"]'::jsonb,
        '[{"id": "1", "label": "Transaction Charges", "type": "number", "required": false, "options": "", "showIf": ""}]'::jsonb),
      ('POS Machine Deposit', 'Record card payments settled from a POS machine.', 'deposit',
        '["Cashier", "Salesperson", "Business Admin"]'::jsonb,
        '[{"id": "2", "label": "POS Machine Name", "type": "dropdown", "required": true, "options": "Stripe, Square, Clover, FirstData", "showIf": ""}, {"id": "3", "label": "Transaction Charges", "type": "number", "required": false, "options": "", "showIf": ""}]'::jsonb),
      ('Bank Deposit', 'Record physical cash deposited into a bank account.', 'deposit',
        '["Cashier", "Manager", "Business Admin"]'::jsonb,
        '[{"id": "4", "label": "Bank Name", "type": "dropdown", "required": true, "options": "Chase, Bank of America, Wells Fargo, Citi", "showIf": ""}]'::jsonb),
      ('General Expense', 'Record a standard business expense.', 'expense',
        '["Cashier", "Manager", "Business Admin"]'::jsonb,
        '[{"id": "5", "label": "Expense Category", "type": "dropdown", "required": true, "options": "Office Supplies, Utilities, Maintenance, Travel, Meals, Marketing", "showIf": ""}]'::jsonb)
    ) AS t(name, description, type, assigned_roles, fields_schema)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.accounting_templates
      WHERE business_id = p_business_id AND name = v_template.name
    ) THEN
      INSERT INTO public.accounting_templates (business_id, name, description, type, assigned_roles, fields_schema)
      VALUES (p_business_id, v_template.name, v_template.description, v_template.type, v_template.assigned_roles, v_template.fields_schema);
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN v_inserted;
END;
$$ LANGUAGE plpgsql;

-- Re-point the new-business trigger at the shared function so the template
-- list only lives in one place going forward.
CREATE OR REPLACE FUNCTION public.seed_default_accounting_templates()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.apply_accounting_starter_pack(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
