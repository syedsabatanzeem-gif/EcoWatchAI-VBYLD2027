import React from 'react';
import { Reading } from '../types.ts';
import {
  Search,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  Eye,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  Waves,
  MapPin
} from 'lucide-react';

interface ReadingsTableProps {
  readings: Reading[];
  totalReadings: number;
  totalStations?: number;
  page: number;
  totalPages: number;
  locations: string[];
  states?: string[];
  rivers?: string[];
  selectedLocation: string;
  selectedState?: string;
  selectedRiver?: string;
  selectedStatus: string;
  searchQuery: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSearchChange: (q: string) => void;
  onLocationChange: (loc: string) => void;
  onStateChange?: (state: string) => void;
  onRiverChange?: (river: string) => void;
  onStatusChange: (status: string) => void;
  onSortChange: (field: string) => void;
  onPageChange: (newPage: number) => void;
  onSelectReading: (reading: Reading) => void;
  onExportCsv: () => void;
}

export const ReadingsTable: React.FC<ReadingsTableProps> = ({
  readings,
  totalReadings,
  totalStations,
  page,
  totalPages,
  locations,
  states = [],
  rivers = [],
  searchQuery,
  selectedLocation,
  selectedState = 'all',
  selectedRiver = 'all',
  selectedStatus,
  sortBy,
  sortOrder,
  onSearchChange,
  onLocationChange,
  onStateChange,
  onRiverChange,
  onStatusChange,
  onSortChange,
  onPageChange,
  onSelectReading,
  onExportCsv,
}) => {
  const getStatusBadge = (status: Reading['status']) => {
    switch (status) {
      case 'Normal':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>Compliant</span>
          </span>
        );
      case 'Needs Review':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            <span>Review Recommended</span>
          </span>
        );
      case 'High Priority':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-800 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
            <AlertTriangle className="w-3 h-3 text-rose-600" />
            <span>High Priority</span>
          </span>
        );
      case 'Reviewed':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-800 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200">
            <CheckCircle2 className="w-3 h-3 text-sky-600" />
            <span>Verified</span>
          </span>
        );
      case 'Needs Further Investigation':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-800 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
            <Clock className="w-3 h-3 text-purple-600" />
            <span>Re-assay Needed</span>
          </span>
        );
      default:
        return <span className="text-xs text-slate-500">{status}</span>;
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Table Header Controls */}
      <div className="p-4 sm:p-5 border-b border-slate-200 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900">
                National River Water Quality Records (India Only)
              </h3>
              <span className="text-[10px] bg-sky-50 text-sky-900 font-mono font-bold px-2 py-0.5 rounded border border-sky-200">
                CPCB NWMP Network
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Displaying <strong className="text-slate-800">{readings.length}</strong> of{' '}
              <strong className="text-slate-800">{totalReadings}</strong> verified Indian river records across{' '}
              <strong className="text-slate-800">{totalStations || locations.length}</strong> stations
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
            <button
              onClick={onExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition-colors cursor-pointer"
              title="Export filtered observations as CSV"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>Export Filtered CSV</span>
            </button>
          </div>
        </div>

        {/* Filter bar: Search, River, Station, Status */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search station, river, state, district..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-400 text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          {/* River / Water Body filter */}
          {onRiverChange && rivers.length > 0 && (
            <div>
              <select
                value={selectedRiver}
                onChange={(e) => onRiverChange(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-sky-500 truncate"
              >
                <option value="all">All Indian Rivers ({rivers.length})</option>
                {rivers.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Station location filter */}
          <div>
            <select
              value={selectedLocation}
              onChange={(e) => onLocationChange(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-sky-500 truncate"
            >
              <option value="all">All Stations ({locations.length})</option>
              {locations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>

          {/* Status filter */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => onStatusChange(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option value="all">All Statuses</option>
              <option value="Normal">Compliant (Class A/B/C)</option>
              <option value="Needs Review">Needs Review / Verification</option>
              <option value="High Priority">High Priority (Severe Exceedance)</option>
              <option value="Reviewed">Reviewed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-700">
          <thead className="bg-slate-50/80 text-slate-600 uppercase tracking-wider font-semibold border-b border-slate-200 text-[11px]">
            <tr>
              <th
                onClick={() => onSortChange('id')}
                className="py-3 px-3 cursor-pointer hover:text-slate-900"
              >
                <div className="flex items-center gap-1">
                  <span>Station ID</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th
                onClick={() => onSortChange('location')}
                className="py-3 px-3 cursor-pointer hover:text-slate-900"
              >
                <div className="flex items-center gap-1">
                  <span>Location</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th
                onClick={() => onSortChange('river')}
                className="py-3 px-3 cursor-pointer hover:text-slate-900"
              >
                <div className="flex items-center gap-1">
                  <span>River</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th
                onClick={() => onSortChange('state')}
                className="py-3 px-3 cursor-pointer hover:text-slate-900"
              >
                <div className="flex items-center gap-1">
                  <span>State</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th
                onClick={() => onSortChange('timestamp')}
                className="py-3 px-3 cursor-pointer hover:text-slate-900"
              >
                <div className="flex items-center gap-1">
                  <span>Observation</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th
                onClick={() => onSortChange('dissolved_oxygen')}
                className="py-3 px-3 text-right cursor-pointer hover:text-slate-900"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>DO (mg/L)</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th
                onClick={() => onSortChange('bod_mg_l')}
                className="py-3 px-3 text-right cursor-pointer hover:text-slate-900"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>BOD (mg/L)</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th
                onClick={() => onSortChange('ph')}
                className="py-3 px-3 text-right cursor-pointer hover:text-slate-900"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>pH</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th
                onClick={() => onSortChange('temperature')}
                className="py-3 px-3 text-right cursor-pointer hover:text-slate-900"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Temp (°C)</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="py-3 px-3">CPCB Status</th>
              <th className="py-3 px-3 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {readings.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-8 text-center text-slate-400 text-xs">
                  No readings match the current filter criteria. Try resetting filters or search terms.
                </td>
              </tr>
            ) : (
              readings.map((reading) => {
                const formattedDate = new Date(reading.timestamp).toLocaleDateString(
                  'en-IN',
                  {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  }
                );

                const isWarning =
                  reading.dissolved_oxygen < 5.0 ||
                  reading.bod_mg_l > 3.0 ||
                  reading.status === 'Needs Review' ||
                  reading.status === 'High Priority';

                return (
                  <tr
                    key={reading.id}
                    onClick={() => onSelectReading(reading)}
                    className={`hover:bg-slate-50 transition-colors cursor-pointer group ${
                      isWarning ? 'bg-amber-50/20' : ''
                    }`}
                  >
                    <td className="py-3 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                      {reading.station_id || reading.id}
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-800 max-w-[200px] truncate">
                      {reading.location}
                    </td>
                    <td className="py-3 px-3 text-sky-800 font-semibold whitespace-nowrap">
                      {reading.river || 'Ganga River'}
                    </td>
                    <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                      {reading.state || 'Uttar Pradesh'}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-500 text-[11px] whitespace-nowrap">
                      {formattedDate}
                    </td>
                    <td
                      className={`py-3 px-3 text-right font-mono tabular-nums ${
                        reading.dissolved_oxygen < 5.0
                          ? 'text-amber-700 font-bold'
                          : 'text-emerald-700 font-semibold'
                      }`}
                    >
                      {reading.dissolved_oxygen.toFixed(2)}
                    </td>
                    <td
                      className={`py-3 px-3 text-right font-mono tabular-nums ${
                        reading.bod_mg_l > 3.0
                          ? 'text-amber-700 font-bold'
                          : 'text-slate-800 font-medium'
                      }`}
                    >
                      {reading.bod_mg_l.toFixed(2)}
                    </td>
                    <td
                      className={`py-3 px-3 text-right font-mono tabular-nums ${
                        reading.ph < 6.5 || reading.ph > 8.5
                          ? 'text-amber-700 font-bold'
                          : 'text-slate-700'
                      }`}
                    >
                      {reading.ph.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                      {reading.temperature.toFixed(1)}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      {getStatusBadge(reading.status)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectReading(reading);
                        }}
                        className="p-1 rounded text-slate-400 group-hover:text-sky-700 hover:bg-slate-100 transition-colors"
                        title="Inspect Reading Assay"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="p-3.5 sm:p-4 border-t border-slate-200 flex items-center justify-between text-xs bg-slate-50/50">
          <span className="text-slate-500 text-[11px]">
            Page <strong className="text-slate-800">{page}</strong> of{' '}
            <strong className="text-slate-800">{totalPages}</strong> ({totalReadings} records)
          </span>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center gap-1 font-medium"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center gap-1 font-medium"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
