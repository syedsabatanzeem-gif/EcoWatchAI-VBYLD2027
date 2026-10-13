import React, { useState } from 'react';
import { Reading, ThresholdConfig } from '../types.ts';
import {
  X,
  MapPin,
  Clock,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Activity,
  ShieldAlert,
  Send,
  HelpCircle,
  Waves,
  Building2,
  Compass,
  Database,
  ExternalLink,
} from 'lucide-react';

interface ReadingDetailModalProps {
  reading: Reading | null;
  thresholds?: ThresholdConfig;
  isOpen: boolean;
  onClose: () => void;
  onUpdateStatus: (readingId: string, status: Reading['status'], notes?: string) => Promise<void>;
}

export const ReadingDetailModal: React.FC<ReadingDetailModalProps> = ({
  reading,
  thresholds,
  isOpen,
  onClose,
  onUpdateStatus,
}) => {
  if (!isOpen || !reading) return null;

  const [notes, setNotes] = useState(reading.review_notes || '');
  const [updating, setUpdating] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const handleStatusChange = async (newStatus: Reading['status']) => {
    setUpdating(true);
    try {
      await onUpdateStatus(reading.id, newStatus, notes);
      setSuccessMsg(`Status updated to "${newStatus}"`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setUpdating(false);
    }
  };

  const formattedDate = new Date(reading.timestamp).toLocaleDateString('en-IN', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const formattedTime = new Date(reading.timestamp).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-200 bg-slate-50/80 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono font-bold text-sky-800 bg-sky-100 px-2.5 py-0.5 rounded border border-sky-200">
                {reading.station_id || reading.id}
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                {reading.cpcb_class || 'Class B'}
              </span>
              <span className="text-xs font-mono text-slate-500">
                India NWMP
              </span>
            </div>
            <h3 className="text-lg font-bold text-slate-900 tracking-tight">
              {reading.location}
            </h3>
            <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-xs text-slate-600">
              <span className="flex items-center gap-1 font-semibold text-sky-800">
                <Waves className="w-3.5 h-3.5 text-sky-600" />
                {reading.river || 'Ganga River'}
              </span>
              <span className="text-slate-300">·</span>
              <span className="flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                {reading.state || 'National Reach'}
                {reading.district ? ` (${reading.district})` : ''}
              </span>
              <span className="text-slate-300">·</span>
              <span className="flex items-center gap-1 font-mono text-slate-500">
                <Compass className="w-3.5 h-3.5 text-slate-400" />
                {reading.latitude.toFixed(4)}°N, {reading.longitude.toFixed(4)}°E
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer shrink-0"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
          {/* Metadata Bar: Observation Date & Official Data Source */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
            <div className="flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
              <div>
                <span className="text-slate-500 font-medium block">Observation Timestamp:</span>
                <span className="font-semibold text-slate-900 font-mono">
                  {formattedDate} {formattedTime}
                </span>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Database className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="text-slate-500 font-medium block">Verified Data Source:</span>
                <span className="font-semibold text-slate-900">
                  {reading.source || 'Central Pollution Control Board (CPCB) - NWMP / Ministry of Jal Shakti'}
                </span>
                <span className="block text-[10px] text-slate-500">
                  Quality: {reading.data_quality || 'Verified Field Assay'}
                </span>
              </div>
            </div>
          </div>

          {/* Anomaly / Follow-up reasons if present */}
          {reading.anomaly_reasons && reading.anomaly_reasons.length > 0 && (
            <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-amber-900 font-semibold text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>CPCB Threshold Exceedance & Screening Flags</span>
              </div>
              <ul className="space-y-1.5 pl-6 list-disc text-xs text-amber-800">
                {reading.anomaly_reasons.map((reason, idx) => (
                  <li key={idx} className="leading-relaxed">
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Measured Parameters Grid */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-sky-700" />
                <span>Physicochemical Measurements (CPCB Parameters)</span>
              </h4>
              <span className="text-[11px] font-mono text-slate-500">
                Bathing Criteria: DO &ge; 5.0 · BOD &le; 3.0
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {/* pH */}
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                <span className="text-[11px] font-medium text-slate-500">pH Level</span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-xl font-bold font-mono tabular-nums text-slate-900">
                    {reading.ph.toFixed(2)}
                  </span>
                </div>
                <div className="mt-1 text-[10px] text-slate-500 font-mono">
                  CPCB: 6.5 – 8.5
                </div>
              </div>

              {/* Dissolved Oxygen */}
              <div className={`p-3 rounded-xl border ${
                reading.dissolved_oxygen < 5.0 ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200 bg-slate-50/50'
              }`}>
                <span className="text-[11px] font-medium text-slate-500">Dissolved Oxygen</span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className={`text-xl font-bold font-mono tabular-nums ${
                    reading.dissolved_oxygen < 5.0 ? 'text-amber-800' : 'text-emerald-700'
                  }`}>
                    {reading.dissolved_oxygen.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">mg/L</span>
                </div>
                <div className="mt-1 text-[10px] text-slate-500 font-mono">
                  CPCB: &ge; 5.0 mg/L
                </div>
              </div>

              {/* BOD */}
              <div className={`p-3 rounded-xl border ${
                reading.bod_mg_l > 3.0 ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200 bg-slate-50/50'
              }`}>
                <span className="text-[11px] font-medium text-slate-500">BOD (3-day 27°C)</span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className={`text-xl font-bold font-mono tabular-nums ${
                    reading.bod_mg_l > 3.0 ? 'text-rose-700' : 'text-slate-900'
                  }`}>
                    {reading.bod_mg_l.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">mg/L</span>
                </div>
                <div className="mt-1 text-[10px] text-slate-500 font-mono">
                  CPCB: &le; 3.0 mg/L
                </div>
              </div>

              {/* COD */}
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                <span className="text-[11px] font-medium text-slate-500">COD (Chemical OD)</span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-xl font-bold font-mono tabular-nums text-slate-900">
                    {reading.cod_mg_l !== undefined && reading.cod_mg_l !== null
                      ? reading.cod_mg_l.toFixed(1)
                      : '—'}
                  </span>
                  {reading.cod_mg_l !== undefined && (
                    <span className="text-[10px] text-slate-500 font-mono">mg/L</span>
                  )}
                </div>
                <div className="mt-1 text-[10px] text-slate-500 font-mono">
                  CPCB: &le; 250 mg/L
                </div>
              </div>

              {/* Turbidity */}
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                <span className="text-[11px] font-medium text-slate-500">Turbidity</span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-xl font-bold font-mono tabular-nums text-slate-900">
                    {reading.turbidity !== undefined && reading.turbidity !== null
                      ? reading.turbidity.toFixed(1)
                      : '—'}
                  </span>
                  {reading.turbidity !== undefined && (
                    <span className="text-[10px] text-slate-500 font-mono">NTU</span>
                  )}
                </div>
                <div className="mt-1 text-[10px] text-slate-500 font-mono">
                  BIS: &le; 10 NTU
                </div>
              </div>

              {/* Nitrate */}
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                <span className="text-[11px] font-medium text-slate-500">Nitrate (NO₃-N)</span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-xl font-bold font-mono tabular-nums text-slate-900">
                    {reading.nitrate_mg_l !== undefined && reading.nitrate_mg_l !== null
                      ? reading.nitrate_mg_l.toFixed(2)
                      : '—'}
                  </span>
                  {reading.nitrate_mg_l !== undefined && (
                    <span className="text-[10px] text-slate-500 font-mono">mg/L</span>
                  )}
                </div>
                <div className="mt-1 text-[10px] text-slate-500 font-mono">
                  Limit: &le; 10.0 mg/L
                </div>
              </div>

              {/* Temperature */}
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                <span className="text-[11px] font-medium text-slate-500">Water Temperature</span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-xl font-bold font-mono tabular-nums text-slate-900">
                    {reading.temperature.toFixed(1)}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">°C</span>
                </div>
                <div className="mt-1 text-[10px] text-slate-500 font-mono">
                  Ambient River
                </div>
              </div>

              {/* TDS */}
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                <span className="text-[11px] font-medium text-slate-500">TDS</span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-xl font-bold font-mono tabular-nums text-slate-900">
                    {Math.round(reading.tds)}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">mg/L</span>
                </div>
                <div className="mt-1 text-[10px] text-slate-500 font-mono">
                  BIS: &le; 500 mg/L
                </div>
              </div>
            </div>
          </div>

          {/* CPCB Designated Best Use Criteria Explanation */}
          <div className="p-3.5 bg-sky-50/60 border border-sky-100 rounded-xl text-xs text-sky-950 flex items-start gap-2.5">
            <HelpCircle className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <strong className="font-semibold block">CPCB Designated Best Use Classification:</strong>
              <p className="leading-relaxed text-slate-700">
                Under Central Pollution Control Board guidelines, Class B covers Outdoor Bathing (DO ≥ 5 mg/L, BOD ≤ 3 mg/L). Exceedances trigger investigation flags rather than immediate unsafe declarations to account for seasonal monsoonal turbidity or flow variations.
              </p>
            </div>
          </div>

          {/* Review Status & Notes Form */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Analyst Review Action
            </h4>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Investigation Notes & Field Observations
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Document site verification, rainfall conditions, industrial effluent checks, or State PCB coordination..."
                rows={2}
                className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>

            {successMsg && (
              <p className="text-xs text-emerald-600 font-medium">{successMsg}</p>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                disabled={updating}
                onClick={() => handleStatusChange('Reviewed')}
                className="px-3.5 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
              >
                Mark as Verified / Reviewed
              </button>
              <button
                disabled={updating}
                onClick={() => handleStatusChange('Needs Further Investigation')}
                className="px-3.5 py-2 text-xs font-semibold text-purple-800 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors cursor-pointer"
              >
                Flag for Further Investigation
              </button>
              <button
                disabled={updating}
                onClick={() => handleStatusChange('Normal')}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Reset to Compliant
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 font-mono">
            {reading.id} · CPCB NWMP
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-200 rounded-lg shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
