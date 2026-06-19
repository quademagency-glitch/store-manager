import { useState, useCallback } from 'react';
import { api } from '../lib/api';

export function useImports() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const uploadPreview = useCallback(async (file, entityType) => {
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('entity_type', entityType);
      return await api.postFile('/imports/preview', formData);
    } catch (err) {
      setError(err.message || 'Failed to read file');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const validateRows = useCallback(async ({ entityType, columnMapping, rows }) => {
    setLoading(true);
    setError(null);
    try {
      return await api.post('/imports/validate', { entity_type: entityType, column_mapping: columnMapping, rows });
    } catch (err) {
      setError(err.message || 'Failed to validate rows');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const commitImport = useCallback(async ({ entityType, sourceFilename, columnMapping, rows }) => {
    setLoading(true);
    setError(null);
    try {
      return await api.post('/imports/commit', {
        entity_type: entityType,
        source_filename: sourceFilename,
        column_mapping: columnMapping,
        rows,
      });
    } catch (err) {
      setError(err.message || 'Failed to commit import');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBatches = useCallback(async (page = 1) => {
    try {
      return await api.get(`/imports/batches?page=${page}`);
    } catch (err) {
      setError(err.message || 'Failed to fetch import history');
      return null;
    }
  }, []);

  const previewUndo = useCallback(async (batchId) => {
    try {
      return await api.post(`/imports/batches/${batchId}/undo?dry_run=true`);
    } catch (err) {
      setError(err.message || 'Failed to preview undo');
      return null;
    }
  }, []);

  const undoBatch = useCallback(async (batchId) => {
    try {
      return await api.post(`/imports/batches/${batchId}/undo`);
    } catch (err) {
      setError(err.message || 'Failed to undo import');
      return null;
    }
  }, []);

  return { loading, error, setError, uploadPreview, validateRows, commitImport, fetchBatches, previewUndo, undoBatch };
}
