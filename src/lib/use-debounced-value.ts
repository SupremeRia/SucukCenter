import { useEffect, useState } from 'react';
// Keep typing synchronous; debounce only the database query. A new screen never inherits the old query.
export function useDebouncedValue<T>(value: T, delay = 150, scope = '') {
  const [settled, setSettled] = useState({ scope, value });
  useEffect(() => {
    if (settled.scope !== scope) {
      setSettled({ scope, value });
      return;
    }
    if (Object.is(settled.value, value)) return;
    const timer = setTimeout(() => setSettled({ scope, value }), delay);
    return () => clearTimeout(timer);
  }, [value, delay, scope, settled.scope, settled.value]);
  return settled.scope === scope ? settled.value : value;
}
