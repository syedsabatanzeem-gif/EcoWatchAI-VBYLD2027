import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import { Reading, ThresholdConfig } from '../types.ts';
import { INDIAN_RIVERS, IndianRiverPath } from '../data/indianRiverPaths.ts';
import {
  Compass,
  Search,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  Eye,
  Activity,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Calendar,
  Layers,
  X,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  Waves,
  Droplets,
  Filter,
} from 'lucide-react';

interface StationMarkerData {
  id: string;
  stationCode: string;
  name: string;
  river: string;
  state: string;
  district?: string;
  basin?: string;
  latitude: number;
  longitude: number;
  latestReading: Reading;
  allReadings: Reading[];
  isFlagged: boolean;
  status: Reading['status'];
  cpcbClass: string;
  flagReasons: string[];
  source: string;
  sampleDate: string;
}

interface WaterPurityMapProps {
  readings: Reading[];
  thresholds?: ThresholdConfig;
  onSelectReading: (reading: Reading) => void;
  onNavigateToTrends?: (location: string) => void;
  onOpenUpload?: () => void;
  onOpenCommunityReport?: () => void;
}

interface MapAction {
  id: number;
  type: 'india' | 'flyTo' | 'fitBounds';
  center?: [number, number];
  zoom?: number;
  bounds?: [[number, number], [number, number]];
}

// India Geographic Bounding Envelope
const INDIA_BOUNDS: [[number, number], [number, number]] = [
  [8.0, 68.0],
  [35.5, 96.5],
];
const INDIA_CENTER: [number, number] = [22.5, 79.5];

// Map Controller for safe, non-looping programmatic movements and viewport monitoring
function MapViewController({
  action,
  verifiedStations,
  onVisibleCountChange,
}: {
  action: MapAction | null;
  verifiedStations: StationMarkerData[];
  onVisibleCountChange: (count: number, centerLat: number, centerLng: number) => void;
}) {
  const map = useMap();
  const lastActionIdRef = useRef<number | null>(null);
  const onVisibleCountChangeRef = useRef(onVisibleCountChange);
  onVisibleCountChangeRef.current = onVisibleCountChange;

  const verifiedStationsRef = useRef(verifiedStations);
  verifiedStationsRef.current = verifiedStations;

  // Execute one-time map navigation actions safely
  useEffect(() => {
    if (!action || action.id === lastActionIdRef.current) return;
    lastActionIdRef.current = action.id;

    if (action.type === 'india') {
      map.flyToBounds(INDIA_BOUNDS, { padding: [20, 20], duration: 1.2 });
    } else if (action.type === 'fitBounds' && action.bounds) {
      map.flyToBounds(action.bounds, {
        padding: [40, 40],
        maxZoom: 12,
        duration: 1.2,
      });
    } else if (action.type === 'flyTo' && action.center && action.zoom !== undefined) {
      map.flyTo(action.center, action.zoom, { duration: 1.2 });
    }
  }, [map, action]);

  // Update visible stations count ONLY when movement completely stops
  useMapEvents({
    moveend: () => {
      try {
        const bounds = map.getBounds();
        const center = map.getCenter();
        const stations = verifiedStationsRef.current;
        const count = stations.filter((st) =>
          bounds.contains(new L.LatLng(st.latitude, st.longitude))
        ).length;
        onVisibleCountChangeRef.current(count, center.lat, center.lng);
      } catch (e) {
        // Safe guard against unmounted map
      }
    },
  });

  return null;
}

// Zoom control overlay button component
function MapZoomButtons({ onZoomIn, onZoomOut }: { onZoomIn: () => void; onZoomOut: () => void }) {
  return (
    <div className="absolute top-4 left-4 z-[400] flex flex-col gap-1.5 shadow-md">
      <button
        onClick={onZoomIn}
        className="w-8 h-8 flex items-center justify-center bg-white hover:bg-slate-50 text-slate-700 hover:text-sky-800 rounded-lg border border-slate-200 transition-colors shadow-xs cursor-pointer active:scale-95"
        title="Zoom In"
        aria-label="Zoom In"
      >
        <ZoomIn className="w-4 h-4" />
      </button>
      <button
        onClick={onZoomOut}
        className="w-8 h-8 flex items-center justify-center bg-white hover:bg-slate-50 text-slate-700 hover:text-sky-800 rounded-lg border border-slate-200 transition-colors shadow-xs cursor-pointer active:scale-95"
        title="Zoom Out"
        aria-label="Zoom Out"
      >
        <ZoomOut className="w-4 h-4" />
      </button>
    </div>
  );
}

