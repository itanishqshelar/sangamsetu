import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export function useOperationsData() {
  const [summary, setSummary] = useState(null);
  const [datasets, setDatasets] = useState([]);
  const [matches, setMatches] = useState([]);
  const [zones, setZones] = useState([]);
  const [chokepoints, setChokepoints] = useState([]);
  const [cctvLocations, setCctvLocations] = useState([]);
  const [policeStations, setPoliceStations] = useState([]);
  const [reports, setReports] = useState([]);
  const [locationLookup, setLocationLookup] = useState([]);
  const [centerLookup, setCenterLookup] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  const refresh = () => setRefreshTick((current) => current + 1);

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      setIsLoading(true);
      setError('');

      const [
        { data: summaryData, error: summaryError },
        { data: datasetsData, error: datasetsError },
        { data: matchesData, error: matchesError },
        { data: zonesData, error: zonesError },
        { data: chokepointsData, error: chokepointsError },
        { data: cctvData, error: cctvError },
        { data: policeData, error: policeError },
        { data: reportsData, error: reportsError },
        { data: locationsData, error: locationsError },
        { data: centersData, error: centersError },
      ] = await Promise.all([
        supabase.from('report_geo_summary').select('*').limit(1).maybeSingle(),
        supabase.from('reference_data_summary').select('*'),
        supabase.from('possible_report_matches').select('*').limit(8),
        supabase.from('zone_boundaries').select('*').order('zone_name', { ascending: true }),
        supabase.from('chokepoints_parking').select('*'),
        supabase.from('cctv_locations').select('*'),
        supabase.from('police_stations').select('*'),
        supabase.from('reports').select('*').order('reported_at', { ascending: false }).limit(250),
        supabase.from('last_seen_location_lookup').select('*'),
        supabase.from('reporting_center_lookup').select('*'),
      ]);

      if (!isMounted) {
        return;
      }

      const firstError =
        summaryError ||
        datasetsError ||
        matchesError ||
        zonesError ||
        chokepointsError ||
        cctvError ||
        policeError ||
        reportsError ||
        locationsError ||
        centersError;
      if (firstError) {
        setError(firstError.message);
      } else {
        setSummary(summaryData);
        setDatasets(datasetsData ?? []);
        setMatches(matchesData ?? []);
        setZones(zonesData ?? []);
        setChokepoints(chokepointsData ?? []);
        setCctvLocations(cctvData ?? []);
        setPoliceStations(policeData ?? []);
        setReports(reportsData ?? []);
        setLocationLookup(locationsData ?? []);
        setCenterLookup(centersData ?? []);
      }

      setIsLoading(false);
    }

    loadDashboard();

    const channel = supabase
      .channel('operations-live-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, () => {
        // Trigger a background refresh of the operations data whenever any report changes
        setRefreshTick((current) => current + 1);
      })
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [refreshTick]);

  useEffect(() => {
    const channel = supabase
      .channel('operations-report-refresh')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, () => {
        setRefreshTick((current) => current + 1);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    summary,
    datasets,
    matches,
    zones,
    chokepoints,
    cctvLocations,
    policeStations,
    reports,
    locationLookup,
    centerLookup,
    error,
    isLoading,
    refresh
  };
}
