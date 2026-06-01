const { supabaseAdmin } = require('./db/supabase');

async function test() {
  const { data: user, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email: 'test_delete_user@example.com',
    password: 'password123',
    email_confirm: true
  });
  
  if (createErr) {
    console.log("Create Error:", createErr);
    return;
  }
  
  console.log("User created:", user.user.id);
  
  const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(user.user.id);
  
  if (delErr) {
    console.log("Delete Error:", delErr);
  } else {
    console.log("Delete Success!");
  }
}

test();