// Create custom distinct marker icons with neutral environmental status colors
function createStationIcon(isFlagged: boolean, isSelected: boolean, cpcbClass: string) {
  if (isFlagged) {
    // Records requiring verification: Neutral warm amber/ochre badge
    return L.divIcon({
      className: 'custom-station-marker',
      html: `
        <div class="relative flex items-center justify-center -translate-x-1/2 -translate-y-full cursor-pointer group">
          <span class="absolute w-7 h-7 -top-0.5 rounded-full bg-amber-500/20"></span>
          <div class="relative flex items-center justify-center w-6 h-6 rounded-full bg-amber-600 text-white shadow-md border-2 border-white ring-2 ring-amber-400/40 transition-transform duration-200 group-hover:scale-125 ${
            isSelected ? 'scale-125 ring-4 ring-amber-500 bg-amber-700' : ''
          }">
            <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
              <path d="M12 2L1 21h22L12 2zm0 3.99L19.53 19H4.47L12 5.99zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z"/>
            </svg>
          </div>
          <div class="w-1.5 h-1.5 bg-amber-600 rotate-45 -mt-0.5 border-r border-b border-white"></div>
        </div>
      `,
      iconSize: [26, 34],
      iconAnchor: [13, 34],
      popupAnchor: [0, -36],
    });
  }

  // Normal station: Neutral calming ocean blue / emerald depending on class
  const isClassA = cpcbClass === 'Class A';
  const bgColor = isClassA ? 'bg-emerald-600' : 'bg-sky-700';

  return L.divIcon({
    className: 'custom-station-marker',
    html: `
      <div class="relative flex items-center justify-center -translate-x-1/2 -translate-y-full cursor-pointer group">
        <div class="relative flex items-center justify-center w-6 h-6 rounded-full ${bgColor} text-white shadow-md border-2 border-white ring-2 ring-sky-300/40 transition-transform duration-200 group-hover:scale-125 ${
          isSelected ? 'scale-125 ring-4 ring-sky-500 bg-sky-900' : ''
        }">
          <svg class="w-3 h-3 fill-current" viewBox="0 0 24 24">
            <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
          </svg>
        </div>
        <div class="w-1.5 h-1.5 ${bgColor} rotate-45 -mt-0.5 border-r border-b border-white"></div>
      </div>
    `,
    iconSize: [24, 32],
    iconAnchor: [12, 32],
    popupAnchor: [0, -34],
  });
}

