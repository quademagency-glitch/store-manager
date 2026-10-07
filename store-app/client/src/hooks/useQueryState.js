import { useSearchParams } from 'react-router-dom';
import { useCallback } from 'react';

/** Each update preserves unrelated URL state; links and browser Back keep context. */
export function useQueryState(key, fallback = '') {
  const [params, setParams] = useSearchParams();
  const value = params.get(key) ?? fallback;
  const setValue = useCallback(next => {
    setParams(previous => {
      const updated = new URLSearchParams(previous);
      const resolved = typeof next === 'function' ? next(previous.get(key) ?? fallback) : next;
      if (String(resolved) === String(fallback) || resolved == null) updated.delete(key);
      else updated.set(key, String(resolved));
      return updated;
    }, { replace: true });
  }, [key, fallback, setParams]);
  return [value, setValue];
}
