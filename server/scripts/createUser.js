#!/usr/bin/env node

/**
 * CLI script to create a new user.
 *
 * Usage:
 *   node scripts/createUser.js --name "John Doe" --email john@store.com --password secret123 --role manager
 *
 * Or run without flags and follow the interactive prompts:
 *   node scripts/createUser.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const readline = require('readline');
const { supabaseAdmin } = require('../db/supabase');

// ── Parse CLI flags ─────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, '');
    const value = args[i + 1];
    if (key && value) parsed[key] = value;
  }

  return parsed;
}

// ── Interactive prompt helper ───────────────────────────
function prompt(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function getInput(args) {
  if (args.name && args.email && args.password && args.role) {
    return args;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('\n📝 Create a new user\n');

  const name = args.name || (await prompt(rl, '  Name: '));
  const email = args.email || (await prompt(rl, '  Email: '));
  const password = args.password || (await prompt(rl, '  Password (min 6 chars): '));
  const role = args.role || (await prompt(rl, '  Role (manager / salesperson): '));

  rl.close();
  return { name, email, password, role };
}

// ── Main ────────────────────────────────────────────────
async function main() {
  const args = parseArgs();
  const { name, email, password, role } = await getInput(args);

  // Validate
  const validRoles = ['manager', 'salesperson'];
  if (!name || !email || !password || !role) {
    console.error('\n❌ All fields (name, email, password, role) are required.\n');
    process.exit(1);
  }
  if (!validRoles.includes(role)) {
    console.error(`\n❌ Invalid role "${role}". Must be one of: ${validRoles.join(', ')}.\n`);
    process.exit(1);
  }
  if (password.length < 6) {
    console.error('\n❌ Password must be at least 6 characters.\n');
    process.exit(1);
  }

  console.log(`\n⏳ Resolving role "${role}" in the database...`);
  const formattedRoleName = role.charAt(0).toUpperCase() + role.slice(1).toLowerCase(); // e.g. 'manager' -> 'Manager'
  const { data: roleData, error: roleError } = await supabaseAdmin
    .from('roles')
    .select('id, name')
    .eq('name', formattedRoleName)
    .single();

  if (roleError || !roleData) {
    console.error(`\n❌ Role "${formattedRoleName}" not found in roles table. Please run migration 006 first.\n`);
    process.exit(1);
  }

  console.log(`⏳ Creating user "${name}" (${email}) with role "${roleData.name}"...`);

  // 1. Create auth user in Supabase
  const { data: authData, error: authError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role: roleData.name },
    });

  if (authError) {
    console.error(`\n❌ Supabase Auth error: ${authError.message}\n`);
    process.exit(1);
  }

  // 2. Upsert profile into users table
  const { data: userData, error: userError } = await supabaseAdmin
    .from('users')
    .upsert({
      id: authData.user.id,
      name,
      email,
      role_id: roleData.id,
    })
    .select('id, name, email, role_id, created_at')
    .single();

  if (userError) {
    // Rollback auth user
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    console.error(`\n❌ Database error (auth user rolled back): ${userError.message}\n`);
    process.exit(1);
  }

  console.log('\n✅ User created successfully!\n');
  console.log('  ID:         ', userData.id);
  console.log('  Name:       ', userData.name);
  console.log('  Email:      ', userData.email);
  console.log('  Role:       ', roleData.name);
  console.log('  Role ID:    ', userData.role_id);
  console.log('  Created at: ', userData.created_at);
  console.log();

  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Unexpected error:', err.message);
  process.exit(1);
});
