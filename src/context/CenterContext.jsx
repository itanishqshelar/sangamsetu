import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const CenterContext = createContext(null);
const STORAGE_KEY = 'sangamsetu-reporting-center';

export function CenterProvider({ children }) {
  const [centers, setCenters] = useState([]);
  const [selectedCenter, setSelectedCenter] = useState(localStorage.getItem(STORAGE_KEY) || '');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadCenters() {
      setIsLoading(true);
      setError('');

      const { data, error: fetchError } = await supabase
        .from('reporting_center_lookup')
        .select('center_name')
        .order('center_name', { ascending: true });

      if (!isMounted) {
        return;
      }

      if (fetchError) {
        setError(fetchError.message);
        setCenters([]);
        setIsLoading(false);
        return;
      }

      const names = data?.map((entry) => entry.center_name) ?? [];
      setCenters(names);

      setSelectedCenter((current) => {
        if (current && names.includes(current)) {
          return current;
        }
        return names[0] ?? '';
      });

      setIsLoading(false);
    }

    loadCenters();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (selectedCenter) {
      localStorage.setItem(STORAGE_KEY, selectedCenter);
    }
  }, [selectedCenter]);

  const value = useMemo(
    () => ({
      centers,
      selectedCenter,
      setSelectedCenter,
      isLoading,
      error,
    }),
    [centers, selectedCenter, isLoading, error],
  );

  return <CenterContext.Provider value={value}>{children}</CenterContext.Provider>;
}

export function useCenter() {
  const context = useContext(CenterContext);

  if (!context) {
    throw new Error('useCenter must be used inside CenterProvider');
  }

  return context;
}
