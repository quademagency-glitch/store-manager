import { useMemo } from 'react';

/**
 * useCurrency — Provides a standardized currency formatter based on business config.
 * 
 * Resolves the inconsistency where some pages use USD and others GHS.
 * Falls back to GHS if no business data is provided.
 * 
 * Usage:
 *   const { fmt, currencyCode, currencySymbol } = useCurrency(business);
 *   fmt(1500)  // → "GH₵1,500.00"
 * 
 * @param {Object} [business] - Business object (from usePrintDocument or API)
 * @param {string} [overrideCurrency] - Override currency code (e.g. from invoice.currency)
 */
export function useCurrency(business, overrideCurrency) {
  const currencyCode = overrideCurrency || business?.currency || 'GHS';

  const localeMap = {
    GHS: 'en-GH',
    USD: 'en-US',
    EUR: 'en-DE',
    GBP: 'en-GB',
    NGN: 'en-NG',
    KES: 'en-KE',
    ZAR: 'en-ZA',
    XOF: 'fr-SN',
    XAF: 'fr-CM',
  };

  const locale = localeMap[currencyCode] || 'en-GH';

  const fmt = useMemo(() => {
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return (amount) => formatter.format(amount || 0);
  }, [currencyCode, locale]);

  // Derive symbol for inline display
  const currencySymbol = useMemo(() => {
    try {
      const parts = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currencyCode,
      }).formatToParts(0);
      const symbolPart = parts.find(p => p.type === 'currency');
      return symbolPart?.value || currencyCode;
    } catch {
      return currencyCode;
    }
  }, [currencyCode, locale]);

  return { fmt, currencyCode, currencySymbol, locale };
}
