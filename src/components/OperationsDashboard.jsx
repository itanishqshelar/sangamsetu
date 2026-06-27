const datasetLabels = {
  zones: 'Zone boundaries',
  cctv_locations: 'CCTV locations',
  police_stations: 'Police stations',
  chokepoints_parking: 'Chokepoints & parking',
};

export default function OperationsDashboard({ data }) {
  const { summary, datasets, matches, zones, error, isLoading, refresh } = data || {};

  if (isLoading) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">Loading Phase 2 operations data...</p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Operations view</h2>
            <p className="text-sm text-slate-600">
              Phase 2 starter: imported geography datasets, report volume, and suggestions.
            </p>
          </div>

          <button
            type="button"
            onClick={refresh}
            className="self-start rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
          >
            Refresh imported data
          </button>
        </div>

        {error ? <p className="mb-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

        {summary ? (
          <div className="grid grid-cols-2 gap-3">
            <MetricCard label="Total reports" value={summary.total_reports} />
            <MetricCard label="Missing" value={summary.missing_reports} />
            <MetricCard label="Found" value={summary.found_reports} />
            <MetricCard label="Pending" value={summary.pending_reports} />
            <MetricCard label="Reunited" value={summary.reunited_reports} className="col-span-2" />
          </div>
        ) : null}
      </div>

      <div className="space-y-6">
        <Panel title="Imported reference datasets">
          <div className="grid gap-2">
            {(datasets || []).map((dataset) => (
              <div
                key={dataset.dataset_name}
                className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5"
              >
                <span className="text-sm font-medium text-slate-700">
                  {datasetLabels[dataset.dataset_name] || dataset.dataset_name}
                </span>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-900 shadow-sm">
                  {dataset.row_count}
                </span>
              </div>
            ))}
            {!(datasets || []).length ? <EmptyText text="Import Phase 2 CSV tables to populate." /> : null}
          </div>
        </Panel>

        <Panel title="Possible matches">
          <div className="space-y-3">
            {(matches || []).map((match) => (
              <article key={`${match.missing_report_id}-${match.found_report_id}`} className="rounded-xl border border-slate-100 p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-900">
                    Missing
                  </span>
                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-900">
                    Found
                  </span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase text-slate-700">
                    {Number(match.time_gap_hours).toFixed(1)}h apart
                  </span>
                </div>
                <h3 className="mt-2 text-sm font-semibold text-slate-900">
                  {match.missing_name || 'Unnamed'} {'->'} {match.found_name || 'Unnamed'}
                </h3>
                <p className="mt-1 text-xs text-slate-600">
                  {match.gender} | {match.age_band} | {match.match_reason}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Missing: {match.missing_last_seen_location || 'Unknown'} | Found: {match.found_last_seen_location || 'Unknown'}
                </p>
              </article>
            ))}
            {!(matches || []).length ? (
              <EmptyText text="No candidate matches yet." />
            ) : null}
          </div>
        </Panel>

        <Panel title="Zone sample">
          <div className="space-y-2">
            {(zones || []).map((zone) => (
              <div key={zone.zone_name} className="rounded-xl border border-slate-100 p-3">
                <p className="text-sm font-medium text-slate-900">{zone.zone_name}</p>
                <p className="text-xs text-slate-600">
                  {zone.centroid_lat}, {zone.centroid_lng}
                </p>
              </div>
            ))}
            {!(zones || []).length ? <EmptyText text="No zone data imported yet." /> : null}
          </div>
        </Panel>
      </div>
    </section>
  );
}

function MetricCard({ label, value, className = '' }) {
  return (
    <div className={`rounded-xl border border-slate-100 bg-slate-50 p-3 ${className}`}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{value ?? 0}</p>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-base font-semibold text-slate-900">{title}</h3>
      {children}
    </div>
  );
}

function EmptyText({ text }) {
  return <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">{text}</p>;
}
