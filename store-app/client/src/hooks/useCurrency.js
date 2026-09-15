import { useMemo } from 'react';

/**
 * currencyPrefixStyle, sizing for an `.input-prefix` money field.
 *
 * The stylesheet reserves 2rem of left padding, which clears a one-character
 * symbol like $ and nothing wider: GH₵ and F CFA sit on top of the value.
 * Reserve the symbol's own width instead, its 0.8rem offset plus the symbol
 * plus the gap the input pads with anyway.
 *
 * Spread onto the `.input-prefix-wrapper`, the input inherits it.
 */
export function currencyPrefixStyle(symbol) {
  return { '--prefix-pad': `calc(1.6rem + ${(symbol || '').length || 1}ch)` };
}

/**
 * useCurrency, Provides a standardized currency formatter based on business config.
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

  const prefixStyle = useMemo(() => currencyPrefixStyle(currencySymbol), [currencySymbol]);

  return { fmt, currencyCode, currencySymbol, locale, prefixStyle };
}
