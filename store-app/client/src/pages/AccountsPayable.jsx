import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import BillingLedgerView from '../features/financials/components/BillingLedgerView';

export default function AccountsPayable() {
  const [suppliers, setSuppliers] = useState([]);

  useEffect(() => {
    api.get('/suppliers').then(res => {
      setSuppliers(Array.isArray(res) ? res : []);
    }).catch(() => {});
  }, []);

  return <BillingLedgerView kind="ap" parties={suppliers} />;
}
