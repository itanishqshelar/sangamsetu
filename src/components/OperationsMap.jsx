import { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';

const defaultLayers = {
  missing: true,
  found: true,
  police: true,
  chokepoints: true,
  zones: true,
  cctv: false,
};

const layerConfig = {
  missing: { label: 'Missing Person', layerId: 'reports-missing-layer', color: '#ef4444', radius: 8, hasHalo: true },
  found: { label: 'Found Person', layerId: 'reports-found-layer', color: '#10b981', radius: 6, hasHalo: false },
  police: { label: 'Police Station', layerId: 'police-layer', color: '#3b82f6', radius: 7, hasHalo: true },
  chokepoints: { label: 'Chokepoint', layerId: 'chokepoints-layer', color: '#f97316', radius: 6, hasHalo: false },
  zones: { label: 'Zone Boundary', layerId: 'zones-layer', color: '#0f766e', radius: 9, hasHalo: false },
  cctv: { label: 'CCTV Camera', layerId: 'cctv-layer', color: '#64748b', radius: 4, hasHalo: false },
};

const nashikCenter = [73.7898, 19.9975];

function toFeatureCollection(features) {
  return {
    type: 'FeatureCollection',
    features,
  };
}

function isValidCoordinate(lng, lat) {
  return Number.isFinite(lng) && Number.isFinite(lat);
}

function getReportCoordinate(report, locationIndex, centerIndex) {
  const location = locationIndex.get(report.last_seen_location);
  if (location && isValidCoordinate(location.lng, location.lat)) {
    return [location.lng, location.lat];
  }

  const center = centerIndex.get(report.reporting_center);
  if (center && isValidCoordinate(center.lng, center.lat)) {
    return [center.lng, center.lat];
  }

  return null;
}

export default function OperationsMap({
  zones,
  chokepoints,
  cctvLocations,
  policeStations,
  reports,
  locationLookup,
  centerLookup,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const popupRef = useRef(null);
  const [enabledLayers, setEnabledLayers] = useState(defaultLayers);
  const [isLegendExpanded, setIsLegendExpanded] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);

  const mapboxToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

  const zoneFeatures = useMemo(
    () =>
      (zones ?? [])
        .filter((zone) => isValidCoordinate(zone.centroid_lng, zone.centroid_lat))
        .map((zone) => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [zone.centroid_lng, zone.centroid_lat],
          },
          properties: {
            title: zone.zone_name,
            subtitle: `Approx boundary points: ${zone.approx_boundary_points ?? 0}`,
            dataset: 'zones',
          },
        })),
    [zones],
  );

  const chokepointFeatures = useMemo(
    () =>
      (chokepoints ?? [])
        .filter((item) => isValidCoordinate(item.longitude, item.latitude))
        .map((item) => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [item.longitude, item.latitude],
          },
          properties: {
            title: item.location_name,
            subtitle: item.category || 'Chokepoint',
            dataset: 'chokepoints',
          },
        })),
    [chokepoints],
  );

  const cctvFeatures = useMemo(
    () =>
      (cctvLocations ?? [])
        .filter((item) => isValidCoordinate(item.longitude, item.latitude))
        .map((item) => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [item.longitude, item.latitude],
          },
          properties: {
            title: item.camera_id,
            subtitle: 'CCTV camera',
            dataset: 'cctv',
          },
        })),
    [cctvLocations],
  );

  const policeFeatures = useMemo(
    () =>
      (policeStations ?? [])
        .filter((item) => isValidCoordinate(item.longitude, item.latitude))
        .map((item) => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [item.longitude, item.latitude],
          },
          properties: {
            title: item.station_name,
            subtitle: 'Police station',
            dataset: 'police',
          },
        })),
    [policeStations],
  );

  const reportFeatures = useMemo(() => {
    const locationIndex = new Map(
      (locationLookup ?? []).map((item) => [item.location_name, { lat: item.lat, lng: item.lng }]),
    );
    const centerIndex = new Map(
      (centerLookup ?? []).map((item) => [item.center_name, { lat: item.lat, lng: item.lng }]),
    );

    return (reports ?? [])
      .map((report) => {
        const coordinates = getReportCoordinate(report, locationIndex, centerIndex);
        if (!coordinates) {
          return null;
        }

        return {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates,
          },
          properties: {
            title: report.name || 'Unnamed report',
            subtitle: `${report.report_type} | ${report.status}`,
            dataset: 'reports',
            reportType: report.report_type,
            status: report.status,
            lastSeenLocation: report.last_seen_location || 'Unknown',
            reportingCenter: report.reporting_center || 'Unknown',
          },
        };
      })
      .filter(Boolean);
  }, [reports, locationLookup, centerLookup]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !mapboxToken) {
      return undefined;
    }

    mapboxgl.accessToken = mapboxToken;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/standard',
      center: nashikCenter,
      zoom: 11.2,
      pitch: 24,
    });

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.on('load', () => {
      // Initialize sources with empty data
      map.addSource('zones-source', { type: 'geojson', data: toFeatureCollection([]) });
      map.addSource('chokepoints-source', { type: 'geojson', data: toFeatureCollection([]) });
      map.addSource('cctv-source', { type: 'geojson', data: toFeatureCollection([]) });
      map.addSource('police-source', { type: 'geojson', data: toFeatureCollection([]) });
      map.addSource('reports-source', { type: 'geojson', data: toFeatureCollection([]) });

      // 1. Zones
      map.addLayer({
        id: layerConfig.zones.layerId,
        type: 'circle',
        source: 'zones-source',
        paint: {
          'circle-radius': layerConfig.zones.radius,
          'circle-color': layerConfig.zones.color,
          'circle-opacity': 0.55,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });

      // 2. CCTV
      map.addLayer({
        id: layerConfig.cctv.layerId,
        type: 'circle',
        source: 'cctv-source',
        paint: {
          'circle-radius': layerConfig.cctv.radius,
          'circle-color': layerConfig.cctv.color,
          'circle-opacity': 0.6,
        },
      });

      // 3. Chokepoints
      map.addLayer({
        id: layerConfig.chokepoints.layerId,
        type: 'circle',
        source: 'chokepoints-source',
        paint: {
          'circle-radius': layerConfig.chokepoints.radius,
          'circle-color': layerConfig.chokepoints.color,
          'circle-opacity': 0.8,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#ffffff',
        },
      });

      // 4. Police (with halo)
      map.addLayer({
        id: 'police-halo',
        type: 'circle',
        source: 'police-source',
        paint: {
          'circle-radius': layerConfig.police.radius + 6,
          'circle-color': layerConfig.police.color,
          'circle-opacity': 0.25,
          'circle-blur': 0.5,
        },
      });
      map.addLayer({
        id: layerConfig.police.layerId,
        type: 'circle',
        source: 'police-source',
        paint: {
          'circle-radius': layerConfig.police.radius,
          'circle-color': layerConfig.police.color,
          'circle-opacity': 0.9,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
        },
      });

      // 5. Reports (Found)
      map.addLayer({
        id: layerConfig.found.layerId,
        type: 'circle',
        source: 'reports-source',
        filter: ['==', ['get', 'reportType'], 'found'],
        paint: {
          'circle-radius': layerConfig.found.radius,
          'circle-color': layerConfig.found.color,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.9,
        },
      });

      // 6. Reports (Missing - with glowing halo)
      map.addLayer({
        id: 'reports-missing-halo',
        type: 'circle',
        source: 'reports-source',
        filter: ['==', ['get', 'reportType'], 'missing'],
        paint: {
          'circle-radius': layerConfig.missing.radius + 8,
          'circle-color': layerConfig.missing.color,
          'circle-opacity': 0.35,
          'circle-blur': 0.6,
        },
      });
      map.addLayer({
        id: layerConfig.missing.layerId,
        type: 'circle',
        source: 'reports-source',
        filter: ['==', ['get', 'reportType'], 'missing'],
        paint: {
          'circle-radius': layerConfig.missing.radius,
          'circle-color': layerConfig.missing.color,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 1,
        },
      });

      Object.values(layerConfig).forEach((config) => {
        bindPopup(map, config.layerId, popupRef);
      });

      setMapLoaded(true);
    });

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    
    resizeObserver.observe(containerRef.current);

    mapRef.current = map;

    return () => {
      resizeObserver.disconnect();
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, [mapboxToken]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) {
      return;
    }

    addOrUpdateSource(map, 'zones-source', toFeatureCollection(zoneFeatures));
    addOrUpdateSource(map, 'chokepoints-source', toFeatureCollection(chokepointFeatures));
    addOrUpdateSource(map, 'cctv-source', toFeatureCollection(cctvFeatures));
    addOrUpdateSource(map, 'police-source', toFeatureCollection(policeFeatures));
    addOrUpdateSource(map, 'reports-source', toFeatureCollection(reportFeatures));
  }, [mapLoaded, zoneFeatures, chokepointFeatures, cctvFeatures, policeFeatures, reportFeatures]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) {
      return;
    }

    Object.entries(enabledLayers).forEach(([key, isVisible]) => {
      const layerId = layerConfig[key]?.layerId;
      if (layerId && map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', isVisible ? 'visible' : 'none');
      }

      // Handle halos
      if (key === 'police' && map.getLayer('police-halo')) {
        map.setLayoutProperty('police-halo', 'visibility', isVisible ? 'visible' : 'none');
      }
      if (key === 'missing' && map.getLayer('reports-missing-halo')) {
        map.setLayoutProperty('reports-missing-halo', 'visibility', isVisible ? 'visible' : 'none');
      }
    });
  }, [mapLoaded, enabledLayers]);

  if (!mapboxToken) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-slate-100 p-6 text-center">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Map unavailable</h3>
          <p className="mt-2 text-sm text-slate-600">
            Add <code>VITE_MAPBOX_ACCESS_TOKEN</code> to your <code>.env</code> to enable the Phase 2 map.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div ref={containerRef} className="h-full w-full bg-slate-100" />
      
      {/* Interactive Legend */}
      <div className="absolute left-6 top-6 z-10 w-64">
        <div className="flex flex-col overflow-hidden rounded-2xl border border-white/60 bg-white/95 shadow-card backdrop-blur-md transition-all">
          <button
            type="button"
            onClick={() => setIsLegendExpanded(!isLegendExpanded)}
            className="flex items-center justify-between bg-slate-900 px-4 py-3 text-left text-white"
          >
            <span className="text-sm font-semibold tracking-wide">Map Legend</span>
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              viewBox="0 0 20 20" 
              fill="currentColor" 
              className={`h-5 w-5 transition-transform duration-300 ${isLegendExpanded ? 'rotate-180' : ''}`}
            >
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </button>

          {isLegendExpanded && (
            <div className="flex flex-col gap-1 p-3">
              {Object.entries(layerConfig).map(([key, config]) => (
                <label
                  key={key}
                  className="group flex cursor-pointer items-center justify-between rounded-lg px-2 py-2 transition hover:bg-slate-100"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative flex h-5 w-5 items-center justify-center">
                      {config.hasHalo && (
                        <div 
                          className="absolute h-full w-full rounded-full opacity-30 blur-[2px]" 
                          style={{ backgroundColor: config.color }} 
                        />
                      )}
                      <div
                        className="relative rounded-full border-2 border-white shadow-sm"
                        style={{
                          backgroundColor: config.color,
                          width: `${config.radius * 2}px`,
                          height: `${config.radius * 2}px`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium text-slate-700">{config.label}</span>
                  </div>
                  
                  <div className="relative inline-flex items-center">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={enabledLayers[key]}
                      onChange={() =>
                        setEnabledLayers((current) => ({
                          ...current,
                          [key]: !current[key],
                        }))
                      }
                    />
                    <div className="h-5 w-9 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-saffron peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none"></div>
                  </div>
                </label>
              ))}

              {reportFeatures.length === 0 ? (
                <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Report markers need coordinates in lookups to appear.
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function addOrUpdateSource(map, sourceId, data) {
  const existing = map.getSource(sourceId);
  if (existing) {
    existing.setData(data);
    return;
  }

  map.addSource(sourceId, {
    type: 'geojson',
    data,
  });
}

function bindPopup(map, layerId, popupRef) {
  map.on('click', layerId, (event) => {
    const feature = event.features?.[0];
    if (!feature) {
      return;
    }

    popupRef.current?.remove();

    const coordinates = feature.geometry.coordinates.slice();
    const properties = feature.properties ?? {};
    const content = `
      <div style="min-width: 180px; font-family: Segoe UI, sans-serif;">
        <strong>${properties.title ?? 'Unknown'}</strong>
        <div style="margin-top: 6px; color: #475569;">${properties.subtitle ?? ''}</div>
        ${
          properties.lastSeenLocation
            ? `<div style="margin-top: 8px; color: #334155;">Last seen: ${properties.lastSeenLocation}</div>`
            : ''
        }
        ${
          properties.reportingCenter
            ? `<div style="margin-top: 4px; color: #334155;">Center: ${properties.reportingCenter}</div>`
            : ''
        }
      </div>
    `;

    popupRef.current = new mapboxgl.Popup({ offset: 14 }).setLngLat(coordinates).setHTML(content).addTo(map);
  });

  map.on('mouseenter', layerId, () => {
    map.getCanvas().style.cursor = 'pointer';
  });

  map.on('mouseleave', layerId, () => {
    map.getCanvas().style.cursor = '';
  });
}
