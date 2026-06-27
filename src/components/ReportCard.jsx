import { useState } from 'react';

function formatRelativeTime(timestamp) {
  if (!timestamp) {
    return 'Unknown time';
  }

  const diffMs = Date.now() - new Date(timestamp).getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function maskMobile(mobile) {
  if (!mobile) {
    return 'Not provided';
  }

  const digits = mobile.replace(/\D/g, '');
  const lastFour = digits.slice(-4);
  return lastFour ? `****${lastFour}` : 'Not provided';
}

export default function ReportCard({ report, onMarkReunited, onDeleteReport, isUpdating }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const isMissing = report.report_type === 'missing';
  const typeClasses = isMissing
    ? 'bg-amber-100 text-amber-900 border-amber-200'
    : 'bg-emerald-100 text-emerald-900 border-emerald-200';
  const statusClasses =
    report.status === 'Reunited'
      ? 'bg-emerald-100 text-emerald-800'
      : report.status === 'Pending'
        ? 'bg-slate-100 text-slate-700'
        : 'bg-sky-100 text-sky-800';

  return (
    <article className="rounded-3xl border border-white/70 bg-white/95 p-5 shadow-card">
      <button
        type="button"
        onClick={() => setIsExpanded((current) => !current)}
        className="w-full text-left"
      >
        <div className="flex gap-4">
          {/* Photo thumbnail */}
          {report.photo_url ? (
            <img
              src={report.photo_url}
              alt={report.name || 'Report photo'}
              className="h-16 w-16 shrink-0 rounded-2xl border border-slate-200 object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-slate-300">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
          )}

          {/* Card content */}
          <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${typeClasses}`}>
                  {isMissing ? 'Missing' : 'Found'}
                </span>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusClasses}`}>
                  {report.status}
                </span>
                {report.face_embedding && (
                  <span className="flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-700">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.121-1.121A2 2 0 0011.172 3H8.828a2 2 0 00-1.414.586L6.293 4.707A1 1 0 015.586 5H4zm6 9a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                    </svg>
                    Face data
                  </span>
                )}
                <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                  {formatRelativeTime(report.reported_at || report.created_at)}
                </span>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-900">{report.name || 'Unnamed'}</h3>
                <p className="text-sm text-slate-600">
                  {report.gender || 'Unknown'} | {report.age_band || 'Unknown age band'}
                </p>
              </div>
            </div>

            <div className="space-y-1 text-sm text-slate-600 md:text-right">
              <p>
                <span className="font-medium text-slate-900">Last seen:</span> {report.last_seen_location || 'Unknown'}
              </p>
              <p>
                <span className="font-medium text-slate-900">Logged at:</span> {report.reporting_center || 'Unknown'}
              </p>
              <p>
                <span className="font-medium text-slate-900">Reporter:</span> {maskMobile(report.reporter_mobile)}
              </p>
            </div>
          </div>
        </div>
      </button>

      {isExpanded ? (
        <div className="mt-5 space-y-4 border-t border-slate-100 pt-4 text-sm text-slate-700">
          {report.photo_url && (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Photo</p>
              <img
                src={report.photo_url}
                alt={report.name || 'Report photo'}
                className="max-h-48 rounded-2xl border border-slate-200 object-contain"
              />
            </div>
          )}
          <Detail label="Full reporter mobile" value={report.reporter_mobile || 'Not provided'} />
          <Detail label="Language" value={report.language || 'Not provided'} />
          <Detail label="Physical description" value={report.physical_description || 'Not provided'} />
          <Detail label="Remarks" value={report.remarks || 'Not provided'} />

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              disabled={report.status === 'Reunited' || isUpdating || isDeleting}
              onClick={() => onMarkReunited(report.report_id)}
              className="rounded-2xl bg-saffron px-4 py-2 text-sm font-semibold text-white transition hover:bg-saffron/90 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {report.status === 'Reunited'
                ? 'Already reunited'
                : isUpdating
                  ? 'Updating...'
                  : 'Mark as Reunited'}
            </button>

            {!confirmDelete ? (
              <button
                type="button"
                disabled={isUpdating || isDeleting}
                onClick={() => setConfirmDelete(true)}
                className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Delete
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={async () => {
                    setIsDeleting(true);
                    await onDeleteReport(report.report_id, report.photo_url);
                    setIsDeleting(false);
                    setConfirmDelete(false);
                  }}
                  className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-wait disabled:opacity-60"
                >
                  {isDeleting ? 'Deleting...' : 'Confirm delete'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function Detail({ label, value }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="leading-6 text-slate-700">{value}</p>
    </div>
  );
}
