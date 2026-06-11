const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

(async () => {
  const authRes = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'quajoedem@gmail.com', password: 'Password123!' })
  });
  const authData = await authRes.json();
  const token = authData.session.access_token;
  
  // Try getting products
  const gRes = await fetch('http://localhost:3001/api/products', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('Get Products:', gRes.status, await gRes.json());
  
  // Try getting a specific product
  const id = '6304b519-3ecc-45f9-b662-f4fd211949e4';
  const g1Res = await fetch(`http://localhost:3001/api/products/${id}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('Get Product 1:', g1Res.status, await g1Res.json());
  
  // Try editing the product
  const pRes = await fetch(`http://localhost:3001/api/products/${id}`, {
    method: 'PUT',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ name: 'Test Product 3 Edited', sku: 'TEST-003', category: 'Testing', price: 150 })
  });
  console.log('Edit Product response:', pRes.status, await pRes.json());
  
  // Try deleting the product
  const dRes = await fetch(`http://localhost:3001/api/products/${id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('Delete Product response:', dRes.status, await dRes.json());
  
})();
