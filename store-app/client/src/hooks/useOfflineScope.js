import { useMemo } from 'react';
import { useAuthContext } from '../lib/AuthContext';
export function useOfflineScope() {
  const { businessId, user, activeLocationId } = useAuthContext();
  return useMemo(() => businessId && user?.id && activeLocationId
    ? { businessId, userId: user.id, locationId: activeLocationId } : null,
  [businessId, user?.id, activeLocationId]);
}
