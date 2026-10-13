import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { INDIAN_RIVERS, IndianRiverPath } from './src/data/indianRiverPaths.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface Reading {
  id: string;
  station_id?: string;
  location: string;
  river?: string;
  state?: string;
  district?: string;
  water_body?: string;
  main_basin?: string;
  basin?: string;
  station_type?: string;
  timestamp: string;
  ph: number;
  dissolved_oxygen: number;
  bod_mg_l: number;
  cod_mg_l?: number;
  turbidity?: number;
  nitrate_mg_l?: number;
  temperature: number;
  tds: number;
  conductivity_us_cm?: number;
  cpcb_class?: 'Class A' | 'Class B' | 'Class C' | 'Class D' | 'Class E' | 'Below Class E';
  latitude: number;
  longitude: number;
  data_quality?: string;
  reporting_agency?: string;
  source?: string;
  status: 'Normal' | 'Needs Review' | 'High Priority' | 'Reviewed' | 'Needs Further Investigation';
  review_notes?: string;
  anomaly_reasons?: string[];
  z_scores?: Record<string, number>;
  ml_anomaly?: boolean;
  ml_anomaly_score?: number;
  is_illustrative?: boolean;
}

export interface ThresholdConfig {
  ph: { min: number; max: number };
  dissolved_oxygen: { min: number }; // CPCB Bathing: min 5.0 mg/L
  bod: { max: number }; // CPCB Bathing: max 3.0 mg/L
  cod: { max: number }; // CPCB inland surface water: max 250 mg/L
  turbidity: { max: number };
  tds: { max: number };
  temperature: { min: number; max: number };
  nitrate: { max: number }; // CPCB / WHO drinking guideline: 10.0 mg/L
  zScoreThreshold: number;
  iqrMultiplier: number;
  enableMlDetection: boolean;
}

export interface CommunityReport {
  id: string;
  location: string;
  waterBodyName?: string;
  state?: string;
  typeOfConcern: string;
  observationDate: string;
  description: string;
  status: 'Pending Verification' | 'Under Local Review' | 'Triaged';
  submittedAt: string;
  isVerified: false;
}

// CPCB Designated Best Use Standards
const DEFAULT_THRESHOLDS: ThresholdConfig = {
  ph: { min: 6.5, max: 8.5 },
  dissolved_oxygen: { min: 5.0 }, // CPCB Class B (Outdoor Bathing) standard: >= 5.0 mg/L
  bod: { max: 3.0 }, // CPCB Class B (Outdoor Bathing) standard: <= 3.0 mg/L
  cod: { max: 250.0 }, // CPCB general limit: <= 250 mg/L
  turbidity: { max: 10.0 }, // NTU
  tds: { max: 500.0 }, // mg/L
  temperature: { min: 10.0, max: 35.0 },
  nitrate: { max: 10.0 }, // mg/L as NO3-N
  zScoreThreshold: 2.5,
  iqrMultiplier: 1.5,
  enableMlDetection: true,
};

let currentThresholds: ThresholdConfig = { ...DEFAULT_THRESHOLDS };
let readingsStore: Reading[] = [];
let communityReportsStore: CommunityReport[] = [
  {
    id: 'IND-REP-101',
    location: 'Ganga River at Assi Ghat, Varanasi',
    waterBodyName: 'Ganga River',
    state: 'Uttar Pradesh',
    typeOfConcern: 'Discoloration',
    observationDate: '2026-03-28',
    description: 'Noticed brownish tint and floating floral offerings near the south steps following festival rites.',
    status: 'Under Local Review',
    submittedAt: '2026-03-28T10:30:00Z',
    isVerified: false,
  },
  {
    id: 'IND-REP-102',
    location: 'Yamuna River near Okhla Barrage, Delhi',
    waterBodyName: 'Yamuna River',
    state: 'Delhi',
    typeOfConcern: 'Foam / Chemical Sheen',
    observationDate: '2026-03-29',
    description: 'White froth line accumulating near barrage gates. Persistent foam observed across slow-moving eddy.',
    status: 'Pending Verification',
    submittedAt: '2026-03-29T08:15:00Z',
    isVerified: false,
  },
  {
    id: 'IND-REP-103',
    location: 'Godavari River at Pushkar Ghat, Rajahmundry',
    waterBodyName: 'Godavari River',
    state: 'Andhra Pradesh',
    typeOfConcern: 'Suspicious Runoff',
    observationDate: '2026-03-30',
    description: 'Municipal stormwater outfall discharging turbid runoff during routine canal cleaning.',
    status: 'Triaged',
    submittedAt: '2026-03-30T14:20:00Z',
    isVerified: false,
  },
];

// Helper to compute statistics for anomaly detection
function computeStats(values: number[]) {
  if (values.length === 0) return { mean: 0, std: 0, q1: 0, q3: 0, iqr: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / sorted.length;
  const variance =
    sorted.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) /
    (sorted.length > 1 ? sorted.length - 1 : 1);
  const std = Math.sqrt(variance);

  const getPercentile = (p: number) => {
    const idx = (sorted.length - 1) * p;
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    const weight = idx - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  };

  const q1 = getPercentile(0.25);
  const q3 = getPercentile(0.75);
  const iqr = q3 - q1;

  return { mean, std, q1, q3, iqr };
}