export const WaterPurityMap: React.FC<WaterPurityMapProps> = ({
  readings,
  thresholds,
  onSelectReading,
  onNavigateToTrends,
}) => {
  // Map Action Command State
  const [mapAction, setMapAction] = useState<MapAction | null>(null);

  // Selected station
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);

  // Selected river highlight
  const [selectedRiverId, setSelectedRiverId] = useState<string | null>(null);

  // Filter States
  const [selectedState, setSelectedState] = useState<string>('all');
  const [selectedRiverFilter, setSelectedRiverFilter] = useState<string>('all');
  const [selectedDistrict, setSelectedDistrict] = useState<string>('all');
  const [selectedStationFilter, setSelectedStationFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [selectedDateRange, setSelectedDateRange] = useState<string>('all');
  const [highlightParameter, setHighlightParameter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Catalog Pagination States
  const [catalogPage, setCatalogPage] = useState<number>(1);
  const catalogPageSize = 8;

  // Viewport tracking for empty-state detection
  const [visibleStationCount, setVisibleStationCount] = useState<number>(0);
  const [mapCenterCoords, setMapCenterCoords] = useState<{ lat: number; lng: number }>({
    lat: INDIA_CENTER[0],
    lng: INDIA_CENTER[1],
  });

  // Tile layer style selection
  const [tileStyle, setTileStyle] = useState<'osm' | 'terrain' | 'voyager'>('osm');

  // Map reference for zoom buttons
  const mapRef = useRef<L.Map | null>(null);

  // 1. Build verified Indian station list strictly from actual dataset latitude & longitude within India
  const verifiedStations = useMemo<StationMarkerData[]>(() => {
    const stationMap: Record<string, Reading[]> = {};
    readings.forEach((r) => {
      // Must have valid numeric coordinates strictly inside India
      if (
        typeof r.latitude === 'number' &&
        !isNaN(r.latitude) &&
        typeof r.longitude === 'number' &&
        !isNaN(r.longitude) &&
        r.latitude >= 6.5 &&
        r.latitude <= 37.5 &&
        r.longitude >= 68.0 &&
        r.longitude <= 97.5
      ) {
        if (!stationMap[r.location]) stationMap[r.location] = [];
        stationMap[r.location].push(r);
      }
    });

    return Object.entries(stationMap).map(([name, records]) => {
      const sorted = [...records].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      const latest = sorted[0];

      const isFlagged =
        latest.status === 'High Priority' ||
        latest.status === 'Needs Review' ||
        latest.status === 'Needs Further Investigation' ||
        Boolean(latest.anomaly_reasons && latest.anomaly_reasons.length > 0) ||
        latest.dissolved_oxygen < 5.0 ||
        latest.bod_mg_l > 3.0;

      const reasons = latest.anomaly_reasons || [];

      return {
        id: latest.station_id || latest.id,
        stationCode: latest.station_id || latest.id,
        name,
        river: latest.river || latest.water_body || 'Ganga River',
        state: latest.state || 'National Reach',
        district: latest.district,
        basin: latest.basin || latest.main_basin,
        latitude: latest.latitude,
        longitude: latest.longitude,
        latestReading: latest,
        allReadings: records,
        isFlagged,
        status: latest.status,
        cpcbClass: latest.cpcb_class || 'Class B',
        flagReasons: reasons,
        source: latest.source || 'Central Pollution Control Board (CPCB) - NWMP / Ministry of Jal Shakti',
        sampleDate: latest.timestamp,
      };
    });
  }, [readings]);

  // Extract unique Indian states, rivers, and districts available in data
  const availableStates = useMemo(() => {
    return Array.from(new Set(verifiedStations.map((s) => s.state).filter(Boolean))).sort();
  }, [verifiedStations]);

  const availableRivers = useMemo(() => {
    return Array.from(new Set(verifiedStations.map((s) => s.river).filter(Boolean))).sort();
  }, [verifiedStations]);

  const availableDistricts = useMemo(() => {
    return Array.from(
      new Set(
        verifiedStations
          .filter((s) => selectedState === 'all' || s.state.toLowerCase() === selectedState.toLowerCase())
          .map((s) => s.district)
          .filter((d): d is string => Boolean(d))
      )
    ).sort();
  }, [verifiedStations, selectedState]);

  // Filtered stations based on active state, river, district, station, date range, parameter, and search query
  const filteredStations = useMemo(() => {
    return verifiedStations.filter((s) => {
      if (selectedState !== 'all' && s.state.toLowerCase() !== selectedState.toLowerCase()) {
        return false;
      }
      if (selectedRiverFilter !== 'all' && s.river.toLowerCase() !== selectedRiverFilter.toLowerCase()) {
        return false;
      }
      if (selectedDistrict !== 'all' && (!s.district || s.district.toLowerCase() !== selectedDistrict.toLowerCase())) {
        return false;
      }
      if (selectedStationFilter !== 'all' && s.id !== selectedStationFilter) {
        return false;
      }
      if (selectedRiverId) {
        const activeRiver = INDIAN_RIVERS.find((r) => r.id === selectedRiverId);
        if (activeRiver && !s.river.toLowerCase().includes(activeRiver.name.toLowerCase().split(' ')[0])) {
          return false;
        }
      }
      if (selectedDateRange !== 'all') {
        if (selectedDateRange === '2026' && !s.sampleDate.startsWith('2026')) return false;
        if (selectedDateRange === '2025' && !s.sampleDate.startsWith('2025')) return false;
      }
      if (highlightParameter !== 'all') {
        if (highlightParameter === 'do_below_5' && s.latestReading.dissolved_oxygen >= 5.0) return false;
        if (highlightParameter === 'bod_above_3' && s.latestReading.bod_mg_l <= 3.0) return false;
        if (highlightParameter === 'ph_abnormal' && (s.latestReading.ph >= 6.5 && s.latestReading.ph <= 8.5)) return false;
        if (highlightParameter === 'has_cod' && (s.latestReading.cod_mg_l === undefined || s.latestReading.cod_mg_l === null)) return false;
        if (highlightParameter === 'has_turbidity' && (s.latestReading.turbidity === undefined || s.latestReading.turbidity === null)) return false;
        if (highlightParameter === 'has_nitrate' && (s.latestReading.nitrate_mg_l === undefined || s.latestReading.nitrate_mg_l === null)) return false;
      }
      if (selectedStatusFilter !== 'all') {
        if (selectedStatusFilter === 'flagged' && !s.isFlagged) return false;
        if (selectedStatusFilter === 'normal' && s.isFlagged) return false;
        if (selectedStatusFilter.startsWith('class-') && s.cpcbClass.toLowerCase() !== selectedStatusFilter.replace('class-', 'class ')) {
          return false;
        }
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesName = s.name.toLowerCase().includes(q);
        const matchesCode = s.stationCode.toLowerCase().includes(q);
        const matchesRiver = s.river.toLowerCase().includes(q);
        const matchesState = s.state.toLowerCase().includes(q);
        const matchesDistrict = (s.district || '').toLowerCase().includes(q);
        if (!matchesName && !matchesCode && !matchesRiver && !matchesState && !matchesDistrict) {
          return false;
        }
      }
      return true;
    });
  }, [
    verifiedStations,
    selectedState,
    selectedRiverFilter,
    selectedDistrict,
    selectedStationFilter,
    selectedRiverId,
    selectedDateRange,
    highlightParameter,
    selectedStatusFilter,
    searchQuery,
  ]);

  // Selected station object
  const activeStation = useMemo(() => {
    return verifiedStations.find((s) => s.id === selectedStationId) || null;
  }, [verifiedStations, selectedStationId]);

  // Selected river object from paths
  const activeRiverPath = useMemo(() => {
    return INDIAN_RIVERS.find((r) => r.id === selectedRiverId) || null;
  }, [selectedRiverId]);

  // Catalog pagination
  const catalogTotalPages = Math.max(1, Math.ceil(filteredStations.length / catalogPageSize));
  const paginatedCatalogStations = useMemo(() => {
    const start = (catalogPage - 1) * catalogPageSize;
    return filteredStations.slice(start, start + catalogPageSize);
  }, [filteredStations, catalogPage, catalogPageSize]);

  // Safe viewport change handler
  const handleVisibleCountChange = useCallback(
    (count: number, centerLat: number, centerLng: number) => {
      setVisibleStationCount((prev) => (prev !== count ? count : prev));
      setMapCenterCoords((prev) => {
        if (Math.abs(prev.lat - centerLat) > 0.05 || Math.abs(prev.lng - centerLng) > 0.05) {
          return { lat: centerLat, lng: centerLng };
        }
        return prev;
      });
    },
    []
  );

  // Zoom handlers
  const handleZoomIn = () => {
    if (mapRef.current) {
      mapRef.current.zoomIn();
    }
  };

  const handleZoomOut = () => {
    if (mapRef.current) {
      mapRef.current.zoomOut();
    }
  };

  // Reset to India
  const handleResetToIndia = () => {
    setSelectedState('all');
    setSelectedRiverFilter('all');
    setSelectedRiverId(null);
    setSelectedDistrict('all');
    setSelectedStationFilter('all');
    setSelectedStatusFilter('all');
    setSelectedDateRange('all');
    setHighlightParameter('all');
    setSearchQuery('');
    setSelectedStationId(null);
    setCatalogPage(1);
    setMapAction({
      id: Date.now(),
      type: 'india',
    });
  };

  // Zoom to specific river
  const handleSelectRiver = (river: IndianRiverPath) => {
    if (selectedRiverId === river.id) {
      setSelectedRiverId(null);
      setSelectedRiverFilter('all');
    } else {
      setSelectedRiverId(river.id);
      setSelectedRiverFilter(river.name);
      // Fit bounds of this river
      const lats = river.coordinates.map((c) => c[0]);
      const lngs = river.coordinates.map((c) => c[1]);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);

      setMapAction({
        id: Date.now(),
        type: 'fitBounds',
        bounds: [
          [minLat - 0.2, minLng - 0.2],
          [maxLat + 0.2, maxLng + 0.2],
        ],
      });
    }
  };

  // Zoom to specific station
  const handleLocateStation = (station: StationMarkerData) => {
    setSelectedStationId(station.id);
    setMapAction({
      id: Date.now(),
      type: 'flyTo',
      center: [station.latitude, station.longitude],
      zoom: 12,
    });
  };

  // Format date helper
  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-IN', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Header & Controls */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-orange-100 text-orange-800 border border-orange-200">
                National Geographic Scope: India Only
              </span>
              <span className="text-slate-300">·</span>
              <span className="text-xs text-slate-500 font-mono">CPCB - NWMP Stations</span>
            </div>
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight mt-1 flex items-center gap-2">
              <Waves className="w-5 h-5 text-sky-700" />
              <span>Indian Rivers Water Quality Telemetry Map</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Interactive GIS telemetry network monitoring the Ganga, Yamuna, Godavari, Krishna, Cauvery, Narmada, and major Indian river basins.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleResetToIndia}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg shadow-2xs transition-colors cursor-pointer"
              title="Reset view to whole of India"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>Reset to India</span>
            </button>

            {/* Tile Style Selector */}
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs">
              <button
                onClick={() => setTileStyle('osm')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer font-medium ${
                  tileStyle === 'osm' ? 'bg-white shadow-2xs text-sky-900 font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Standard
              </button>
              <button
                onClick={() => setTileStyle('terrain')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer font-medium ${
                  tileStyle === 'terrain' ? 'bg-white shadow-2xs text-sky-900 font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Terrain
              </button>
              <button
                onClick={() => setTileStyle('voyager')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer font-medium ${
                  tileStyle === 'voyager' ? 'bg-white shadow-2xs text-sky-900 font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Voyager
              </button>
            </div>
          </div>
        </div>

        {/* 2. Interactive River Fast-Selection Badges */}
        <div className="pt-2 border-t border-slate-100 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-700 flex items-center gap-1.5">
              <Droplets className="w-3.5 h-3.5 text-sky-600" />
              <span>Select River to Trace Course:</span>
            </span>
            {selectedRiverId && (
              <button
                onClick={() => setSelectedRiverId(null)}
                className="text-xs text-sky-700 hover:text-sky-900 font-medium inline-flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3 h-3" />
                <span>Clear River Highlight</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
            {INDIAN_RIVERS.map((river) => {
              const isSelected = selectedRiverId === river.id;
              return (
                <button
                  key={river.id}
                  onClick={() => handleSelectRiver(river)}
                  className={`px-3 py-1 rounded-full text-xs shrink-0 transition-all font-medium border flex items-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-sky-900 text-white border-sky-900 shadow-xs'
                      : 'bg-slate-50 hover:bg-sky-50 text-slate-700 border-slate-200 hover:border-sky-300'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: river.color }}
                  ></span>
                  <span>{river.name.replace(' River', '')}</span>
                  <span className="text-[10px] opacity-75 font-mono">{river.lengthKm} km</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Multi-Criteria Filters Bar (State, River, District, Station, Date Range, Parameter) */}
        <div className="space-y-2.5 pt-2 border-t border-slate-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search station name, city, river..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCatalogPage(1);
                }}
                className="w-full text-xs pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>

            {/* State Filter */}
            <div>
              <select
                value={selectedState}
                onChange={(e) => {
                  setSelectedState(e.target.value);
                  setSelectedDistrict('all');
                  setCatalogPage(1);
                }}
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-sky-500 truncate"
              >
                <option value="all">All States of India ({availableStates.length})</option>
                {availableStates.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            {/* River Filter */}
            <div>
              <select
                value={selectedRiverFilter}
                onChange={(e) => {
                  setSelectedRiverFilter(e.target.value);
                  setCatalogPage(1);
                }}
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-sky-500 truncate"
              >
                <option value="all">All Indian Rivers ({availableRivers.length})</option>
                {availableRivers.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {/* District Filter */}
            <div>
              <select
                value={selectedDistrict}
                onChange={(e) => {
                  setSelectedDistrict(e.target.value);
                  setCatalogPage(1);
                }}
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-sky-500 truncate"
              >
                <option value="all">
                  {selectedState === 'all'
                    ? `All Districts (${availableDistricts.length})`
                    : `All Districts in ${selectedState} (${availableDistricts.length})`}
                </option>
                {availableDistricts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            {/* Monitoring Station Selector */}
            <div>
              <select
                value={selectedStationFilter}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedStationFilter(val);
                  if (val !== 'all') {
                    const found = verifiedStations.find((s) => s.id === val);
                    if (found) handleLocateStation(found);
                  }
                  setCatalogPage(1);
                }}
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-sky-500 truncate"
              >
                <option value="all">Select Monitoring Station ({filteredStations.length})</option>
                {filteredStations.slice(0, 80).map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name} ({st.stationCode})
                  </option>
                ))}
              </select>
            </div>

            {/* Date Range Filter */}
            <div>
              <select
                value={selectedDateRange}
                onChange={(e) => {
                  setSelectedDateRange(e.target.value);
                  setCatalogPage(1);
                }}
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="all">All Observation Dates</option>
                <option value="2026">2026 Observations (Latest Cycle)</option>
                <option value="2025">2025 Observations</option>
              </select>
            </div>

            {/* Water-Quality Parameter Screen */}
            <div>
              <select
                value={highlightParameter}
                onChange={(e) => {
                  setHighlightParameter(e.target.value);
                  setCatalogPage(1);
                }}
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="all">All Parameters Baseline</option>
                <option value="do_below_5">Low Dissolved Oxygen (&lt; 5.0 mg/L)</option>
                <option value="bod_above_3">Elevated BOD (&gt; 3.0 mg/L)</option>
                <option value="ph_abnormal">pH Out of Range (&lt; 6.5 or &gt; 8.5)</option>
                <option value="has_cod">Chemical Oxygen Demand (COD Reported)</option>
                <option value="has_turbidity">Turbidity Reported</option>
                <option value="has_nitrate">Nitrate Reported</option>
              </select>
            </div>
          </div>
        </div>

        {/* Selected River Info Banner */}
        {activeRiverPath && (
          <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-xs text-sky-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm text-sky-900">{activeRiverPath.name}</span>
                <span className="text-slate-400">·</span>
                <span className="font-medium text-sky-700">{activeRiverPath.hindiName}</span>
                <span className="text-slate-400">·</span>
                <span className="font-mono text-slate-600">{activeRiverPath.lengthKm} km</span>
              </div>
              <p className="text-slate-600 text-[11px]">
                <strong className="text-slate-800">Origin:</strong> {activeRiverPath.origin} →{' '}
                <strong className="text-slate-800">Outflow:</strong> {activeRiverPath.outflow}
              </p>
              <p className="text-slate-500 text-[11px]">
                <strong className="text-slate-700">States:</strong> {activeRiverPath.states.join(', ')} ·{' '}
                <strong className="text-slate-700">Key Reaches:</strong> {activeRiverPath.keyStretches}
              </p>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-md bg-white border border-sky-200 font-mono text-[11px] font-bold text-sky-800">
                {filteredStations.length} Verified Stations
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 4. Main GIS Map Viewport & Station Inspector Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Map Viewport Area (8 Cols) */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          {/* Map Status Bar */}
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <span className="text-slate-700 font-semibold">
                  Stations in View:{' '}
                  <span className="font-mono text-slate-900">{visibleStationCount}</span> /{' '}
                  <span className="font-mono text-slate-500">{filteredStations.length}</span>
                </span>
              </div>

              <div className="hidden sm:flex items-center gap-2 border-l border-slate-200 pl-3 text-slate-500">
                <span>Center:</span>
                <span className="font-mono text-[11px]">
                  {mapCenterCoords.lat.toFixed(2)}°N, {mapCenterCoords.lng.toFixed(2)}°E
                </span>
              </div>
            </div>

            {/* Marker Legend */}
            <div className="flex items-center gap-3 text-[11px] font-medium">
              <div className="flex items-center gap-1.5 text-sky-800">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-700 border border-white shadow-2xs"></span>
                <span>Normal / CPCB Compliant</span>
              </div>
              <div className="flex items-center gap-1.5 text-rose-700">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-600 border border-white shadow-2xs animate-pulse"></span>
                <span>Requires Verification (BOD &gt; 3.0 / DO &lt; 5.0)</span>
              </div>
            </div>
          </div>

          {/* Leaflet Map Canvas */}
          <div className="relative w-full h-[520px] sm:h-[600px] bg-slate-100">
            {/* Zoom In & Zoom Out Buttons directly on map */}
            <MapZoomButtons onZoomIn={handleZoomIn} onZoomOut={handleZoomOut} />

            <MapContainer
              center={INDIA_CENTER}
              zoom={5}
              minZoom={4}
              maxZoom={18}
              scrollWheelZoom={true}
              className="w-full h-full"
              ref={mapRef}
            >
              {/* Tile Layer Based on Style Selection */}
              {tileStyle === 'osm' && (
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
              )}
              {tileStyle === 'voyager' && (
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                  url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                />
              )}
              {tileStyle === 'terrain' && (
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors, Tiles &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
                  url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
                  maxZoom={17}
                />
              )}

              {/* View Controller */}
              <MapViewController
                action={mapAction}
                verifiedStations={filteredStations}
                onVisibleCountChange={handleVisibleCountChange}
              />

              {/* Indian River Course Polylines */}
              {INDIAN_RIVERS.map((river) => {
                const isSelected = selectedRiverId === river.id;
                return (
                  <Polyline
                    key={river.id}
                    positions={river.coordinates}
                    pathOptions={{
                      color: isSelected ? '#1E40AF' : river.color,
                      weight: isSelected ? 6 : 3.5,
                      opacity: isSelected ? 0.95 : 0.75,
                      dashArray: isSelected ? undefined : '6, 6',
                    }}
                    eventHandlers={{
                      click: () => handleSelectRiver(river),
                    }}
                  >
                    <Tooltip sticky>
                      <div className="font-sans text-xs">
                        <strong className="text-sky-900">{river.name}</strong> ({river.hindiName})
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                          Length: {river.lengthKm} km · {river.keyStretches.split('·')[0]}
                        </div>
                      </div>
                    </Tooltip>
                  </Polyline>
                );
              })}

              {/* Verified Indian River Monitoring Station Markers */}
              {filteredStations.map((station) => {
                const isSelected = selectedStationId === station.id;
                const icon = createStationIcon(station.isFlagged, isSelected, station.cpcbClass);

                return (
                  <Marker
                    key={station.id}
                    position={[station.latitude, station.longitude]}
                    icon={icon}
                    eventHandlers={{
                      click: () => {
                        setSelectedStationId(station.id);
                      },
                    }}
                  >
                    <Popup>
                      <div className="p-3.5 min-w-[260px] max-w-[320px] space-y-2.5 font-sans">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-bold">
                                {station.stationCode}
                              </span>
                              <span className="text-[10px] font-semibold text-sky-800 bg-sky-50 px-1.5 py-0.5 rounded">
                                {station.cpcbClass}
                              </span>
                            </div>
                            <h4 className="text-sm font-bold text-slate-900 mt-1">
                              {station.name}
                            </h4>
                            <p className="text-[11px] text-sky-700 font-medium">
                              {station.river} · {station.state}
                            </p>
                          </div>

                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                              station.isFlagged
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            }`}
                          >
                            {station.isFlagged ? 'Verification Recommended' : station.status}
                          </span>
                        </div>

                        {/* Telemetry Metrics */}
                        <div className="grid grid-cols-2 gap-1.5 text-xs font-mono bg-slate-50 p-2 rounded-lg">
                          <div>
                            <span className="text-[10px] text-slate-500 font-sans block">Dissolved Oxygen</span>
                            <span className={`font-bold ${station.latestReading.dissolved_oxygen < 5.0 ? 'text-amber-700' : 'text-slate-800'}`}>
                              {station.latestReading.dissolved_oxygen.toFixed(2)} mg/L
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 font-sans block">BOD</span>
                            <span className={`font-bold ${station.latestReading.bod_mg_l > 3.0 ? 'text-amber-700' : 'text-slate-800'}`}>
                              {station.latestReading.bod_mg_l.toFixed(2)} mg/L
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 font-sans block">pH Level</span>
                            <span className="font-bold text-slate-800">{station.latestReading.ph.toFixed(2)}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 font-sans block">Temperature</span>
                            <span className="font-bold text-slate-800">{station.latestReading.temperature.toFixed(1)}°C</span>
                          </div>
                          {station.latestReading.cod_mg_l !== undefined && (
                            <div>
                              <span className="text-[10px] text-slate-500 font-sans block">COD</span>
                              <span className="font-bold text-purple-700">{station.latestReading.cod_mg_l.toFixed(1)} mg/L</span>
                            </div>
                          )}
                          {station.latestReading.turbidity !== undefined && (
                            <div>
                              <span className="text-[10px] text-slate-500 font-sans block">Turbidity</span>
                              <span className="font-bold text-slate-800">{station.latestReading.turbidity.toFixed(1)} NTU</span>
                            </div>
                          )}
                        </div>

                        {/* Coordinates, Date, and Data Source */}
                        <div className="text-[11px] text-slate-600 space-y-1 pt-0.5">
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="font-mono">
                              {station.latitude.toFixed(4)}°N, {station.longitude.toFixed(4)}°E
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>Observation: {formatDate(station.sampleDate)}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 bg-slate-100/80 p-1.5 rounded font-sans leading-tight">
                            <strong className="text-slate-700">Source:</strong> {station.source}
                          </div>
                        </div>

                        {/* Action link */}
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                          <button
                            onClick={() => onSelectReading(station.latestReading)}
                            className="text-xs font-semibold text-sky-700 hover:text-sky-900 inline-flex items-center gap-1 cursor-pointer"
                          >
                            <span>Open Full Assay</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                          {onNavigateToTrends && (
                            <button
                              onClick={() => onNavigateToTrends(station.name)}
                              className="text-xs font-medium text-slate-500 hover:text-slate-800 cursor-pointer"
                            >
                              View Trends
                            </button>
                          )}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          </div>
        </div>

        {/* Station Details Inspector & Catalog (4 Cols) */}
        <div className="lg:col-span-4 space-y-4">
          {/* Active Station Card if selected */}
          {activeStation ? (
            <div className="bg-white rounded-2xl border border-sky-300 p-5 shadow-sm space-y-4">
              <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-sky-100 text-sky-900">
                    {activeStation.stationCode}
                  </span>
                  <h3 className="text-base font-extrabold text-slate-900 mt-1">
                    {activeStation.name}
                  </h3>
                  <p className="text-xs text-sky-700 font-semibold">
                    {activeStation.river} · {activeStation.state}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedStationId(null)}
                  className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* CPCB Class & Verification Status Badge */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase font-semibold">CPCB Designated Class</span>
                  <strong className="text-slate-900 text-sm">{activeStation.cpcbClass}</strong>
                </div>
                <span
                  className={`px-2 py-1 rounded-md text-xs font-bold ${
                    activeStation.isFlagged
                      ? 'bg-amber-100 text-amber-800 border border-amber-200'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  }`}
                >
                  {activeStation.isFlagged ? 'Verification Recommended' : activeStation.status}
                </span>
              </div>

              {/* Station Geographic Metadata */}
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">Coordinates:</span>
                  <span className="font-mono font-medium text-slate-800">
                    {activeStation.latitude.toFixed(4)}°N, {activeStation.longitude.toFixed(4)}°E
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">Observation Date:</span>
                  <span className="font-medium text-slate-800">{formatDate(activeStation.sampleDate)}</span>
                </div>
                {activeStation.district && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">District:</span>
                    <span className="font-medium text-slate-800">{activeStation.district}</span>
                  </div>
                )}
                <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-200">
                  <strong>Source:</strong> {activeStation.source}
                </div>
              </div>

              {/* Water Quality Telemetry Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-[10px] text-slate-500 font-sans block">Dissolved Oxygen</span>
                  <span className={`text-sm font-bold ${activeStation.latestReading.dissolved_oxygen < 5.0 ? 'text-amber-700' : 'text-slate-900'}`}>
                    {activeStation.latestReading.dissolved_oxygen.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-slate-400 font-sans"> mg/L</span>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-[10px] text-slate-500 font-sans block">BOD</span>
                  <span className={`text-sm font-bold ${activeStation.latestReading.bod_mg_l > 3.0 ? 'text-amber-700' : 'text-slate-900'}`}>
                    {activeStation.latestReading.bod_mg_l.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-slate-400 font-sans"> mg/L</span>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-[10px] text-slate-500 font-sans block">pH Value</span>
                  <span className="text-sm font-bold text-slate-900">
                    {activeStation.latestReading.ph.toFixed(2)}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-[10px] text-slate-500 font-sans block">Temperature</span>
                  <span className="text-sm font-bold text-slate-900">
                    {activeStation.latestReading.temperature.toFixed(1)}°C
                  </span>
                </div>
                {activeStation.latestReading.cod_mg_l !== undefined && (
                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                    <span className="text-[10px] text-slate-500 font-sans block">COD</span>
                    <span className="text-sm font-bold text-purple-700">
                      {activeStation.latestReading.cod_mg_l.toFixed(1)}
                    </span>
                    <span className="text-[10px] text-slate-400 font-sans"> mg/L</span>
                  </div>
                )}
                {activeStation.latestReading.turbidity !== undefined && (
                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                    <span className="text-[10px] text-slate-500 font-sans block">Turbidity</span>
                    <span className="text-sm font-bold text-slate-900">
                      {activeStation.latestReading.turbidity.toFixed(1)}
                    </span>
                    <span className="text-[10px] text-slate-400 font-sans"> NTU</span>
                  </div>
                )}
                {activeStation.latestReading.nitrate_mg_l !== undefined && (
                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                    <span className="text-[10px] text-slate-500 font-sans block">Nitrate</span>
                    <span className="text-sm font-bold text-blue-700">
                      {activeStation.latestReading.nitrate_mg_l.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-400 font-sans"> mg/L</span>
                  </div>
                )}
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-[10px] text-slate-500 font-sans block">TDS</span>
                  <span className="text-sm font-bold text-slate-900">
                    {activeStation.latestReading.tds}
                  </span>
                  <span className="text-[10px] text-slate-400 font-sans"> mg/L</span>
                </div>
              </div>

              {/* Notes */}
              {activeStation.latestReading.review_notes && (
                <div className="text-[11px] text-slate-600 p-2.5 rounded-lg bg-slate-50 border border-slate-200 leading-relaxed">
                  <strong className="text-slate-800">Compliance Notes:</strong> {activeStation.latestReading.review_notes}
                </div>
              )}

              {/* Inspector Buttons */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => onSelectReading(activeStation.latestReading)}
                  className="flex-1 py-2 text-xs font-semibold text-white bg-sky-800 hover:bg-sky-900 rounded-lg text-center shadow-xs transition-colors cursor-pointer"
                >
                  Full Chemical Assay
                </button>
                {onNavigateToTrends && (
                  <button
                    onClick={() => onNavigateToTrends(activeStation.name)}
                    className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                  >
                    Historical Trend
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-sky-800">
                <Compass className="w-4 h-4" />
                <h3 className="text-sm font-bold">CPCB Station Navigator</h3>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Click any monitoring marker or river path on the GIS map to inspect live dissolved oxygen, biochemical oxygen demand, pH, and CPCB Bathing criteria compliance.
              </p>
              <div className="p-3 bg-sky-50 rounded-xl border border-sky-100 text-xs text-sky-900 space-y-1">
                <strong className="block font-bold">CPCB Bathing Standard (Class B):</strong>
                <span>DO &ge; 5.0 mg/L · BOD &le; 3.0 mg/L · pH 6.5 – 8.5</span>
              </div>
            </div>
          )}

          {/* Paginated Station Catalog */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h4 className="text-sm font-bold text-slate-900">River Stations Catalog</h4>
                <p className="text-[11px] text-slate-500">
                  Showing {filteredStations.length} verified stations in India
                </p>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold">
                Page {catalogPage} of {catalogTotalPages}
              </span>
            </div>

            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {paginatedCatalogStations.map((st) => {
                const isSelected = selectedStationId === st.id;
                return (
                  <div
                    key={st.id}
                    onClick={() => handleLocateStation(st)}
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-sky-500 bg-sky-50/50 shadow-xs'
                        : 'border-slate-100 hover:border-sky-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono font-bold text-slate-500">
                            {st.stationCode}
                          </span>
                          <span className="text-[10px] font-semibold text-sky-800 bg-sky-50 px-1 py-0.2 rounded">
                            {st.cpcbClass}
                          </span>
                        </div>
                        <h5 className="text-xs font-bold text-slate-900 truncate mt-0.5">
                          {st.name}
                        </h5>
                        <p className="text-[11px] text-slate-500 truncate">
                          {st.river} · {st.state}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-xs font-mono font-bold text-slate-800 block">
                          DO: {st.latestReading.dissolved_oxygen.toFixed(1)}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500 block">
                          BOD: {st.latestReading.bod_mg_l.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            {catalogTotalPages > 1 && (
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                <button
                  onClick={() => setCatalogPage((p) => Math.max(1, p - 1))}
                  disabled={catalogPage === 1}
                  className="px-2.5 py-1 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Prev</span>
                </button>
                <span className="text-slate-500 text-[11px]">
                  {catalogPage} / {catalogTotalPages}
                </span>
                <button
                  onClick={() => setCatalogPage((p) => Math.min(catalogTotalPages, p + 1))}
                  disabled={catalogPage === catalogTotalPages}
                  className="px-2.5 py-1 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
