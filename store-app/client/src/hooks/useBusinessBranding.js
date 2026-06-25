import { useState, useEffect } from 'react';
import { getBusinessSlugFromHost } from '../lib/subdomain';
import { getBusinessBySlug } from '../lib/api';

// Resolves the business-branded login state for the current subdomain.
// Returns slug=null on the generic root domain (no branding to apply).
export function useBusinessBranding() {
  const [slug] = useState(() => getBusinessSlugFromHost());
  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(!!slug);

  useEffect(() => {
    if (!slug) return;
    getBusinessBySlug(slug).then((data) => {
      setBusiness(data);
      setLoading(false);
    });
  }, [slug]);

  return { slug, business, loading };
}
