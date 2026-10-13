import React, { useState } from 'react';
import { ThresholdConfig } from '../types.ts';
import { X, Sliders, CheckCircle2, RotateCcw, AlertCircle, ShieldCheck } from 'lucide-react';

interface ThresholdSettingsModalProps {
  thresholds: ThresholdConfig;
  isOpen: boolean;
  onClose: () => void;
  onSave: (newThresholds: ThresholdConfig) => Promise<void>;
}

export const ThresholdSettingsModal: React.FC<ThresholdSettingsModalProps> = ({
  thresholds,
  isOpen,
  onClose,
  onSave,
}) => {
  if (!isOpen) return null;

  const [form, setForm] = useState<ThresholdConfig>({ ...thresholds });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleResetDefaults = () => {
    setForm({
      ph: { min: 6.5, max: 8.5 },
      dissolved_oxygen: { min: 5.0 }, // CPCB Class B Bathing standard
      bod: { max: 3.0 }, // CPCB Class B Bathing standard
      cod: { max: 250.0 }, // CPCB inland discharge standard
      turbidity: { max: 10.0 },
      tds: { max: 500 },
      temperature: { min: 10.0, max: 35.0 },
      nitrate: { max: 10.0 },
      zScoreThreshold: 2.5,
      iqrMultiplier: 1.5,
      enableMlDetection: true,
    });
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.ph.min >= form.ph.max) {
      setError('pH minimum must be strictly lower than pH maximum.');
      return;
    }
    if (form.bod && form.bod.max <= 0) {
      setError('BOD threshold must be positive.');
      return;
    }
    if (form.turbidity.max <= 0) {
      setError('Turbidity threshold must be positive.');
      return;
    }
    if (form.temperature.min >= form.temperature.max) {
      setError('Temperature minimum must be less than maximum.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await onSave(form);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update thresholds');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-sky-50 text-sky-800 rounded-lg">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Configure CPCB Water Quality Thresholds
              </h3>
              <p className="text-xs text-slate-500">
                Tune Central Pollution Control Board (CPCB) screening criteria & statistical outlier bounds
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs overflow-y-auto">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="p-3 bg-sky-50/70 border border-sky-100 rounded-xl text-sky-900 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
            <p className="leading-relaxed text-[11px]">
              <strong className="font-semibold">CPCB Designated Best Use Standard:</strong> Class B (Outdoor Bathing) requires Dissolved Oxygen &ge; 5.0 mg/L and BOD &le; 3.0 mg/L. Adjust thresholds below for specific river reaches.
            </p>
          </div>

          <div className="space-y-3.5">
            {/* CPCB Core Parameters: DO & BOD */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Min Dissolved Oxygen (DO mg/L)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={form.dissolved_oxygen.min}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      dissolved_oxygen: { min: parseFloat(e.target.value) || 0 },
                    })
                  }
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono"
                />
                <span className="text-[10px] text-slate-400">CPCB Class B Standard: &ge; 5.0 mg/L</span>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Max BOD (3-day 27°C mg/L)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={form.bod?.max ?? 3.0}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      bod: { max: parseFloat(e.target.value) || 3.0 },
                    })
                  }
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono"
                />
                <span className="text-[10px] text-slate-400">CPCB Class B Standard: &le; 3.0 mg/L</span>
              </div>
            </div>

            {/* pH */}
            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                pH Acceptable Range (CPCB Class A-E: 6.5 – 8.5)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[11px] text-slate-500">Min pH</span>
                  <input
                    type="number"
                    step="0.1"
                    value={form.ph.min}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        ph: { ...form.ph, min: parseFloat(e.target.value) || 0 },
                      })
                    }
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-slate-500">Max pH</span>
                  <input
                    type="number"
                    step="0.1"
                    value={form.ph.max}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        ph: { ...form.ph, max: parseFloat(e.target.value) || 0 },
                      })
                    }
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
              </div>
            </div>

            {/* COD & Turbidity */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Max COD (mg/L)
                </label>
                <input
                  type="number"
                  step="5"
                  value={form.cod?.max ?? 250.0}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      cod: { max: parseFloat(e.target.value) || 250.0 },
                    })
                  }
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono"
                />
                <span className="text-[10px] text-slate-400">CPCB Inland limit: 250 mg/L</span>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Max Turbidity (NTU)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={form.turbidity.max}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      turbidity: { max: parseFloat(e.target.value) || 0 },
                    })
                  }
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono"
                />
                <span className="text-[10px] text-slate-400">CPCB standard: &le; 10 NTU</span>
              </div>
            </div>

            {/* TDS & Nitrate */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Max TDS (mg/L)
                </label>
                <input
                  type="number"
                  step="10"
                  value={form.tds.max}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      tds: { max: parseFloat(e.target.value) || 0 },
                    })
                  }
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Max Nitrate (NO₃-N mg/L)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={form.nitrate?.max ?? 10.0}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      nitrate: { max: parseFloat(e.target.value) || 10.0 },
                    })
                  }
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono"
                />
              </div>
            </div>

            {/* Statistical Outlier Tuning */}
            <div className="pt-2 border-t border-slate-100">
              <span className="font-semibold text-slate-700 block mb-2">
                Statistical Outlier Tuning & Screening Model
              </span>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[11px] text-slate-500">
                    Z-Score Sensitivity (σ)
                  </span>
                  <input
                    type="number"
                    step="0.1"
                    min="1.0"
                    max="5.0"
                    value={form.zScoreThreshold}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        zScoreThreshold: parseFloat(e.target.value) || 2.5,
                      })
                    }
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono"
                  />
                </div>

                <div>
                  <span className="text-[11px] text-slate-500">
                    IQR Multiplier
                  </span>
                  <input
                    type="number"
                    step="0.1"
                    min="1.0"
                    max="3.0"
                    value={form.iqrMultiplier}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        iqrMultiplier: parseFloat(e.target.value) || 1.5,
                      })
                    }
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>Reset to CPCB Standards</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold text-white bg-sky-800 hover:bg-sky-900 rounded-lg shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
              >
                {saving ? (
                  <span>Saving...</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Apply Thresholds</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
