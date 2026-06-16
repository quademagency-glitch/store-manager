import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api';

/**
 * usePrintDocument — Shared hook for printing any element as a document.
 * 
 * Features:
 *   - Fetches and caches business data (name, logo, letterhead)
 *   - Provides `printElement(id, format)` to safely print any DOM element
 *   - Supports format: 'thermal' | 'a4' (auto-detects if not specified)
 *   - Does NOT destroy the DOM (unlike the old document.body.innerHTML approach)
 * 
 * Usage:
 *   const { business, printElement, loading } = usePrintDocument();
 * 
 *   // In your JSX:
 *   <div id="my-receipt" className="printable-area">...</div>
 *   <button onClick={() => printElement('my-receipt', 'thermal')}>Print</button>
 */
export function usePrintDocument() {
  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const loadBusiness = async () => {
      try {
        const data = await api.get('/businesses/me');
        setBusiness(data);
      } catch (err) {
        if (import.meta.env.DEV) console.error('Failed to load business for print:', err);
      } finally {
        setLoading(false);
      }
    };
    loadBusiness();
  }, []);

  /**
   * Print a specific element by ID.
   * 
   * This uses the global print.css which hides everything except .printable-area.
   * Just ensure the target element has className="printable-area" (or id="printable-receipt").
   * 
   * @param {string} elementId - The DOM id of the element to print
   * @param {'thermal'|'a4'} [format] - Print format (adds .print-format-thermal or .print-format-a4)
   */
  const printElement = useCallback((elementId, format) => {
    const el = document.getElementById(elementId);
    if (!el) {
      if (import.meta.env.DEV) console.warn(`printElement: no element found with id="${elementId}"`);
      return;
    }

    // Ensure the element has the printable-area class
    const hadClass = el.classList.contains('printable-area');
    if (!hadClass) {
      el.classList.add('printable-area');
    }

    // Add format class
    const formatClass = format === 'thermal' ? 'print-format-thermal' : 'print-format-a4';
    el.classList.add(formatClass);

    // Trigger print
    window.print();

    // Clean up
    if (!hadClass) {
      el.classList.remove('printable-area');
    }
    el.classList.remove(formatClass);
  }, []);

  return {
    business,
    loading,
    printElement,
  };
}
