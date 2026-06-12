const express = require('express');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');

const router = express.Router();

// Get all templates for the business
router.get('/', authGuard, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('accounting_templates')
      .select('*')
      .eq('business_id', req.user.business_id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Error fetching templates:', err);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Create a new template (Admins only)
router.post('/', authGuard, async (req, res) => {
  try {
    if (req.user.role !== 'Business Admin' && req.user.role !== 'Platform Admin') {
      return res.status(403).json({ error: 'Only admins can create templates.' });
    }

    const { name, description, type, assigned_roles, fields_schema, conditional_logic } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: 'Name and Type are required.' });
    }

    // Ensure Business Admin is always assigned
    const finalRoles = new Set(assigned_roles || []);
    finalRoles.add('Business Admin');

    const { data, error } = await supabaseAdmin
      .from('accounting_templates')
      .insert([{
        business_id: req.user.business_id,
        name,
        description,
        type,
        assigned_roles: Array.from(finalRoles),
        fields_schema: fields_schema || [],
        conditional_logic: conditional_logic || []
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Error creating template:', err);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// Update a template (Admins only)
router.put('/:id', authGuard, async (req, res) => {
  try {
    if (req.user.role !== 'Business Admin' && req.user.role !== 'Platform Admin') {
      return res.status(403).json({ error: 'Only admins can edit templates.' });
    }

    const { name, description, type, assigned_roles, fields_schema, conditional_logic } = req.body;

    // Ensure Business Admin is always assigned
    const finalRoles = new Set(assigned_roles || []);
    finalRoles.add('Business Admin');

    const { data, error } = await supabaseAdmin
      .from('accounting_templates')
      .update({
        name,
        description,
        type,
        assigned_roles: Array.from(finalRoles),
        fields_schema: fields_schema || [],
        conditional_logic: conditional_logic || [],
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .eq('business_id', req.user.business_id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Template not found' });
    
    res.json(data);
  } catch (err) {
    console.error('Error updating template:', err);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// Delete a template (Admins only)
router.delete('/:id', authGuard, async (req, res) => {
  try {
    if (req.user.role !== 'Business Admin' && req.user.role !== 'Platform Admin') {
      return res.status(403).json({ error: 'Only admins can delete templates.' });
    }

    const { error } = await supabaseAdmin
      .from('accounting_templates')
      .delete()
      .eq('id', req.params.id)
      .eq('business_id', req.user.business_id);

    if (error) throw error;
    res.json({ message: 'Template deleted successfully' });
  } catch (err) {
    console.error('Error deleting template:', err);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// Duplicate a template (Admins only)
router.post('/:id/duplicate', authGuard, async (req, res) => {
  try {
    if (req.user.role !== 'Business Admin' && req.user.role !== 'Platform Admin') {
      return res.status(403).json({ error: 'Only admins can duplicate templates.' });
    }

    // Fetch the source template
    const { data: source, error: fetchError } = await supabaseAdmin
      .from('accounting_templates')
      .select('*')
      .eq('id', req.params.id)
      .eq('business_id', req.user.business_id)
      .single();

    if (fetchError) throw fetchError;
    if (!source) return res.status(404).json({ error: 'Template not found' });

    // Create the duplicate with regenerated field IDs
    const newFieldsSchema = (source.fields_schema || []).map(field => ({
      ...field,
      id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
    }));

    const { data, error } = await supabaseAdmin
      .from('accounting_templates')
      .insert([{
        business_id: req.user.business_id,
        name: `${source.name} (Copy)`,
        description: source.description,
        type: source.type,
        assigned_roles: source.assigned_roles || [],
        fields_schema: newFieldsSchema,
        conditional_logic: source.conditional_logic || [],
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Error duplicating template:', err);
    res.status(500).json({ error: 'Failed to duplicate template' });
  }
});

module.exports = router;
