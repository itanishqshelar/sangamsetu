import { useCallback, useEffect, useRef, useState } from 'react';
import ReportCard from './ReportCard';
import { supabase } from '../lib/supabaseClient';

const PAGE_SIZE = 25;

const filterDefaults = {
  report_type: 'all',
  gender: 'all',
  age_band: 'all',
  status: 'all',
  location: 'all',
  search: '',
};

const genders = ['Male', 'Female', 'Unknown'];
const ageBands = ['0-12', '13-17', '18-40', '41-60', '61-70', '71-80', '80+'];
const statuses = ['Pending', 'Reunited', 'Transferred to hospital', 'Unresolved'];

function sortReports(items) {
  return [...items].sort((a, b) => {
    const left = new Date(a.reported_at || a.created_at || 0).getTime();
    const right = new Date(b.reported_at || b.created_at || 0).getTime();
    return right - left;
  });
}

function stripHeavyFields(row) {
  // eslint-disable-next-line no-unused-vars
  const { face_embedding, ...rest } = row;
  return rest;
}

export default function ReportsList() {
  const [reports, setReports] = useState([]);
  const [locations, setLocations] = useState([]);
  const [filters, setFilters] = useState(filterDefaults);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState('');
  const offsetRef = useRef(0);
  const searchTimerRef = useRef(null);

  // Build a server query with current filters applied
  const buildQuery = useCallback((currentFilters) => {
    let query = supabase
      .from('reports')
      .select('*', { count: 'exact' })
      .order('reported_at', { ascending: false });

    if (currentFilters.report_type !== 'all') {
      query = query.eq('report_type', currentFilters.report_type);
    }
    if (currentFilters.gender !== 'all') {
      query = query.eq('gender', currentFilters.gender);
    }
    if (currentFilters.age_band !== 'all') {
      query = query.eq('age_band', currentFilters.age_band);
    }
    if (currentFilters.status !== 'all') {
      query = query.eq('status', currentFilters.status);
    }
    if (currentFilters.location !== 'all') {
      query = query.eq('last_seen_location', currentFilters.location);
    }

    const searchTerm = currentFilters.search.trim();
    if (searchTerm) {
      // Search across name, physical_description, remarks, reporting_center
      query = query.or(
        `name.ilike.%${searchTerm}%,physical_description.ilike.%${searchTerm}%,remarks.ilike.%${searchTerm}%,reporting_center.ilike.%${searchTerm}%,last_seen_location.ilike.%${searchTerm}%,reporter_mobile.ilike.%${searchTerm}%`
      );
    }

    return query;
  }, []);

  // Load a page of reports from the server with current filters
  const loadPage = useCallback(async (offset, currentFilters, append = false) => {
    if (offset === 0) setIsLoading(true);
    else setIsLoadingMore(true);
    setError('');

    const { data, error: fetchError, count } = await buildQuery(currentFilters)
      .range(offset, offset + PAGE_SIZE - 1);

    if (fetchError) {
      setError(fetchError.message || 'Unable to load reports.');
      setIsLoading(false);
      setIsLoadingMore(false);
      return;
    }

    const cleaned = (data ?? []).map(stripHeavyFields);
    const newOffset = offset + cleaned.length;
    offsetRef.current = newOffset;
    setHasMore(count != null ? newOffset < count : cleaned.length === PAGE_SIZE);

    setReports((current) =>
      append ? sortReports([...current, ...cleaned]) : sortReports(cleaned)
    );

    setIsLoading(false);
    setIsLoadingMore(false);
  }, [buildQuery]);

  // Load locations for the filter dropdown
  useEffect(() => {
    supabase
      .from('last_seen_location_lookup')
      .select('location_name')
      .order('location_name', { ascending: true })
      .then(({ data }) => {
        setLocations(data?.map((entry) => entry.location_name) ?? []);
      });
  }, []);

  // Reload from server whenever filters change
  useEffect(() => {
    // Debounce search input (300ms), fire immediately for dropdown filters
    const isSearchChange = filters.search.trim() !== '';
    const delay = isSearchChange ? 300 : 0;

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      loadPage(0, filters, false);
    }, delay);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [filters, loadPage]);

  // Realtime subscription — new items always prepend to the top
  useEffect(() => {
    const channel = supabase
      .channel('reports-live-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, async (payload) => {
        if (payload.eventType === 'INSERT') {
          const { data } = await supabase
            .from('reports')
            .select('*')
            .eq('report_id', payload.new.report_id)
            .single();
          if (data) {
            setReports((current) =>
              sortReports([stripHeavyFields(data), ...current.filter((item) => item.report_id !== data.report_id)])
            );
            offsetRef.current += 1;
          }
          return;
        }

        if (payload.eventType === 'UPDATE') {
          setReports((current) => {
            const newRow = stripHeavyFields(payload.new);
            const exists = current.some((item) => item.report_id === newRow.report_id);
            const next = exists
              ? current.map((item) => (item.report_id === newRow.report_id ? { ...item, ...newRow } : item))
              : current;
            return sortReports(next);
          });
          return;
        }

        if (payload.eventType === 'DELETE') {
          setReports((current) => current.filter((item) => item.report_id !== payload.old.report_id));
          offsetRef.current = Math.max(0, offsetRef.current - 1);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  function handleFilterChange(event) {
    const { name, value } = event.target;
    setFilters((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleMarkReunited(reportId) {
    setUpdatingId(reportId);

    // Optimistic UI update for instant feedback
    setReports((current) =>
      current.map((item) =>
        item.report_id === reportId ? { ...item, status: 'Reunited' } : item
      )
    );

    const { error: updateError } = await supabase
      .from('reports')
      .update({ status: 'Reunited' })
      .eq('report_id', reportId);

    if (updateError) {
      setError(updateError.message);
    }
    setUpdatingId('');
  }

  async function handleDeleteReport(reportId, photoUrl) {
    const { error: deleteError } = await supabase
      .from('reports')
      .delete()
      .eq('report_id', reportId);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    // Also delete the photo from Storage if one exists
    if (photoUrl) {
      try {
        const urlObj = new URL(photoUrl);
        // Supabase storage paths are after /object/public/<bucket>/
        const match = urlObj.pathname.match(/\/object\/public\/report-photos\/(.+)/);
        if (match?.[1]) {
          await supabase.storage.from('report-photos').remove([decodeURIComponent(match[1])]);
        }
      } catch {
        // Photo cleanup is best-effort; don't block on failure
      }
    }

    // Realtime will handle removing from state, but remove immediately for fast UI
    setReports((current) => current.filter((r) => r.report_id !== reportId));
  }

  const activeFilterCount = Object.entries(filters).filter(
    ([key, val]) => key === 'search' ? val.trim() !== '' : val !== 'all'
  ).length;

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">All reports</h2>
          <span className="text-xs font-medium text-slate-400">
            {reports.length} loaded{hasMore ? '+' : ''}
          </span>
        </div>
        <p className="text-sm text-slate-500">Synced across centers in real time.</p>
      </div>

      {/* Filters — collapsible on small sidebar */}
      <details className="group rounded-2xl border border-slate-200 bg-slate-50" open>
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-2xl">
          <span className="flex items-center gap-2">
            Filters
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-saffron px-2 py-0.5 text-[10px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </span>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </summary>
        <div className="flex flex-col gap-3 px-4 pb-4 pt-2">
          <FilterField label="Type">
            <select name="report_type" value={filters.report_type} onChange={handleFilterChange} className="input py-2">
              <option value="all">All</option>
              <option value="missing">Missing</option>
              <option value="found">Found</option>
            </select>
          </FilterField>

          <FilterField label="Gender">
            <select name="gender" value={filters.gender} onChange={handleFilterChange} className="input py-2">
              <option value="all">All</option>
              {genders.map((gender) => (
                <option key={gender} value={gender}>{gender}</option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Age band">
            <select name="age_band" value={filters.age_band} onChange={handleFilterChange} className="input py-2">
              <option value="all">All</option>
              {ageBands.map((band) => (
                <option key={band} value={band}>{band}</option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Status">
            <select name="status" value={filters.status} onChange={handleFilterChange} className="input py-2">
              <option value="all">All</option>
              {statuses.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Zone / location">
            <select name="location" value={filters.location} onChange={handleFilterChange} className="input py-2">
              <option value="all">All</option>
              {locations.map((location) => (
                <option key={location} value={location}>{location}</option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Search">
            <input
              name="search"
              value={filters.search}
              onChange={handleFilterChange}
              placeholder="Name, location, description..."
              className="input py-2"
            />
          </FilterField>

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => setFilters(filterDefaults)}
              className="rounded-xl border border-slate-200 bg-white py-2 text-xs font-medium text-slate-500 transition hover:bg-slate-50"
            >
              Clear all filters
            </button>
          )}
        </div>
      </details>

      {error ? <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-3xl bg-slate-200" />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white/70 p-10 text-center text-sm text-slate-500">
          {activeFilterCount > 0 ? 'No reports match the current filters.' : 'No reports yet.'}
        </div>
      ) : (
        <>
          <div className="grid gap-4">
            {reports.map((report) => (
              <ReportCard
                key={report.report_id}
                report={report}
                onMarkReunited={handleMarkReunited}
                onDeleteReport={handleDeleteReport}
                isUpdating={updatingId === report.report_id}
              />
            ))}
          </div>

          {hasMore && (
            <button
              type="button"
              disabled={isLoadingMore}
              onClick={() => loadPage(offsetRef.current, filters, true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
            >
              {isLoadingMore ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Loading...
                </>
              ) : (
                'Load more reports'
              )}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function FilterField({ label, children }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}
