import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import BillingLedgerView from '../features/financials/components/BillingLedgerView';

export default function AccountsReceivable() {
  const [customers, setCustomers] = useState([]);

  useEffect(() => {
    api.get('/customers?limit=200').then(res => {
      setCustomers(res?.data || []);
    }).catch(() => {});
  }, []);

  return <BillingLedgerView kind="ar" parties={customers} />;
}
