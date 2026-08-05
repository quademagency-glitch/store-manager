require('dotenv').config();
const { Client } = require('pg');

async function apply() {
  // If connection string is not available, we can't use pg
  console.log("DB URL:", process.env.DATABASE_URL ? "Exists" : "Missing");
}
apply();
