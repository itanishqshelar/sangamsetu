import { Suspense, lazy, useState } from 'react';
import IntakeForm from './components/IntakeForm';
import ReportsList from './components/ReportsList';
import { useCenter } from './context/CenterContext';
import OperationsMap from './components/OperationsMap';
import { useOperationsData } from './hooks/useOperationsData';

const OperationsDashboard = lazy(() => import('./components/OperationsDashboard'));

const tabs = [
  { id: 'new-report', label: 'New report' },
  { id: 'all-reports', label: 'All reports' },
  { id: 'operations', label: 'Operations' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('new-report');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const { centers, selectedCenter, setSelectedCenter, isLoading, error } = useCenter();
  const operationsData = useOperationsData();

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-100 text-slate-900">
      {/* Navbar */}
      <header className="z-10 flex h-16 shrink-0 items-center justify-between border-b border-white/60 bg-slate-900 px-4 shadow-sm md:px-6">
        <div className="flex items-center gap-3 md:gap-4">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white transition hover:bg-white/20"
            aria-label="Toggle sidebar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-white md:text-xl">SangamSetu</h1>

        </div>

        <div className="flex items-center gap-4">
          {error ? <span className="hidden text-sm text-rose-400 md:block">{error}</span> : null}
          <label className="flex items-center gap-3">
            <span className="hidden text-sm font-medium text-slate-300 md:block">Reporting as</span>
            <select
              value={selectedCenter}
              onChange={(event) => setSelectedCenter(event.target.value)}
              disabled={isLoading || !centers.length}
              className="rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-sm text-white outline-none transition focus:border-saffron"
            >
              {!centers.length ? <option value="">Loading...</option> : null}
              {centers.map((center) => (
                <option key={center} value={center} className="text-slate-900">
                  {center}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {/* Main Area */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`z-10 flex shrink-0 flex-col border-r border-slate-200 bg-white/95 shadow-[4px_0_24px_rgba(0,0,0,0.05)] backdrop-blur-md transition-all duration-300 ease-in-out ${
            isSidebarOpen ? 'w-full md:w-[28rem]' : 'w-0 overflow-hidden border-none'
          }`}
        >
          <div className="flex shrink-0 gap-2 border-b border-slate-100 p-4 min-w-[28rem]">
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    active
                      ? 'bg-slate-900 text-white shadow-card'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {activeTab === 'new-report' ? <IntakeForm /> : null}
            {activeTab === 'all-reports' ? <ReportsList /> : null}
            {activeTab === 'operations' ? (
              <Suspense
                fallback={
                  <div className="p-4 text-sm text-slate-500">Loading operations dashboard...</div>
                }
              >
                <OperationsDashboard data={operationsData} />
              </Suspense>
            ) : null}
          </div>
        </aside>

        {/* Map Container */}
        <main className="relative flex-1 bg-slate-50">
          <OperationsMap
            zones={operationsData.zones}
            chokepoints={operationsData.chokepoints}
            cctvLocations={operationsData.cctvLocations}
            policeStations={operationsData.policeStations}
            reports={operationsData.reports}
            locationLookup={operationsData.locationLookup}
            centerLookup={operationsData.centerLookup}
          />
        </main>
      </div>
    </div>
  );
}
