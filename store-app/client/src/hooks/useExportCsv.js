import { useCallback } from 'react';
import { useToast } from './useToast';

/**
 * Generic CSV export hook.
 * Usage:
 *   const { exportCsv } = useExportCsv();
 *   exportCsv(data, columns, 'sales_export');
 *
 * @param {Object[]} data - Array of row objects
 * @param {Array<{ key: string, label: string, format?: (v, row) => string }>} columns
 * @param {string} filename - Filename without extension
 */
export function useExportCsv() {
  const toast = useToast();

  const exportCsv = useCallback((data, columns, filename = 'export') => {
    if (!data || data.length === 0) {
      toast.error('No data to export');
      return;
    }

    try {
      // Build header
      const header = columns.map(c => `"${c.label}"`).join(',');

      // Build rows
      const rows = data.map(row => {
        return columns.map(col => {
          let value;
          if (col.format) {
            value = col.format(row[col.key], row);
          } else {
            value = row[col.key];
          }

          // Handle nested keys (e.g. "customer.name")
          if (value === undefined && col.key.includes('.')) {
            const parts = col.key.split('.');
            let v = row;
            for (const p of parts) {
              v = v?.[p];
            }
            value = v;
          }

          if (value === null || value === undefined) value = '';
          // Escape quotes in CSV
          const str = String(value).replace(/"/g, '""');
          return `"${str}"`;
        }).join(',');
      });

      const csv = [header, ...rows].join('\n');
      const BOM = '\uFEFF'; // UTF-8 BOM for Excel compatibility
      const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Exported ${data.length} rows to CSV`);
    } catch (err) {
      console.error('CSV export error:', err);
      toast.error('Failed to export CSV');
    }
  }, [toast]);

  return { exportCsv };
}
