import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useToast } from '../hooks/useToast';
import BillingLedgerView from '../features/financials/components/BillingLedgerView';

export default function AccountsReceivable() {
  const [customers, setCustomers] = useState([]);
  const toast = useToast();

  useEffect(() => {
    // See AccountsPayable, an empty customer selector reads as "no customers"
    // rather than "the request failed", and blocks raising an invoice.
    api.get('/customers?limit=200').then(res => {
      setCustomers(res?.data || []);
    }).catch(() => {
      toast.error("Couldn't load customers. Refresh to try again.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <BillingLedgerView kind="ar" parties={customers} />;
}