// CPCB Anomaly & Classification Screening
function runAnomalyDetection(readings: Reading[], thresholds: ThresholdConfig): Reading[] {
  const phVals = readings.map((r) => r.ph).filter((v) => typeof v === 'number' && !isNaN(v));
  const doVals = readings.map((r) => r.dissolved_oxygen).filter((v) => typeof v === 'number' && !isNaN(v));
  const bodVals = readings.map((r) => r.bod_mg_l).filter((v) => typeof v === 'number' && !isNaN(v));
  const turbVals = readings.map((r) => r.turbidity).filter((v): v is number => typeof v === 'number' && !isNaN(v));
  const tdsVals = readings.map((r) => r.tds).filter((v) => typeof v === 'number' && !isNaN(v));

  const stats = {
    ph: computeStats(phVals),
    do: computeStats(doVals),
    bod: computeStats(bodVals),
    turb: computeStats(turbVals),
    tds: computeStats(tdsVals),
  };

  return readings.map((r) => {
    const reasons: string[] = [];
    const zScores: Record<string, number> = {};
    let isSevere = false;

    // 1. Dissolved Oxygen Checks (CPCB criteria: DO >= 5.0 for Class B Bathing)
    if (r.dissolved_oxygen < thresholds.dissolved_oxygen.min) {
      reasons.push(
        `Dissolved Oxygen ${r.dissolved_oxygen.toFixed(2)} mg/L is below CPCB Bathing criteria (${thresholds.dissolved_oxygen.min} mg/L)`
      );
      if (r.dissolved_oxygen < 3.5) isSevere = true;
    }
    if (stats.do.std > 0) {
      const z = (r.dissolved_oxygen - stats.do.mean) / stats.do.std;
      zScores.dissolved_oxygen = Number(z.toFixed(2));
    }

    // 2. Biochemical Oxygen Demand (CPCB criteria: BOD <= 3.0 for Class B Bathing)
    if (r.bod_mg_l > thresholds.bod.max) {
      reasons.push(
        `BOD ${r.bod_mg_l.toFixed(2)} mg/L exceeds CPCB Bathing threshold (${thresholds.bod.max} mg/L)`
      );
      if (r.bod_mg_l > 8.0) isSevere = true;
    }
    if (stats.bod.std > 0) {
      const z = (r.bod_mg_l - stats.bod.mean) / stats.bod.std;
      zScores.bod = Number(z.toFixed(2));
      if (z > thresholds.zScoreThreshold) {
        reasons.push(`BOD Z-score +${z.toFixed(2)} indicates significant organic loading`);
      }
    }

    // 3. pH Checks (CPCB standard: 6.5 - 8.5)
    if (r.ph < thresholds.ph.min) {
      reasons.push(`pH ${r.ph.toFixed(2)} is below minimum CPCB threshold (${thresholds.ph.min})`);
      if (r.ph < 6.0) isSevere = true;
    } else if (r.ph > thresholds.ph.max) {
      reasons.push(`pH ${r.ph.toFixed(2)} exceeds maximum CPCB threshold (${thresholds.ph.max})`);
      if (r.ph > 9.0) isSevere = true;
    }
    if (stats.ph.std > 0) {
      const z = (r.ph - stats.ph.mean) / stats.ph.std;
      zScores.ph = Number(z.toFixed(2));
    }

    // 4. Turbidity Checks
    if (r.turbidity !== undefined && r.turbidity > thresholds.turbidity.max) {
      reasons.push(`Turbidity ${r.turbidity.toFixed(1)} NTU exceeds benchmark (${thresholds.turbidity.max} NTU)`);
    }

    // 5. COD Checks
    if (r.cod_mg_l !== undefined && r.cod_mg_l > thresholds.cod.max) {
      reasons.push(`COD ${r.cod_mg_l.toFixed(1)} mg/L exceeds industrial effluent envelope (${thresholds.cod.max} mg/L)`);
      isSevere = true;
    }

    // 6. Nitrate Checks
    if (r.nitrate_mg_l !== undefined && r.nitrate_mg_l > thresholds.nitrate.max) {
      reasons.push(`Nitrate ${r.nitrate_mg_l.toFixed(1)} mg/L exceeds drinking guideline (${thresholds.nitrate.max} mg/L)`);
    }

    // Determine status
    let status: Reading['status'] = r.status;
    if (r.status !== 'Reviewed' && r.status !== 'Needs Further Investigation') {
      if (reasons.length > 0) {
        status = isSevere ? 'High Priority' : 'Needs Review';
      } else {
        status = 'Normal';
      }
    }

    return {
      ...r,
      status,
      anomaly_reasons: reasons,
      z_scores: zScores,
      is_illustrative: false,
    };
  });
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

// In-Memory Caches
interface StationSummaryEntry {
  id: string;
  stationCode: string;
  name: string;
  river: string;
  state: string;
  district: string;
  basin: string;
  lat: number;
  lng: number;
  readingsCount: number;
  latestReading: Reading;
  status: Reading['status'];
  cpcbClass: string;
  hasActiveFlag: boolean;
  source: string;
}

interface RiverSummaryEntry {
  id: string;
  name: string;
  hindiName: string;
  basin: string;
  origin: string;
  outflow: string;
  lengthKm: number;
  states: string[];
  color: string;
  keyStretches: string;
  stationsCount: number;
  readingsCount: number;
  avgDo: number;
  avgBod: number;
  avgPh: number;
  cpcbComplianceRate: number;
  coordinates: [number, number][];
}

interface StateSummaryEntry {
  state: string;
  stationsCount: number;
  riversCount: number;
  readingsCount: number;
  avgDo: number;
  avgBod: number;
  flaggedCount: number;
}

let cachedStationEntries: StationSummaryEntry[] = [];
let cachedRiverEntries: RiverSummaryEntry[] = [];
let cachedStateEntries: StateSummaryEntry[] = [];
let cachedSummary: any = null;
let cachedTrendsGlobal: { trends: any[]; locationComparisons: any[] } = { trends: [], locationComparisons: [] };
let cachedPriorityItems: any[] = [];
let cachedTopLocations: string[] = [];
let cachedRiversList: string[] = [];
let cachedStatesList: string[] = [];

function refreshServerCaches() {
  console.log('[EcoWatch AI] Rebuilding in-memory India river telemetry caches...');
  const t0 = Date.now();

  const stationMap = new Map<string, Reading[]>();
  const riverMap = new Map<string, Reading[]>();
  const stateMap = new Map<string, Reading[]>();

  for (let i = 0; i < readingsStore.length; i++) {
    const r = readingsStore[i];

    // Station grouping
    let sList = stationMap.get(r.location);
    if (!sList) {
      sList = [];
      stationMap.set(r.location, sList);
    }
    sList.push(r);

    // River grouping
    const riv = r.river || 'Ganga River';
    let rList = riverMap.get(riv);
    if (!rList) {
      rList = [];
      riverMap.set(riv, rList);
    }
    rList.push(r);

    // State grouping
    const st = r.state || 'National Reach';
    let stList = stateMap.get(st);
    if (!stList) {
      stList = [];
      stateMap.set(st, stList);
    }
    stList.push(r);
  }

  // 1. Build Station Entries
  const stations: StationSummaryEntry[] = [];
  const priorityList: any[] = [];
  let priIdx = 0;

  stationMap.forEach((recs, loc) => {
    recs.sort((a, b) => (a.timestamp > b.timestamp ? -1 : 1));
    const latest = recs[0];

    const hasFlag = recs.some((r) => r.status === 'High Priority' || r.status === 'Needs Review');
    const stationId = latest.station_id || latest.id;

    stations.push({
      id: stationId,
      stationCode: stationId,
      name: loc,
      river: latest.river || 'Ganga River',
      state: latest.state || 'Uttar Pradesh',
      district: latest.district || '',
      basin: latest.basin || latest.main_basin || 'Ganga Basin',
      lat: latest.latitude,
      lng: latest.longitude,
      readingsCount: recs.length,
      latestReading: latest,
      status: latest.status,
      cpcbClass: latest.cpcb_class || 'Class B',
      hasActiveFlag: hasFlag,
      source: latest.source || 'Central Pollution Control Board (CPCB) - NWMP',
    });

    // Priority Assessment
    const highCount = recs.filter((r) => r.status === 'High Priority').length;
    const reviewCount = recs.filter((r) => r.status === 'Needs Review').length;

    let priorityScore = 20;
    let priorityCategory: 'Review recommended' | 'Further verification needed' | 'Insufficient data' | 'Nominal' = 'Nominal';
    let suggestedNextStep = 'Maintain regular NWMP monthly monitoring cadence.';
    let actionType: 'Check source records' | 'Repeat field measurement' | 'Consult certified environmental laboratory' | 'Calibrate probe sensor' = 'Check source records';

    if (highCount > 0) {
      priorityScore = Math.min(100, 80 + highCount * 6);
      priorityCategory = 'Review recommended';
      suggestedNextStep = 'Conduct multi-point cross-sectional re-sampling and inspect upstream effluent discharge drains.';
      actionType = 'Consult certified environmental laboratory';
    } else if (reviewCount > 0) {
      priorityScore = Math.min(79, 50 + reviewCount * 5);
      priorityCategory = 'Further verification needed';
      suggestedNextStep = 'Check optical DO probe calibration and verify river flow regime at barrage upstream.';
      actionType = 'Repeat field measurement';
    }

    const measurements = ['pH', 'DO', 'BOD', 'Temperature', 'TDS'];
    if (latest.cod_mg_l !== undefined) measurements.push('COD');
    if (latest.turbidity !== undefined) measurements.push('Turbidity');
    if (latest.nitrate_mg_l !== undefined) measurements.push('Nitrate');

    const allReasons = Array.from(new Set(recs.flatMap((r) => r.anomaly_reasons || [])));

    priorityList.push({
      id: `IND-PRI-${100 + priIdx++}`,
      location: loc,
      river: latest.river || 'Ganga River',
      state: latest.state || 'Uttar Pradesh',
      stationId,
      latitude: latest.latitude,
      longitude: latest.longitude,
      basin: latest.basin || `${latest.river} Basin`,
      priorityCategory,
      priorityScore,
      samplingDate: latest.timestamp,
      availableMeasurements: measurements,
      dataCompletenessPct: Math.round((measurements.length / 8) * 100),
      triggeredRules: allReasons.slice(0, 3),
      mlAnomalyDetected: false,
      suggestedNextStep,
      recommendedActionType: actionType,
      latestReading: latest,
    });
  });

  stations.sort((a, b) => a.name.localeCompare(b.name));
  cachedStationEntries = stations;

  priorityList.sort((a, b) => b.priorityScore - a.priorityScore);
  cachedPriorityItems = priorityList;

  // 2. Build River Entries
  const riverEntries: RiverSummaryEntry[] = [];
  const knownPathsMap = new Map<string, IndianRiverPath>();
  INDIAN_RIVERS.forEach((p) => knownPathsMap.set(p.name.toLowerCase(), p));

  riverMap.forEach((recs, rName) => {
    const pathInfo = knownPathsMap.get(rName.toLowerCase()) || {
      id: rName.toLowerCase().replace(/\s+/g, '-'),
      name: rName,
      hindiName: rName,
      basin: `${rName} Basin`,
      origin: 'Himalayan / Peninsular Plateau Catchment',
      outflow: 'Inland Drainage / Ocean',
      lengthKm: 500,
      states: Array.from(new Set(recs.map((r) => r.state).filter((s): s is string => Boolean(s)))),
      color: '#0284C7',
      keyStretches: 'Representative CPCB Monitoring Reach',
      coordinates: recs.map((r) => [r.latitude, r.longitude] as [number, number]),
    };

    const stCount = new Set(recs.map((r) => r.location)).size;
    const avgDo = Number((recs.reduce((acc, r) => acc + r.dissolved_oxygen, 0) / recs.length).toFixed(2));
    const avgBod = Number((recs.reduce((acc, r) => acc + r.bod_mg_l, 0) / recs.length).toFixed(2));
    const avgPh = Number((recs.reduce((acc, r) => acc + r.ph, 0) / recs.length).toFixed(2));

    const compliantCount = recs.filter((r) => r.dissolved_oxygen >= 5.0 && r.bod_mg_l <= 3.0).length;
    const complianceRate = Math.round((compliantCount / recs.length) * 100);

    riverEntries.push({
      ...pathInfo,
      stationsCount: stCount,
      readingsCount: recs.length,
      avgDo,
      avgBod,
      avgPh,
      cpcbComplianceRate: complianceRate,
    });
  });

  riverEntries.sort((a, b) => b.stationsCount - a.stationsCount);
  cachedRiverEntries = riverEntries;
  cachedRiversList = riverEntries.map((r) => r.name);

  // 3. Build State Entries
  const stateEntries: StateSummaryEntry[] = [];
  stateMap.forEach((recs, stName) => {
    const stStations = new Set(recs.map((r) => r.location)).size;
    const stRivers = new Set(recs.map((r) => r.river)).size;
    const avgDo = Number((recs.reduce((acc, r) => acc + r.dissolved_oxygen, 0) / recs.length).toFixed(2));
    const avgBod = Number((recs.reduce((acc, r) => acc + r.bod_mg_l, 0) / recs.length).toFixed(2));
    const flagged = recs.filter((r) => r.status === 'High Priority' || r.status === 'Needs Review').length;

    stateEntries.push({
      state: stName,
      stationsCount: stStations,
      riversCount: stRivers,
      readingsCount: recs.length,
      avgDo,
      avgBod,
      flaggedCount: flagged,
    });
  });

  stateEntries.sort((a, b) => b.stationsCount - a.stationsCount);
  cachedStateEntries = stateEntries;
  cachedStatesList = stateEntries.map((s) => s.state);

  // 4. Top station location strings for selects
  cachedTopLocations = stations.map((s) => s.name);

  // 5. Parameter Stats & Overall Summary
  let phSum = 0, phMin = Infinity, phMax = -Infinity;
  let doSum = 0, doMin = Infinity, doMax = -Infinity;
  let bodSum = 0, bodMin = Infinity, bodMax = -Infinity;
  let codSum = 0, codCount = 0, codMin = Infinity, codMax = -Infinity;
  let turbSum = 0, turbCount = 0, turbMin = Infinity, turbMax = -Infinity;
  let nitrateSum = 0, nitCount = 0, nitMin = Infinity, nitMax = -Infinity;
  let tempSum = 0, tempMin = Infinity, tempMax = -Infinity;
  let tdsSum = 0, tdsMin = Infinity, tdsMax = -Infinity;
  let condSum = 0, condCount = 0, condMin = Infinity, condMax = -Infinity;

  let flaggedTotal = 0;
  let highTotal = 0;
  let normalTotal = 0;
  let reviewedTotal = 0;
  let latestDate = '';

  for (let i = 0; i < readingsStore.length; i++) {
    const r = readingsStore[i];
    if (r.status === 'Needs Review' || r.status === 'High Priority' || r.status === 'Needs Further Investigation') flaggedTotal++;
    if (r.status === 'High Priority') highTotal++;
    if (r.status === 'Normal') normalTotal++;
    if (r.status === 'Reviewed') reviewedTotal++;

    if (!latestDate || r.timestamp > latestDate) latestDate = r.timestamp;

    phSum += r.ph;
    if (r.ph < phMin) phMin = r.ph;
    if (r.ph > phMax) phMax = r.ph;

    doSum += r.dissolved_oxygen;
    if (r.dissolved_oxygen < doMin) doMin = r.dissolved_oxygen;
    if (r.dissolved_oxygen > doMax) doMax = r.dissolved_oxygen;

    bodSum += r.bod_mg_l;
    if (r.bod_mg_l < bodMin) bodMin = r.bod_mg_l;
    if (r.bod_mg_l > bodMax) bodMax = r.bod_mg_l;

    if (r.cod_mg_l !== undefined) {
      codSum += r.cod_mg_l; codCount++;
      if (r.cod_mg_l < codMin) codMin = r.cod_mg_l;
      if (r.cod_mg_l > codMax) codMax = r.cod_mg_l;
    }

    if (r.turbidity !== undefined) {
      turbSum += r.turbidity; turbCount++;
      if (r.turbidity < turbMin) turbMin = r.turbidity;
      if (r.turbidity > turbMax) turbMax = r.turbidity;
    }

    if (r.nitrate_mg_l !== undefined) {
      nitrateSum += r.nitrate_mg_l; nitCount++;
      if (r.nitrate_mg_l < nitMin) nitMin = r.nitrate_mg_l;
      if (r.nitrate_mg_l > nitMax) nitMax = r.nitrate_mg_l;
    }

    tempSum += r.temperature;
    if (r.temperature < tempMin) tempMin = r.temperature;
    if (r.temperature > tempMax) tempMax = r.temperature;

    tdsSum += r.tds;
    if (r.tds < tdsMin) tdsMin = r.tds;
    if (r.tds > tdsMax) tdsMax = r.tds;

    if (r.conductivity_us_cm !== undefined) {
      condSum += r.conductivity_us_cm; condCount++;
      if (r.conductivity_us_cm < condMin) condMin = r.conductivity_us_cm;
      if (r.conductivity_us_cm > condMax) condMax = r.conductivity_us_cm;
    }
  }

  const N = readingsStore.length || 1;

  cachedSummary = {
    totalReadings: readingsStore.length,
    totalStations: cachedStationEntries.length,
    totalRivers: cachedRiverEntries.length,
    totalStates: cachedStateEntries.length,
    locationsMonitored: cachedStationEntries.length,
    locationsList: cachedTopLocations.slice(0, 100),
    statesList: cachedStateEntries,
    riversList: cachedRiverEntries.map((r) => ({
      river: r.name,
      count: r.readingsCount,
      stationsCount: r.stationsCount,
      basin: r.basin,
      avgDo: r.avgDo,
      avgBod: r.avgBod,
      avgPh: r.avgPh,
      cpcbStatus: r.cpcbComplianceRate >= 70 ? 'Satisfactory' : 'Impaired Reach',
    })),
    parametersList: [
      'pH',
      'Dissolved Oxygen (DO)',
      'Biochemical Oxygen Demand (BOD)',
      'Chemical Oxygen Demand (COD)',
      'Turbidity',
      'Nitrate',
      'Water Temperature',
      'Total Dissolved Solids (TDS)',
    ],
    latestObservationDate: latestDate || undefined,
    dataSourceName: 'Central Pollution Control Board (CPCB) - National Water Quality Monitoring Programme (NWMP) / India-WRIS',
    flaggedReadings: flaggedTotal,
    highPriorityCount: highTotal,
    reviewedCount: reviewedTotal,
    normalCount: normalTotal,
    anomalyRate: Number(((flaggedTotal / N) * 100).toFixed(1)),
    locationsRequiringFollowUp: cachedPriorityItems.filter((p) => p.priorityCategory !== 'Nominal').length,
    recentObservationsCount: readingsStore.filter((r) => r.timestamp.startsWith('2026')).length,
    latestMeasurement: readingsStore[readingsStore.length - 1] || null,
    parameterStats: {
      ph: { avg: Number((phSum / N).toFixed(2)), min: phMin, max: phMax },
      dissolved_oxygen: { avg: Number((doSum / N).toFixed(2)), min: doMin, max: doMax },
      bod: { avg: Number((bodSum / N).toFixed(2)), min: bodMin, max: bodMax },
      cod: { avg: codCount > 0 ? Number((codSum / codCount).toFixed(1)) : 0, min: codMin !== Infinity ? codMin : 0, max: codMax !== -Infinity ? codMax : 0 },
      turbidity: { avg: turbCount > 0 ? Number((turbSum / turbCount).toFixed(1)) : 0, min: turbMin !== Infinity ? turbMin : 0, max: turbMax !== -Infinity ? turbMax : 0 },
      nitrate: { avg: nitCount > 0 ? Number((nitrateSum / nitCount).toFixed(2)) : 0, min: nitMin !== Infinity ? nitMin : 0, max: nitMax !== -Infinity ? nitMax : 0 },
      temperature: { avg: Number((tempSum / N).toFixed(1)), min: tempMin, max: tempMax },
      tds: { avg: Number((tdsSum / N).toFixed(0)), min: tdsMin, max: tdsMax },
      conductivity: { avg: condCount > 0 ? Number((condSum / condCount).toFixed(0)) : 0, min: condMin !== Infinity ? condMin : 0, max: condMax !== -Infinity ? condMax : 0 },
    },
    cpcbCriteriaNotice: 'CPCB Designated Best Use Criteria: Class B (Outdoor Bathing) requires DO >= 5.0 mg/L, BOD <= 3.0 mg/L, and pH 6.5–8.5.',
    isIllustrativeData: false,
  };

  // 6. Chronological Trend Samples
  const chronoSorted = [...readingsStore].sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
  const step = Math.max(1, Math.floor(chronoSorted.length / 60));
  const trendSamples: any[] = [];
  for (let i = 0; i < chronoSorted.length; i += step) {
    const r = chronoSorted[i];
    trendSamples.push({
      id: r.id,
      timestamp: r.timestamp,
      date: r.timestamp.slice(0, 10),
      dateTime: r.timestamp.slice(0, 16).replace('T', ' '),
      location: r.location,
      river: r.river,
      ph: r.ph,
      dissolved_oxygen: r.dissolved_oxygen,
      bod_mg_l: r.bod_mg_l,
      cod_mg_l: r.cod_mg_l ?? null,
      turbidity: r.turbidity ?? null,
      tds: r.tds,
      temperature: r.temperature,
      nitrate_mg_l: r.nitrate_mg_l ?? null,
      status: r.status,
    });
  }

  // Top 15 location comparisons
  const top15 = cachedStationEntries.slice(0, 15).map((st) => {
    const recs = stationMap.get(st.name) || [st.latestReading];
    const avgPh = Number((recs.reduce((a, b) => a + b.ph, 0) / recs.length).toFixed(2));
    const avgDo = Number((recs.reduce((a, b) => a + b.dissolved_oxygen, 0) / recs.length).toFixed(2));
    const avgBod = Number((recs.reduce((a, b) => a + b.bod_mg_l, 0) / recs.length).toFixed(2));
    const avgTurb = Number((recs.reduce((a, b) => a + (b.turbidity || 0), 0) / recs.length).toFixed(1));
    const avgTds = Math.round(recs.reduce((a, b) => a + b.tds, 0) / recs.length);
    const avgTemp = Number((recs.reduce((a, b) => a + b.temperature, 0) / recs.length).toFixed(1));
    const avgNit = Number((recs.reduce((a, b) => a + (b.nitrate_mg_l || 0), 0) / recs.length).toFixed(2));

    return {
      location: st.name,
      river: st.river,
      avgPh,
      avgDo,
      avgBod,
      avgTurbidity: avgTurb,
      avgTds,
      avgTemp,
      avgNitrate: avgNit,
      readingsCount: recs.length,
    };
  });

  cachedTrendsGlobal = {
    trends: trendSamples,
    locationComparisons: top15,
  };

  console.log(`[EcoWatch AI] Indian Telemetry Caches built in ${Date.now() - t0}ms (${cachedStationEntries.length} stations, ${cachedRiverEntries.length} rivers, ${cachedStateEntries.length} states).`);
}

function loadInitialSampleData() {
  const indiaCsvPath = path.join(process.cwd(), 'data', 'india_cpcb_river_water_quality.csv');
  const fallbackCsvPath = path.join(process.cwd(), 'data', 'cpcb_andhra_pradesh_water_quality.csv');

  const csvPath = fs.existsSync(indiaCsvPath) ? indiaCsvPath : fallbackCsvPath;
  console.log(`[EcoWatch AI] Loading Indian River Water Quality Dataset from: ${csvPath}`);

  if (fs.existsSync(csvPath)) {
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.trim().split('\n');
    if (lines.length > 1) {
      const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().trim());
      const rawReadings: Reading[] = [];

      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const cols = parseCSVLine(lines[i]);
        const obj: any = {};
        headers.forEach((h, idx) => {
          obj[h] = cols[idx];
        });

        const lat = parseFloat(obj.latitude);
        const lng = parseFloat(obj.longitude);

        // Strict India Bounding Box Validation
        // Lat: 6.5° N - 37.5° N, Lng: 68.0° E - 97.5° E
        const isInsideIndia =
          !isNaN(lat) &&
          !isNaN(lng) &&
          lat >= 6.5 &&
          lat <= 37.5 &&
          lng >= 68.0 &&
          lng <= 97.5;

        if (!isInsideIndia) continue;

        const ph = parseFloat(obj.ph) || 7.5;
        const doVal = parseFloat(obj.dissolved_oxygen_mg_l || obj.dissolved_oxygen) || 6.5;
        const bodVal = parseFloat(obj.bod_mg_l || obj.bod) || 2.5;

        const reading: Reading = {
          id: obj.station_id || obj.id || `IND-${1000 + i}`,
          station_id: obj.station_id || obj.id || undefined,
          location: obj.location || 'River Monitoring Station',
          river: obj.river || obj.water_body || 'Ganga River',
          state: obj.state || 'National Reach',
          district: obj.district || undefined,
          water_body: obj.river || obj.water_body || 'Ganga River',
          basin: obj.basin || obj.main_basin || `${obj.river || 'Ganga'} Basin`,
          timestamp: obj.sample_date || obj.timestamp || new Date().toISOString(),
          latitude: lat,
          longitude: lng,
          ph,
          dissolved_oxygen: doVal,
          bod_mg_l: bodVal,
          cod_mg_l: obj.cod_mg_l ? parseFloat(obj.cod_mg_l) : undefined,
          turbidity: obj.turbidity_ntu ? parseFloat(obj.turbidity_ntu) : (obj.turbidity ? parseFloat(obj.turbidity) : undefined),
          nitrate_mg_l: obj.nitrate_mg_l ? parseFloat(obj.nitrate_mg_l) : undefined,
          temperature: parseFloat(obj.temperature_c || obj.temperature) || 24.5,
          tds: parseFloat(obj.tds_mg_l || obj.tds) || 280,
          conductivity_us_cm: obj.conductivity_us_cm ? parseFloat(obj.conductivity_us_cm) : undefined,
          cpcb_class: (obj.cpcb_class as any) || (doVal >= 5.0 && bodVal <= 3.0 ? 'Class B' : 'Below Class E'),
          data_quality: obj.data_quality || 'Verified CPCB Lab Assay',
          source: obj.source || 'Central Pollution Control Board (CPCB) - NWMP / Ministry of Jal Shakti',
          status: (obj.status as any) || 'Normal',
          review_notes: obj.review_notes || '',
          is_illustrative: false,
        };

        rawReadings.push(reading);
      }

      console.log(`[EcoWatch AI] Loaded ${rawReadings.length} verified Indian river records.`);
      readingsStore = runAnomalyDetection(rawReadings, currentThresholds);
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Serve static assets from public directory (images, icons, etc.)
  const publicPath = path.join(__dirname, 'public');
  if (fs.existsSync(publicPath)) {
    app.use(express.static(publicPath));
  }

  // Load verified Indian data and build caches
  loadInitialSampleData();
  refreshServerCaches();

  // 1. GET /api/health
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'EcoWatch AI — India River Water Quality Monitoring Platform',
      version: '4.0.0-india-cpcb',
      scope: 'National River Water Quality Network (India Only)',
      dataSource: 'Central Pollution Control Board (CPCB) - NWMP / Ministry of Jal Shakti',
      totalRecords: readingsStore.length,
      totalStations: cachedStationEntries.length,
      totalRivers: cachedRiverEntries.length,
      totalStates: cachedStateEntries.length,
      timestamp: new Date().toISOString(),
    });
  });

  // 2. GET /api/summary
  app.get('/api/summary', (_req: Request, res: Response) => {
    try {
      if (!cachedSummary) refreshServerCaches();
      res.json(cachedSummary);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to generate summary', details: err.message });
    }
  });

  // 3. GET /api/states
  app.get('/api/states', (_req: Request, res: Response) => {
    res.json({
      totalStates: cachedStateEntries.length,
      states: cachedStateEntries,
    });
  });

  // 4. GET /api/rivers
  app.get('/api/rivers', (_req: Request, res: Response) => {
    res.json({
      totalRivers: cachedRiverEntries.length,
      rivers: cachedRiverEntries,
    });
  });

  // 5. GET /api/stations
  app.get('/api/stations', (req: Request, res: Response) => {
    try {
      const {
        search = '',
        state = 'all',
        river = 'all',
        district = 'all',
        status = 'all',
        cpcbClass = 'all',
        page = '1',
        limit = '20',
      } = req.query as Record<string, string>;

      let filtered = cachedStationEntries;

      if (state && state !== 'all') {
        const sLower = state.toLowerCase();
        filtered = filtered.filter((s) => s.state.toLowerCase() === sLower);
      }

      if (river && river !== 'all') {
        const rLower = river.toLowerCase();
        filtered = filtered.filter((s) => s.river.toLowerCase() === rLower);
      }

      if (district && district !== 'all') {
        const dLower = district.toLowerCase();
        filtered = filtered.filter((s) => s.district.toLowerCase() === dLower);
      }

      if (status && status !== 'all') {
        if (status === 'flagged') {
          filtered = filtered.filter((s) => s.hasActiveFlag);
        } else {
          filtered = filtered.filter((s) => s.status.toLowerCase() === status.toLowerCase());
        }
      }

      if (cpcbClass && cpcbClass !== 'all') {
        filtered = filtered.filter((s) => s.cpcbClass.toLowerCase() === cpcbClass.toLowerCase());
      }

      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.river.toLowerCase().includes(q) ||
            s.state.toLowerCase().includes(q) ||
            s.id.toLowerCase().includes(q) ||
            (s.district && s.district.toLowerCase().includes(q))
        );
      }

      const totalStations = filtered.length;
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
      const totalPages = Math.ceil(totalStations / pageSize) || 1;
      const startIndex = (pageNum - 1) * pageSize;
      const paginated = filtered.slice(startIndex, startIndex + pageSize);

      res.json({
        stations: paginated,
        totalStations,
        page: pageNum,
        limit: pageSize,
        totalPages,
        states: cachedStatesList,
        rivers: cachedRiversList,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to retrieve stations', details: err.message });
    }
  });

  // 6. GET /api/stations/map (Lightweight markers & active river paths)
  app.get('/api/stations/map', (req: Request, res: Response) => {
    try {
      const { state = 'all', river = 'all', status = 'all', search = '' } = req.query as Record<string, string>;

      let filtered = cachedStationEntries;

      if (state && state !== 'all') {
        const sLower = state.toLowerCase();
        filtered = filtered.filter((s) => s.state.toLowerCase() === sLower);
      }

      if (river && river !== 'all') {
        const rLower = river.toLowerCase();
        filtered = filtered.filter((s) => s.river.toLowerCase() === rLower);
      }

      if (status && status !== 'all') {
        if (status === 'flagged') filtered = filtered.filter((s) => s.hasActiveFlag);
        else filtered = filtered.filter((s) => s.status.toLowerCase() === status.toLowerCase());
      }

      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.river.toLowerCase().includes(q) ||
            s.state.toLowerCase().includes(q)
        );
      }

      const markers = filtered.map((s) => ({
        id: s.id,
        code: s.stationCode,
        name: s.name,
        river: s.river,
        state: s.state,
        district: s.district,
        basin: s.basin,
        lat: s.lat,
        lng: s.lng,
        status: s.status,
        cpcbClass: s.cpcbClass,
        isFlagged: s.hasActiveFlag,
        sampleDate: s.latestReading.timestamp,
        ph: s.latestReading.ph,
        do: s.latestReading.dissolved_oxygen,
        bod: s.latestReading.bod_mg_l,
        cod: s.latestReading.cod_mg_l,
        turbidity: s.latestReading.turbidity,
        nitrate: s.latestReading.nitrate_mg_l,
        temp: s.latestReading.temperature,
        tds: s.latestReading.tds,
        flagReasons: s.latestReading.anomaly_reasons || [],
        latestReading: s.latestReading,
      }));

      // Relevant River Paths for GIS overlay
      let relevantRivers = cachedRiverEntries;
      if (river && river !== 'all') {
        relevantRivers = cachedRiverEntries.filter((r) => r.name.toLowerCase() === river.toLowerCase());
      }

      res.json({
        totalMarkers: markers.length,
        markers,
        riverPaths: relevantRivers.map((r) => ({
          name: r.name,
          hindiName: r.hindiName,
          color: r.color,
          coordinates: r.coordinates,
          states: r.states,
          avgDo: r.avgDo,
          avgBod: r.avgBod,
          cpcbComplianceRate: r.cpcbComplianceRate,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to retrieve map markers', details: err.message });
    }
  });

  // 7. GET /api/water-quality & GET /api/readings
  const handleReadings = (req: Request, res: Response) => {
    try {
      const {
        search = '',
        state = '',
        river = '',
        status = '',
        cpcbClass = '',
        parameter = '',
        startDate = '',
        endDate = '',
        sortBy = 'timestamp',
        sortOrder = 'desc',
        page = '1',
        limit = '10',
      } = req.query as Record<string, string>;

      let filtered = readingsStore;

      if (state && state !== 'all') {
        const sLower = state.toLowerCase();
        filtered = filtered.filter((r) => r.state && r.state.toLowerCase() === sLower);
      }

      if (river && river !== 'all') {
        const rLower = river.toLowerCase();
        filtered = filtered.filter((r) => r.river && r.river.toLowerCase() === rLower);
      }

      if (status && status !== 'all') {
        const sLower = status.toLowerCase();
        filtered = filtered.filter((r) => r.status.toLowerCase() === sLower);
      }

      if (cpcbClass && cpcbClass !== 'all') {
        filtered = filtered.filter((r) => r.cpcb_class && r.cpcb_class.toLowerCase() === cpcbClass.toLowerCase());
      }

      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter(
          (r) =>
            r.location.toLowerCase().includes(q) ||
            (r.river && r.river.toLowerCase().includes(q)) ||
            (r.state && r.state.toLowerCase().includes(q)) ||
            r.id.toLowerCase().includes(q)
        );
      }

      if (startDate) {
        const start = new Date(startDate).getTime();
        filtered = filtered.filter((r) => new Date(r.timestamp).getTime() >= start);
      }

      if (endDate) {
        const end = new Date(endDate).getTime();
        filtered = filtered.filter((r) => new Date(r.timestamp).getTime() <= end);
      }

      const total = filtered.length;
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
      const totalPages = Math.ceil(total / pageSize) || 1;
      const startIndex = (pageNum - 1) * pageSize;

      const sorted = [...filtered].sort((a: any, b: any) => {
        let valA = a[sortBy];
        let valB = b[sortBy];
        if (sortBy === 'timestamp') {
          valA = new Date(valA).getTime();
          valB = new Date(valB).getTime();
        }
        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;
        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });

      const paginated = sorted.slice(startIndex, startIndex + pageSize);

      res.json({
        readings: paginated,
        total,
        totalStations: cachedStationEntries.length,
        page: pageNum,
        pageSize,
        totalPages,
        states: cachedStatesList,
        rivers: cachedRiversList,
        locations: cachedTopLocations,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to retrieve readings', details: err.message });
    }
  };

  app.get('/api/water-quality', handleReadings);
  app.get('/api/readings', handleReadings);

  // 8. GET /api/water-quality/trends & GET /api/trends
  const handleTrends = (req: Request, res: Response) => {
    try {
      const { location, river, state } = req.query as Record<string, string>;

      if ((!location || location === 'all') && (!river || river === 'all') && (!state || state === 'all')) {
        return res.json(cachedTrendsGlobal);
      }

      let matching = readingsStore;

      if (location && location !== 'all') {
        const locLower = location.toLowerCase();
        matching = matching.filter((r) => r.location.toLowerCase() === locLower);
      } else if (river && river !== 'all') {
        const rLower = river.toLowerCase();
        matching = matching.filter((r) => r.river && r.river.toLowerCase() === rLower);
      } else if (state && state !== 'all') {
        const sLower = state.toLowerCase();
        matching = matching.filter((r) => r.state && r.state.toLowerCase() === sLower);
      }

      const sorted = [...matching].sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1)).slice(0, 100);

      const trendData = sorted.map((r) => ({
        id: r.id,
        timestamp: r.timestamp,
        date: r.timestamp.slice(0, 10),
        dateTime: r.timestamp.slice(0, 16).replace('T', ' '),
        location: r.location,
        river: r.river,
        ph: r.ph,
        dissolved_oxygen: r.dissolved_oxygen,
        bod_mg_l: r.bod_mg_l,
        cod_mg_l: r.cod_mg_l ?? null,
        turbidity: r.turbidity ?? null,
        tds: r.tds,
        temperature: r.temperature,
        nitrate_mg_l: r.nitrate_mg_l ?? null,
        status: r.status,
      }));

      res.json({
        trends: trendData,
        locationComparisons: cachedTrendsGlobal.locationComparisons,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to retrieve trends', details: err.message });
    }
  };

  app.get('/api/water-quality/trends', handleTrends);
  app.get('/api/trends', handleTrends);

  // 9. GET /api/priority & GET /api/alerts
  app.get('/api/priority', (req: Request, res: Response) => {
    try {
      const { category = 'all', page = '1', limit = '50' } = req.query as Record<string, string>;
      let items = cachedPriorityItems;
      if (category && category !== 'all') {
        items = items.filter((p) => p.priorityCategory === category);
      }

      const total = items.length;
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
      const startIndex = (pageNum - 1) * pageSize;
      const paginated = items.slice(startIndex, startIndex + pageSize);

      res.json({
        total,
        page: pageNum,
        pageSize,
        totalPages: Math.ceil(total / pageSize) || 1,
        items: paginated,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to retrieve priorities', details: err.message });
    }
  });

  app.get('/api/alerts', (req: Request, res: Response) => {
    const alerts = cachedPriorityItems
      .filter((p) => p.priorityCategory !== 'Nominal')
      .slice(0, 50)
      .map((p) => ({
        id: p.id,
        location: p.location,
        river: p.river,
        state: p.state,
        timestamp: p.samplingDate,
        status: p.latestReading?.status || 'Needs Review',
        reasons: p.triggeredRules || [],
        reading: p.latestReading,
        review_notes: p.suggestedNextStep,
        z_scores: {},
      }));

    res.json({ totalAlerts: alerts.length, alerts });
  });

  // 10. GET & PUT /api/thresholds
  app.get('/api/thresholds', (_req: Request, res: Response) => {
    res.json(currentThresholds);
  });

  app.put('/api/thresholds', (req: Request, res: Response) => {
    try {
      const newThresholds = req.body;
      if (newThresholds.ph && newThresholds.ph.min >= newThresholds.ph.max) {
        return res.status(400).json({ error: 'pH minimum must be strictly less than pH maximum.' });
      }

      currentThresholds = { ...currentThresholds, ...newThresholds };
      readingsStore = runAnomalyDetection(readingsStore, currentThresholds);
      refreshServerCaches();

      res.json({
        success: true,
        thresholds: currentThresholds,
        message: 'CPCB screening thresholds updated and monitoring classifications recomputed.',
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to update thresholds', details: err.message });
    }
  });

  // 11. Community Reports (POST /api/reports, GET /api/reports)
  app.get('/api/reports', (_req: Request, res: Response) => {
    res.json({ reports: communityReportsStore, total: communityReportsStore.length });
  });

  app.post('/api/reports', (req: Request, res: Response) => {
    try {
      const { location, waterBodyName, state, typeOfConcern, observationDate, description } = req.body;

      if (!location || !typeOfConcern || !description) {
        return res.status(400).json({
          error: 'Location, type of concern, and description are required fields.',
        });
      }

      const newReport: CommunityReport = {
        id: `IND-REP-${Math.floor(100 + Math.random() * 900)}`,
        location: String(location).trim(),
        waterBodyName: waterBodyName ? String(waterBodyName).trim() : 'Ganga River Basin Reach',
        state: state ? String(state).trim() : 'Uttar Pradesh',
        typeOfConcern: String(typeOfConcern).trim(),
        observationDate: observationDate || new Date().toISOString().split('T')[0],
        description: String(description).trim(),
        status: 'Pending Verification',
        submittedAt: new Date().toISOString(),
        isVerified: false,
      };

      communityReportsStore.unshift(newReport);

      res.status(201).json({
        success: true,
        report: newReport,
        message: 'Your Indian river observation has been submitted for regional verification.',
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to submit report', details: err.message });
    }
  });

  // 12. GET /api/export (Filtered CSV export of Indian River records)
  app.get('/api/export', (req: Request, res: Response) => {
    try {
      const { state, river, status, startDate, endDate } = req.query as Record<string, string>;
      let items = [...readingsStore];

      if (state && state !== 'all') {
        items = items.filter((r) => r.state && r.state.toLowerCase() === state.toLowerCase());
      }
      if (river && river !== 'all') {
        items = items.filter((r) => r.river && r.river.toLowerCase() === river.toLowerCase());
      }
      if (status && status !== 'all') {
        items = items.filter((r) => r.status.toLowerCase() === status.toLowerCase());
      }
      if (startDate) {
        const start = new Date(startDate).getTime();
        items = items.filter((r) => new Date(r.timestamp).getTime() >= start);
      }
      if (endDate) {
        const end = new Date(endDate).getTime();
        items = items.filter((r) => new Date(r.timestamp).getTime() <= end);
      }

      items.sort((a, b) => (a.timestamp > b.timestamp ? -1 : 1));

      const headers = [
        'station_id',
        'location',
        'river',
        'state',
        'district',
        'latitude',
        'longitude',
        'sample_date',
        'ph',
        'dissolved_oxygen_mg_l',
        'bod_mg_l',
        'cod_mg_l',
        'turbidity_ntu',
        'nitrate_mg_l',
        'temperature_c',
        'tds_mg_l',
        'cpcb_class',
        'status',
        'source',
      ];
      const rows = [headers.join(',')];

      items.forEach((r) => {
        rows.push(
          [
            `"${r.station_id || r.id}"`,
            `"${(r.location || '').replace(/"/g, '""')}"`,
            `"${(r.river || '').replace(/"/g, '""')}"`,
            `"${(r.state || '').replace(/"/g, '""')}"`,
            `"${(r.district || '').replace(/"/g, '""')}"`,
            r.latitude.toFixed(6),
            r.longitude.toFixed(6),
            `"${r.timestamp}"`,
            r.ph.toFixed(2),
            r.dissolved_oxygen.toFixed(2),
            r.bod_mg_l.toFixed(2),
            r.cod_mg_l !== undefined ? r.cod_mg_l.toFixed(1) : '',
            r.turbidity !== undefined ? r.turbidity.toFixed(1) : '',
            r.nitrate_mg_l !== undefined ? r.nitrate_mg_l.toFixed(2) : '',
            r.temperature.toFixed(1),
            r.tds,
            `"${r.cpcb_class || 'Class B'}"`,
            `"${r.status}"`,
            `"${(r.source || 'CPCB - NWMP').replace(/"/g, '""')}"`,
          ].join(',')
        );
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="cpcb_india_river_water_quality.csv"');
      res.status(200).send(rows.join('\n'));
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to export CSV', details: err.message });
    }
  });

  // 13. POST /api/reset-sample
  app.post('/api/reset-sample', (_req: Request, res: Response) => {
    currentThresholds = { ...DEFAULT_THRESHOLDS };
    loadInitialSampleData();
    refreshServerCaches();
    res.json({
      success: true,
      message: 'Dataset reset to CPCB National Water Quality Monitoring baseline.',
      count: readingsStore.length,
    });
  });

  // Vite integration
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[EcoWatch AI] India River Quality Platform listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
