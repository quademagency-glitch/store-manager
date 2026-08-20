import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useToast } from '../hooks/useToast';
import BillingLedgerView from '../features/financials/components/BillingLedgerView';

export default function AccountsPayable() {
  const [suppliers, setSuppliers] = useState([]);
  const toast = useToast();

  useEffect(() => {
    // A failure here leaves the supplier selector empty, which is
    // indistinguishable from genuinely having no suppliers, so the user sits
    // there unable to record a bill with no idea why. Say so.
    api.get('/suppliers').then(res => {
      setSuppliers(Array.isArray(res) ? res : []);
    }).catch(() => {
      toast.error("Couldn't load suppliers. Refresh to try again.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <BillingLedgerView kind="ap" parties={suppliers} />;
}
