#!/bin/bash
# Inventory.jsx fixes
sed -i '' -e 's/import { useState, useEffect, useMemo, useCallback } from/import { useState, useEffect, useMemo } from/' src/pages/Inventory.jsx
sed -i '' -e 's/error: productsError, //' src/pages/Inventory.jsx
sed -i '' -e 's/error: stockError, //' src/pages/Inventory.jsx
sed -i '' -e '/const \[productFormData/d' src/pages/Inventory.jsx
sed -i '' -e '/name: '\'''\', sku: '\'''\', category: '\'''\', price/d' src/pages/Inventory.jsx
sed -i '' -e '/  });/d' src/pages/Inventory.jsx
sed -i '' -e '/setProductFormData({/,/    });/d' src/pages/Inventory.jsx
sed -i '' -e '/\/\/ eslint-disable-next-line react-hooks\/exhaustive-deps/d' src/pages/Inventory.jsx

# Sales.jsx fixes
sed -i '' -e 's/loading: productsLoading //g' src/pages/Sales.jsx
sed -i '' -e 's/sendVerificationCode, //g' src/pages/Sales.jsx
sed -i '' -e 's/, loading: customerLoading //g' src/pages/Sales.jsx
sed -i '' -e '/const \[newCustomerData/d' src/pages/Sales.jsx
sed -i '' -e '/const \[showScanner/d' src/pages/Sales.jsx
sed -i '' -e '/const \[activeScanTarget/d' src/pages/Sales.jsx
sed -i '' -e 's/catch {/catch (err) {/g' src/pages/Sales.jsx

# Run lint to verify
npm run lint
