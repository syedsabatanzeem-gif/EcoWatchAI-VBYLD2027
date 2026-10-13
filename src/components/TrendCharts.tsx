import React, { useState, useMemo } from 'react';
import { TrendPoint, LocationComparison, ThresholdConfig } from '../types.ts';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import { SlidersHorizontal, BarChart3, TrendingUp, Layers, Activity } from 'lucide-react';

interface TrendChartsProps {
  trendData: TrendPoint[];
  locationComparisons: LocationComparison[];
  thresholds?: ThresholdConfig;
  locations: string[];
  selectedLocation: string;
  onLocationChange: (loc: string) => void;
}

export const TrendCharts: React.FC<TrendChartsProps> = ({
  trendData,
  locationComparisons,
  thresholds,
  locations,
  selectedLocation,
  onLocationChange,
}) => {
  const [selectedParameter, setSelectedParameter] = useState<
    'ph' | 'dissolved_oxygen' | 'bod' | 'cod' | 'turbidity' | 'nitrate' | 'temperature' | 'tds' | 'all'
  >('dissolved_oxygen');
  const [chartViewMode, setChartViewMode] = useState<'trends' | 'comparison' | 'distribution'>('trends');

  const parameterMeta = {
    dissolved_oxygen: {
      name: 'Dissolved Oxygen (DO)',
      unit: 'mg/L',
      color: '#059669', // Emerald-600
      refMin: thresholds?.dissolved_oxygen.min ?? 5.0,
      standardNotice: 'CPCB Class B Bathing criteria: min 5.0 mg/L',
    },
    bod: {
      name: 'Biochemical Oxygen Demand (BOD)',
      unit: 'mg/L',
      color: '#D97706', // Amber-600
      refMax: thresholds?.bod?.max ?? 3.0,
      standardNotice: 'CPCB Class B Bathing criteria: max 3.0 mg/L',
    },
    ph: {
      name: 'pH Level',
      unit: '',
      color: '#0284C7', // Sky-600
      refMin: thresholds?.ph.min ?? 6.5,
      refMax: thresholds?.ph.max ?? 8.5,
      standardNotice: 'CPCB Class A-E criteria: 6.5 – 8.5',
    },
    cod: {
      name: 'Chemical Oxygen Demand (COD)',
      unit: 'mg/L',
      color: '#7C3AED', // Violet-600
      refMax: thresholds?.cod?.max ?? 250.0,
      standardNotice: 'CPCB General Discharge Standard: max 250 mg/L',
    },
    turbidity: {
      name: 'Turbidity',
      unit: 'NTU',
      color: '#F97316', // Orange-500
      refMax: thresholds?.turbidity.max ?? 10.0,
      standardNotice: 'CPCB / BIS standard: max 10 NTU',
    },
    nitrate: {
      name: 'Nitrate (NO₃-N)',
      unit: 'mg/L',
      color: '#2563EB', // Blue-600
      refMax: thresholds?.nitrate?.max ?? 10.0,
      standardNotice: 'WHO / CPCB drinking limit: max 10.0 mg/L',
    },
    temperature: {
      name: 'Water Temperature',
      unit: '°C',
      color: '#EC4899', // Pink-500
      refMin: thresholds?.temperature.min ?? 10.0,
      refMax: thresholds?.temperature.max ?? 35.0,
      standardNotice: 'Ambient tropical baseline: 15–32°C',
    },
    tds: {
      name: 'Total Dissolved Solids (TDS)',
      unit: 'mg/L',
      color: '#6366F1', // Indigo-500
      refMax: thresholds?.tds.max ?? 500,
      standardNotice: 'BIS / CPCB drinking limit: max 500 mg/L',
    },
  };

  // Filter trend points by selected location
  const filteredTrends = useMemo(() => {
    if (!selectedLocation || selectedLocation === 'all') {
      return trendData;
    }
    return trendData.filter(
      (t) => t.location.toLowerCase() === selectedLocation.toLowerCase()
    );
  }, [trendData, selectedLocation]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
      {/* Chart Control Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-100">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-sky-700" />
            <span>River Water Quality Telemetry & Trends</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Temporal parameter trajectories, CPCB threshold envelopes & multi-station comparisons
          </p>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center p-1 bg-slate-100 rounded-lg text-xs font-medium">
            <button
              onClick={() => setChartViewMode('trends')}
              className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                chartViewMode === 'trends'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Time Trends
            </button>
            <button
              onClick={() => setChartViewMode('comparison')}
              className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                chartViewMode === 'comparison'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Station Averages
            </button>
            <button
              onClick={() => setChartViewMode('distribution')}
              className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                chartViewMode === 'distribution'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              CPCB Criteria Matrix
            </button>
          </div>

          {/* Location filter dropdown */}
          <div className="flex items-center gap-1.5 text-xs">
            <select
              value={selectedLocation}
              onChange={(e) => onLocationChange(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-sky-500 max-w-[200px] truncate"
            >
              <option value="all">All Monitoring Stations</option>
              {locations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Parameter selector (when in trends mode) */}
      {chartViewMode === 'trends' && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
          <span className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider mr-1 shrink-0">
            Parameter:
          </span>
          {(
            [
              'dissolved_oxygen',
              'bod',
              'ph',
              'cod',
              'turbidity',
              'nitrate',
              'temperature',
              'tds',
              'all',
            ] as const
          ).map((param) => {
            const isSelected = selectedParameter === param;
            const label =
              param === 'all'
                ? 'All Core Parameters'
                : parameterMeta[param]?.name;
            return (
              <button
                key={param}
                onClick={() => setSelectedParameter(param)}
                className={`px-2.5 py-1 rounded-md transition-colors whitespace-nowrap cursor-pointer text-xs font-medium ${
                  isSelected
                    ? 'bg-sky-900 text-white shadow-2xs font-semibold'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* View 1: Time Series Line Chart */}
      {chartViewMode === 'trends' && (
        <div className="h-72 w-full pt-2">
          {filteredTrends.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-400 text-xs">
              No trend data available for current selection.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={filteredTrends}
                margin={{ top: 10, right: 20, left: -10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  tickLine={false}
                  axisLine={{ stroke: '#E2E8F0' }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  tickLine={false}
                  axisLine={{ stroke: '#E2E8F0' }}
                  domain={
                    selectedParameter === 'ph'
                      ? [5.0, 9.5]
                      : selectedParameter === 'dissolved_oxygen'
                      ? [0, 12]
                      : selectedParameter === 'bod'
                      ? [0, 10]
                      : ['auto', 'auto']
                  }
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload as TrendPoint;
                      return (
                        <div className="bg-slate-900/95 text-white p-3 rounded-lg text-xs shadow-lg space-y-1 backdrop-blur-sm border border-slate-700 max-w-xs">
                          <p className="font-bold text-slate-100 truncate">
                            {data.location}
                          </p>
                          <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                            <span>{data.river || 'River Station'}</span>
                            <span>{data.dateTime}</span>
                          </div>
                          <div className="pt-1.5 border-t border-slate-700/80 space-y-0.5 font-mono text-[11px]">
                            {data.dissolved_oxygen !== null && (
                              <p className="text-emerald-300">
                                DO: {data.dissolved_oxygen.toFixed(2)} mg/L (min 5.0)
                              </p>
                            )}
                            {data.bod_mg_l !== null && (
                              <p className="text-amber-300">
                                BOD: {data.bod_mg_l.toFixed(2)} mg/L (max 3.0)
                              </p>
                            )}
                            <p className="text-sky-300">pH: {data.ph.toFixed(2)}</p>
                            {data.cod_mg_l !== null && data.cod_mg_l !== undefined && (
                              <p className="text-purple-300">
                                COD: {data.cod_mg_l.toFixed(1)} mg/L
                              </p>
                            )}
                            {data.turbidity !== null && (
                              <p className="text-orange-300">
                                Turbidity: {data.turbidity.toFixed(1)} NTU
                              </p>
                            )}
                            {data.nitrate_mg_l !== null && (
                              <p className="text-blue-300">
                                Nitrate: {data.nitrate_mg_l.toFixed(2)} mg/L
                              </p>
                            )}
                            <p className="text-pink-300">
                              Temp: {data.temperature.toFixed(1)}°C
                            </p>
                          </div>
                          {data.status !== 'Normal' && (
                            <p className="pt-1 text-amber-400 font-sans text-[11px] font-semibold">
                              Status: {data.status}
                            </p>
                          )}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, paddingTop: 10 }}
                  iconType="circle"
                />

                {/* Specific Parameter Lines with CPCB Reference Envelopes */}
                {selectedParameter === 'dissolved_oxygen' && (
                  <>
                    <ReferenceLine
                      y={thresholds?.dissolved_oxygen.min ?? 5.0}
                      stroke="#EF4444"
                      strokeDasharray="4 4"
                      label={{
                        value: 'CPCB Min DO: 5.0 mg/L (Outdoor Bathing)',
                        fill: '#EF4444',
                        fontSize: 10,
                        position: 'insideTopRight',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="dissolved_oxygen"
                      name="Dissolved Oxygen (mg/L)"
                      stroke="#059669"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#059669' }}
                      activeDot={{ r: 6 }}
                    />
                  </>
                )}

                {selectedParameter === 'bod' && (
                  <>
                    <ReferenceLine
                      y={thresholds?.bod?.max ?? 3.0}
                      stroke="#EF4444"
                      strokeDasharray="4 4"
                      label={{
                        value: 'CPCB Max BOD: 3.0 mg/L (Outdoor Bathing)',
                        fill: '#EF4444',
                        fontSize: 10,
                        position: 'insideTopRight',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="bod_mg_l"
                      name="Biochemical Oxygen Demand (mg/L)"
                      stroke="#D97706"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#D97706' }}
                      activeDot={{ r: 6 }}
                    />
                  </>
                )}

                {selectedParameter === 'ph' && (
                  <>
                    <ReferenceLine
                      y={thresholds?.ph.max ?? 8.5}
                      stroke="#EF4444"
                      strokeDasharray="4 4"
                      label={{
                        value: 'Max pH 8.5',
                        fill: '#EF4444',
                        fontSize: 10,
                        position: 'right',
                      }}
                    />
                    <ReferenceLine
                      y={thresholds?.ph.min ?? 6.5}
                      stroke="#EF4444"
                      strokeDasharray="4 4"
                      label={{
                        value: 'Min pH 6.5',
                        fill: '#EF4444',
                        fontSize: 10,
                        position: 'right',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="ph"
                      name="pH Level"
                      stroke="#0284C7"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#0284C7' }}
                      activeDot={{ r: 6 }}
                    />
                  </>
                )}

                {selectedParameter === 'cod' && (
                  <Line
                    type="monotone"
                    dataKey="cod_mg_l"
                    name="Chemical Oxygen Demand (mg/L)"
                    stroke="#7C3AED"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#7C3AED' }}
                    activeDot={{ r: 6 }}
                  />
                )}

                {selectedParameter === 'turbidity' && (
                  <>
                    <ReferenceLine
                      y={thresholds?.turbidity.max ?? 10.0}
                      stroke="#EF4444"
                      strokeDasharray="4 4"
                      label={{
                        value: 'Threshold 10.0 NTU',
                        fill: '#EF4444',
                        fontSize: 10,
                        position: 'right',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="turbidity"
                      name="Turbidity (NTU)"
                      stroke="#F97316"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#F97316' }}
                      activeDot={{ r: 6 }}
                    />
                  </>
                )}

                {selectedParameter === 'nitrate' && (
                  <>
                    <ReferenceLine
                      y={thresholds?.nitrate?.max ?? 10.0}
                      stroke="#EF4444"
                      strokeDasharray="4 4"
                      label={{
                        value: 'Max Nitrate 10.0 mg/L',
                        fill: '#EF4444',
                        fontSize: 10,
                        position: 'right',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="nitrate_mg_l"
                      name="Nitrate (mg/L NO₃-N)"
                      stroke="#2563EB"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#2563EB' }}
                    />
                  </>
                )}

                {selectedParameter === 'temperature' && (
                  <Line
                    type="monotone"
                    dataKey="temperature"
                    name="Temperature (°C)"
                    stroke="#EC4899"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#EC4899' }}
                  />
                )}

                {selectedParameter === 'tds' && (
                  <>
                    <ReferenceLine
                      y={thresholds?.tds.max ?? 500}
                      stroke="#EF4444"
                      strokeDasharray="4 4"
                      label={{
                        value: 'Threshold 500 mg/L',
                        fill: '#EF4444',
                        fontSize: 10,
                        position: 'right',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="tds"
                      name="Total Dissolved Solids (mg/L)"
                      stroke="#6366F1"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#6366F1' }}
                    />
                  </>
                )}

                {selectedParameter === 'all' && (
                  <>
                    <Line
                      type="monotone"
                      dataKey="dissolved_oxygen"
                      name="DO (mg/L)"
                      stroke="#059669"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="bod_mg_l"
                      name="BOD (mg/L)"
                      stroke="#D97706"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="ph"
                      name="pH Level"
                      stroke="#0284C7"
                      strokeWidth={2}
                      dot={false}
                    />
                  </>
                )}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* View 2: Cross-Station Bar Chart Comparison */}
      {chartViewMode === 'comparison' && (
        <div className="h-72 w-full pt-2">
          {locationComparisons.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-400 text-xs">
              No comparison data available.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={locationComparisons}
                margin={{ top: 10, right: 20, left: -10, bottom: 25 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis
                  dataKey="location"
                  tick={{ fontSize: 10, fill: '#64748B' }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                  tickLine={false}
                />
                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} tickLine={false} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload as LocationComparison;
                      return (
                        <div className="bg-slate-900/95 text-white p-3 rounded-lg text-xs shadow-lg space-y-1 border border-slate-700">
                          <p className="font-bold">{data.location}</p>
                          <p className="text-[11px] text-slate-400">
                            {data.river || 'River Reach'} · {data.readingsCount} records
                          </p>
                          <div className="pt-1.5 border-t border-slate-700 font-mono space-y-0.5 text-[11px]">
                            <p className="text-emerald-300">Mean DO: {data.avgDo ?? 'N/A'} mg/L</p>
                            <p className="text-amber-300">Mean BOD: {data.avgBod ?? 'N/A'} mg/L</p>
                            <p className="text-sky-300">Mean pH: {data.avgPh}</p>
                            <p className="text-orange-300">Mean Turbidity: {data.avgTurbidity} NTU</p>
                            <p className="text-purple-300">Mean TDS: {data.avgTds} mg/L</p>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                <Bar
                  dataKey="avgDo"
                  name="Avg Dissolved O2 (mg/L)"
                  fill="#059669"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="avgBod"
                  name="Avg BOD (mg/L)"
                  fill="#D97706"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="avgPh"
                  name="Avg pH Level"
                  fill="#0284C7"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="avgTurbidity"
                  name="Avg Turbidity (NTU)"
                  fill="#F97316"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* View 3: CPCB Designated Best Use Standards Matrix */}
      {chartViewMode === 'distribution' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
            <h4 className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>CPCB Class A & B: Bathing Criteria</span>
            </h4>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Dissolved Oxygen (DO)</span>
                <span className="font-mono font-bold text-emerald-700">≥ 5.0 mg/L</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Biochemical Oxygen Demand (BOD)</span>
                <span className="font-mono font-bold text-emerald-700">≤ 3.0 mg/L</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>pH Permissible Range</span>
                <span className="font-mono font-bold text-slate-800">6.5 – 8.5</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Fecal Coliform MPN/100ml</span>
                <span className="font-mono text-slate-600">500 desirable / 2500 max</span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
            <h4 className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-sky-500"></span>
              <span>CPCB Class C: Conventional Treatment</span>
            </h4>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Dissolved Oxygen (DO)</span>
                <span className="font-mono font-bold text-sky-700">≥ 4.0 mg/L</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Biochemical Oxygen Demand (BOD)</span>
                <span className="font-mono font-bold text-sky-700">≤ 3.0 mg/L</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Total Dissolved Solids (TDS)</span>
                <span className="font-mono text-slate-800">≤ 1,500 mg/L</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Nitrate (as NO₃-N)</span>
                <span className="font-mono text-slate-800">≤ 10.0 mg/L</span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
            <h4 className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <span>CPCB Class D & E: Wildlife & Irrigation</span>
            </h4>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Class D: Fisheries Minimum DO</span>
                <span className="font-mono font-bold text-amber-700">≥ 4.0 mg/L</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Class E: Electrical Conductivity</span>
                <span className="font-mono text-slate-800">≤ 2,250 µS/cm</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Chemical Oxygen Demand (COD)</span>
                <span className="font-mono text-slate-800">≤ 250 mg/L</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Investigation Threshold</span>
                <span className="font-mono text-rose-600 font-bold">DO &lt; 4.0 or BOD &gt; 5.0</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
