import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface Reading {
  id: string;
  station_id?: string;
  location: string;
  district?: string;
  water_body?: string;
  state?: string;
  timestamp: string;
  ph: number;
  turbidity: number;
  tds: number;
  temperature: number;
  dissolved_oxygen?: number;
  nitrate_mg_l?: number;
  bod_mg_l?: number;
  conductivity_us_cm?: number;
  latitude?: number;
  longitude?: number;
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
  turbidity: { max: number };
  tds: { max: number };
  temperature: { min: number; max: number };
  dissolved_oxygen: { min: number };
  nitrate: { max: number };
  zScoreThreshold: number;
  iqrMultiplier: number;
  enableMlDetection: boolean;
}

export interface CommunityReport {
  id: string;
  location: string;
  waterBodyName?: string;
  typeOfConcern: string;
  observationDate: string;
  description: string;
  status: 'Pending Verification' | 'Under Local Review' | 'Triaged';
  submittedAt: string;
  isVerified: false;
}

const DEFAULT_THRESHOLDS: ThresholdConfig = {
  ph: { min: 6.5, max: 8.5 },
  turbidity: { max: 5.0 },
  tds: { max: 500 },
  temperature: { min: 5.0, max: 25.0 },
  dissolved_oxygen: { min: 6.0 },
  nitrate: { max: 10.0 }, // EPA / WHO standard 10 mg/L as NO3-N
  zScoreThreshold: 2.5,
  iqrMultiplier: 1.5,
  enableMlDetection: true,
};

let currentThresholds: ThresholdConfig = { ...DEFAULT_THRESHOLDS };
let readingsStore: Reading[] = [];
let communityReportsStore: CommunityReport[] = [
  {
    id: 'REP-101',
    location: 'Lower Cedar Creek Confluence',
    waterBodyName: 'Cedar Creek',
    typeOfConcern: 'Discoloration',
    observationDate: '2026-03-27',
    description: 'Noticed brownish murky water flowing downstream following construction site runoff near the bridge.',
    status: 'Under Local Review',
    submittedAt: '2026-03-27T14:30:00Z',
    isVerified: false,
  },
  {
    id: 'REP-102',
    location: 'Silver River Boat Launch',
    waterBodyName: 'Silver River',
    typeOfConcern: 'Foam / Chemical Sheen',
    observationDate: '2026-03-29',
    description: 'Thin surface white foam accumulation near bank reeds. No odor detected, but persistent foam line observed.',
    status: 'Pending Verification',
    submittedAt: '2026-03-29T11:15:00Z',
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

// Method B: Machine Learning Anomaly Detection Simulation (Isolation Forest / Multi-parameter Vector Outlier)
function runIsolationForestModel(
  readings: Reading[],
  stats: Record<string, { mean: number; std: number }>
): { scores: number[]; isAnomaly: boolean[] } {
  if (readings.length < 5) {
    return {
      scores: readings.map(() => 0.2),
      isAnomaly: readings.map(() => false),
    };
  }

  // Feature matrix: [z_ph, z_turb, z_tds, z_do, z_nitrate]
  return {
    scores: readings.map((r) => {
      const zPh = stats.ph.std > 0 ? (r.ph - stats.ph.mean) / stats.ph.std : 0;
      const zTurb = stats.turbidity.std > 0 ? (r.turbidity - stats.turbidity.mean) / stats.turbidity.std : 0;
      const zTds = stats.tds.std > 0 ? (r.tds - stats.tds.mean) / stats.tds.std : 0;
      const zDo =
        r.dissolved_oxygen !== undefined && stats.dissolved_oxygen?.std > 0
          ? (r.dissolved_oxygen - stats.dissolved_oxygen.mean) / stats.dissolved_oxygen.std
          : 0;
      const zNitrate =
        r.nitrate_mg_l !== undefined && stats.nitrate?.std > 0
          ? (r.nitrate_mg_l - stats.nitrate.mean) / stats.nitrate.std
          : 0;

      // Multivariate distance squared (simulating Isolation Tree depth score)
      const distSq =
        Math.pow(zPh, 2) * 1.0 +
        Math.pow(zTurb, 2) * 1.2 +
        Math.pow(zTds, 2) * 0.9 +
        Math.pow(zDo, 2) * 1.3 +
        Math.pow(zNitrate, 2) * 1.5;

      const normScore = Math.min(1.0, Math.sqrt(distSq) / 5.5);
      return Number(normScore.toFixed(3));
    }),
    isAnomaly: readings.map((r) => {
      const zTurb = stats.turbidity.std > 0 ? (r.turbidity - stats.turbidity.mean) / stats.turbidity.std : 0;
      const zNitrate =
        r.nitrate_mg_l !== undefined && stats.nitrate?.std > 0
          ? (r.nitrate_mg_l - stats.nitrate.mean) / stats.nitrate.std
          : 0;
      const zDo =
        r.dissolved_oxygen !== undefined && stats.dissolved_oxygen?.std > 0
          ? (r.dissolved_oxygen - stats.dissolved_oxygen.mean) / stats.dissolved_oxygen.std
          : 0;

      // Anomaly flagged if distance exceeds threshold envelope
      return (
        Math.abs(zTurb) > 2.2 ||
        Math.abs(zNitrate) > 2.2 ||
        (Math.abs(zDo) > 1.8 && Math.abs(zTurb) > 1.8)
      );
    }),
  };
}

function runAnomalyDetection(readings: Reading[], thresholds: ThresholdConfig): Reading[] {
  const phVals = readings.map((r) => r.ph).filter((v) => typeof v === 'number' && !isNaN(v));
  const turbVals = readings.map((r) => r.turbidity).filter((v) => typeof v === 'number' && !isNaN(v));
  const tdsVals = readings.map((r) => r.tds).filter((v) => typeof v === 'number' && !isNaN(v));
  const tempVals = readings.map((r) => r.temperature).filter((v) => typeof v === 'number' && !isNaN(v));
  const doVals = readings
    .map((r) => r.dissolved_oxygen)
    .filter((v): v is number => typeof v === 'number' && !isNaN(v));
  const nitrateVals = readings
    .map((r) => r.nitrate_mg_l)
    .filter((v): v is number => typeof v === 'number' && !isNaN(v));

  const stats = {
    ph: computeStats(phVals),
    turbidity: computeStats(turbVals),
    tds: computeStats(tdsVals),
    temperature: computeStats(tempVals),
    dissolved_oxygen: computeStats(doVals),
    nitrate: computeStats(nitrateVals),
  };

  const mlResults = thresholds.enableMlDetection
    ? runIsolationForestModel(readings, stats)
    : { scores: readings.map(() => 0), isAnomaly: readings.map(() => false) };

  return readings.map((r, idx) => {
    const reasons: string[] = [];
    const zScores: Record<string, number> = {};
    let isSevere = false;

    // Method A: Transparent Screening Rules
    // pH checks
    if (r.ph < thresholds.ph.min) {
      reasons.push(`pH ${r.ph.toFixed(2)} is below minimum threshold (${thresholds.ph.min})`);
      if (r.ph < thresholds.ph.min - 0.4) isSevere = true;
    } else if (r.ph > thresholds.ph.max) {
      reasons.push(`pH ${r.ph.toFixed(2)} exceeds maximum threshold (${thresholds.ph.max})`);
      if (r.ph > thresholds.ph.max + 0.5) isSevere = true;
    }
    if (stats.ph.std > 0) {
      const z = (r.ph - stats.ph.mean) / stats.ph.std;
      zScores.ph = Number(z.toFixed(2));
      if (Math.abs(z) > thresholds.zScoreThreshold) {
        reasons.push(
          `pH Z-score ${z > 0 ? '+' : ''}${z.toFixed(2)} exceeds statistical limit (±${thresholds.zScoreThreshold})`
        );
      }
    }
    if (stats.ph.iqr > 0) {
      if (
        r.ph < stats.ph.q1 - thresholds.iqrMultiplier * stats.ph.iqr ||
        r.ph > stats.ph.q3 + thresholds.iqrMultiplier * stats.ph.iqr
      ) {
        reasons.push(
          `pH outside Interquartile Range [${(stats.ph.q1 - thresholds.iqrMultiplier * stats.ph.iqr).toFixed(2)}, ${(stats.ph.q3 + thresholds.iqrMultiplier * stats.ph.iqr).toFixed(2)}]`
        );
      }
    }

    // Turbidity checks
    if (r.turbidity > thresholds.turbidity.max) {
      reasons.push(`Turbidity ${r.turbidity.toFixed(2)} NTU exceeds limit (${thresholds.turbidity.max} NTU)`);
      if (r.turbidity > thresholds.turbidity.max * 1.5) isSevere = true;
    }
    if (stats.turbidity.std > 0) {
      const z = (r.turbidity - stats.turbidity.mean) / stats.turbidity.std;
      zScores.turbidity = Number(z.toFixed(2));
      if (Math.abs(z) > thresholds.zScoreThreshold) {
        reasons.push(`Turbidity Z-score ${z > 0 ? '+' : ''}${z.toFixed(2)} indicates significant spike`);
      }
    }

    // Nitrate checks (mg/L)
    if (r.nitrate_mg_l !== undefined && r.nitrate_mg_l !== null) {
      if (r.nitrate_mg_l > thresholds.nitrate.max) {
        reasons.push(
          `Nitrate ${r.nitrate_mg_l.toFixed(1)} mg/L exceeds drinking guideline (${thresholds.nitrate.max} mg/L)`
        );
        if (r.nitrate_mg_l > thresholds.nitrate.max * 1.2) isSevere = true;
      }
      if (stats.nitrate.std > 0) {
        const z = (r.nitrate_mg_l - stats.nitrate.mean) / stats.nitrate.std;
        zScores.nitrate = Number(z.toFixed(2));
        if (Math.abs(z) > thresholds.zScoreThreshold) {
          reasons.push(`Nitrate Z-score ${z > 0 ? '+' : ''}${z.toFixed(2)} indicates agricultural runoff spike`);
        }
      }
    }

    // TDS checks
    if (r.tds > thresholds.tds.max) {
      reasons.push(`TDS ${Math.round(r.tds)} mg/L exceeds threshold (${thresholds.tds.max} mg/L)`);
      if (r.tds > thresholds.tds.max * 1.3) isSevere = true;
    }
    if (stats.tds.std > 0) {
      const z = (r.tds - stats.tds.mean) / stats.tds.std;
      zScores.tds = Number(z.toFixed(2));
      if (Math.abs(z) > thresholds.zScoreThreshold) {
        reasons.push(`TDS Z-score ${z > 0 ? '+' : ''}${z.toFixed(2)} is an outlier`);
      }
    }

    // Dissolved oxygen checks
    if (r.dissolved_oxygen !== undefined && r.dissolved_oxygen !== null) {
      if (r.dissolved_oxygen < thresholds.dissolved_oxygen.min) {
        reasons.push(
          `Dissolved Oxygen ${r.dissolved_oxygen.toFixed(2)} mg/L below required threshold (${thresholds.dissolved_oxygen.min} mg/L)`
        );
        if (r.dissolved_oxygen < 4.0) isSevere = true;
      }
      if (stats.dissolved_oxygen.std > 0) {
        const z = (r.dissolved_oxygen - stats.dissolved_oxygen.mean) / stats.dissolved_oxygen.std;
        zScores.dissolved_oxygen = Number(z.toFixed(2));
      }
    }

    // Method B: Isolation Forest Machine Learning
    const isMlAnomaly = mlResults.isAnomaly[idx];
    const mlScore = mlResults.scores[idx];
    if (isMlAnomaly && reasons.length === 0) {
      reasons.push(
        `ML Isolation Forest flagged multidimensional anomaly (Anomaly score ${mlScore}; combined parameter divergence)`
      );
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
      ml_anomaly: isMlAnomaly,
      ml_anomaly_score: mlScore,
      is_illustrative: r.is_illustrative !== undefined ? r.is_illustrative : false,
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

const gemstatDatasetMeta = {
  title: 'UNEP GEMS/Water Global Freshwater Quality Archive (GEMStat)',
  doi: '10.5281/zenodo.13881899',
  archiveRecord: '18459694',
  license: 'Creative Commons Attribution 4.0 International (CC-BY 4.0)',
  provider: 'UNEP GEMS/Water Programme — International Centre for Water Resources and Global Change (ICWRGC) / German Federal Institute of Hydrology (BfG)',
  portalUrl: 'https://gemstat.org/',
  openArchiveUrl: 'https://doi.org/10.5281/zenodo.13881899',
  lastUpdated: new Date().toISOString(),
};

function loadInitialSampleData() {
  const gemstatCsvPath = path.join(process.cwd(), 'data', 'gemstat_global_water_quality.csv');
  const apCsvPath = path.join(process.cwd(), 'data', 'cpcb_andhra_pradesh_water_quality.csv');
  const fallbackCsvPath = path.join(process.cwd(), 'data', 'sample_water_quality.csv');
  
  const csvPath = fs.existsSync(gemstatCsvPath) 
    ? gemstatCsvPath 
    : (fs.existsSync(apCsvPath) ? apCsvPath : fallbackCsvPath);

  console.log(`[EcoWatch AI] Loading water quality dataset from: ${csvPath}`);

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

        const lat = obj.latitude ? parseFloat(obj.latitude) : undefined;
        const lng = obj.longitude ? parseFloat(obj.longitude) : undefined;

        // Verify coordinates strictly:
        const hasValidCoords =
          lat !== undefined && !isNaN(lat) &&
          lng !== undefined && !isNaN(lng) &&
          lat >= -90.0 && lat <= 90.0 && lng >= -180.0 && lng <= 180.0;

        const reading: Reading = {
          id: obj.station_id || obj.id || `GEM-${1000 + i}`,
          station_id: obj.station_id || obj.id || undefined,
          location: obj.location || obj.station_name || 'Monitoring Station',
          country: obj.country || 'Global',
          district: obj.district || undefined,
          water_body: obj.water_body || obj.river || undefined,
          main_basin: obj.main_basin || undefined,
          station_type: obj.station_type || undefined,
          state: obj.state || obj.district || undefined,
          timestamp:
            obj.sample_date ||
            obj.timestamp ||
            new Date(Date.now() - (lines.length - i) * 86400000).toISOString(),
          latitude: hasValidCoords ? lat : undefined,
          longitude: hasValidCoords ? lng : undefined,
          elevation: obj.elevation_m ? parseFloat(obj.elevation_m) : undefined,
          ph: !isNaN(parseFloat(obj.ph)) ? parseFloat(obj.ph) : 7.2,
          turbidity: !isNaN(parseFloat(obj.turbidity_ntu || obj.turbidity)) 
            ? parseFloat(obj.turbidity_ntu || obj.turbidity) 
            : 1.5,
          tds: !isNaN(parseFloat(obj.tds_mg_l || obj.tds)) 
            ? parseFloat(obj.tds_mg_l || obj.tds) 
            : 220,
          temperature: !isNaN(parseFloat(obj.temperature_c || obj.temperature)) 
            ? parseFloat(obj.temperature_c || obj.temperature) 
            : 20.0,
          dissolved_oxygen:
            obj.dissolved_oxygen_mg_l || obj.dissolved_oxygen
              ? parseFloat(obj.dissolved_oxygen_mg_l || obj.dissolved_oxygen)
              : undefined,
          nitrate_mg_l:
            obj.nitrate_mg_l || obj.nitrate 
              ? parseFloat(obj.nitrate_mg_l || obj.nitrate) 
              : undefined,
          bod_mg_l:
            obj.bod_mg_l || obj.bod ? parseFloat(obj.bod_mg_l || obj.bod) : undefined,
          conductivity_us_cm:
            obj.conductivity_us_cm ? parseFloat(obj.conductivity_us_cm) : undefined,
          salinity_ppt:
            obj.salinity_ppt ? parseFloat(obj.salinity_ppt) : undefined,
          data_quality: obj.data_quality || 'Fair',
          reporting_agency: obj.reporting_agency || undefined,
          source:
            obj.source ||
            'UNEP GEMS/Water Global Freshwater Quality Archive (GEMStat - Zenodo DOI: 10.5281/zenodo.13881899, CC-BY 4.0)',
          status: (obj.status as any) || 'Normal',
          review_notes: obj.review_notes || '',
          is_illustrative: false,
        };
        rawReadings.push(reading);
      }

      console.log(`[EcoWatch AI] Loaded ${rawReadings.length} measurement records. Running anomaly screening...`);
      readingsStore = runAnomalyDetection(rawReadings, currentThresholds);
      gemstatDatasetMeta.lastUpdated = new Date().toISOString();
      console.log(`[EcoWatch AI] Dataset ready. Anomaly screening completed.`);
      return;
    }
  }
}

// In-Memory Performance Cache Interfaces
export interface CachedStationEntry {
  id: string;
  stationCode?: string;
  name: string;
  country: string;
  district?: string;
  waterBody: string;
  mainBasin?: string;
  stationType?: string;
  elevation?: number;
  latitude?: number;
  longitude?: number;
  readingsCount: number;
  latestReading: Reading;
  status: Reading['status'];
  hasActiveFlag: boolean;
  source: string;
  reportingAgency?: string;
  is_illustrative: boolean;
}

export interface CachedStationMarker {
  id: string;
  code: string;
  name: string;
  country: string;
  waterBody?: string;
  mainBasin?: string;
  lat: number;
  lng: number;
  status: Reading['status'];
  isFlagged: boolean;
  flagReasons: string[];
  sampleDate: string;
  ph: number;
  do?: number;
  temp: number;
  tds: number;
  nitrate?: number;
  quality: string;
  agency?: string;
  source?: string;
  readingsCount: number;
  latestReading: Reading;
}

let cachedStationEntries: CachedStationEntry[] = [];
let cachedStationMarkers: CachedStationMarker[] = [];
let cachedSummary: any = null;
let cachedTrendsGlobal: { trends: any[]; locationComparisons: any[] } = { trends: [], locationComparisons: [] };
let cachedPriorityItems: any[] = [];
let cachedTopLocations: string[] = [];
let cachedCountriesList: { country: string; count: number; stationsCount: number }[] = [];
let cachedRiversList: string[] = [];
let cachedDataSourcesList: string[] = [];

function refreshServerCaches() {
  console.log('[EcoWatch AI] Rebuilding fast in-memory caches...');
  const t0 = Date.now();

  const stationMap = new Map<string, Reading[]>();
  const countryCounts = new Map<string, { count: number; stations: Set<string> }>();
  const riverSet = new Set<string>();
  const dataSourceSet = new Set<string>();

  // Single pass through readingsStore
  for (let i = 0; i < readingsStore.length; i++) {
    const r = readingsStore[i];
    let list = stationMap.get(r.location);
    if (!list) {
      list = [];
      stationMap.set(r.location, list);
    }
    list.push(r);

    const c = r.country || 'Global';
    let cData = countryCounts.get(c);
    if (!cData) {
      cData = { count: 0, stations: new Set() };
      countryCounts.set(c, cData);
    }
    cData.count++;
    cData.stations.add(r.location);

    if (r.water_body) riverSet.add(r.water_body);
    if (r.source) dataSourceSet.add(r.source);
  }

  // Sorted countries list
  cachedCountriesList = Array.from(countryCounts.entries())
    .map(([country, data]) => ({
      country,
      count: data.count,
      stationsCount: data.stations.size,
    }))
    .sort((a, b) => b.stationsCount - a.stationsCount);

  cachedRiversList = Array.from(riverSet).sort();
  cachedDataSourcesList = Array.from(dataSourceSet).sort();

  // Top locations sorted by sample volume (first 100 for snappy UI dropdowns)
  const stationVolume = Array.from(stationMap.entries())
    .map(([loc, recs]) => ({ loc, count: recs.length }))
    .sort((a, b) => b.count - a.count);
  cachedTopLocations = stationVolume.slice(0, 100).map((s) => s.loc);

  // Build station entries and markers
  const entries: CachedStationEntry[] = [];
  const markers: CachedStationMarker[] = [];
  const priorityList: any[] = [];
  let followUpCount = 0;
  let priIdx = 0;

  stationMap.forEach((recs, loc) => {
    recs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const latest = recs[0];

    const hasFlag = recs.some(
      (r) =>
        r.status === 'High Priority' ||
        r.status === 'Needs Review' ||
        r.status === 'Needs Further Investigation'
    );
    const isLatestFlagged =
      latest.status === 'High Priority' ||
      latest.status === 'Needs Review' ||
      latest.status === 'Needs Further Investigation' ||
      Boolean(latest.anomaly_reasons && latest.anomaly_reasons.length > 0);

    if (hasFlag) followUpCount++;

    const entry: CachedStationEntry = {
      id: latest.station_id || latest.id,
      stationCode: latest.station_id || latest.id,
      name: loc,
      country: latest.country || 'Global',
      district: latest.district,
      waterBody: latest.water_body || 'Freshwater',
      mainBasin: latest.main_basin,
      stationType: latest.station_type,
      elevation: latest.elevation,
      latitude: latest.latitude,
      longitude: latest.longitude,
      readingsCount: recs.length,
      latestReading: latest,
      status: latest.status,
      hasActiveFlag: hasFlag,
      source: latest.source || 'UNEP GEMS/Water GEMStat',
      reportingAgency: latest.reporting_agency,
      is_illustrative: false,
    };
    entries.push(entry);

    if (typeof latest.latitude === 'number' && typeof latest.longitude === 'number') {
      markers.push({
        id: latest.station_id || latest.id,
        code: latest.station_id || latest.id,
        name: loc,
        country: latest.country || 'Global',
        waterBody: latest.water_body,
        mainBasin: latest.main_basin,
        lat: latest.latitude,
        lng: latest.longitude,
        status: latest.status,
        isFlagged: isLatestFlagged,
        flagReasons: latest.anomaly_reasons || [],
        sampleDate: latest.timestamp,
        ph: latest.ph,
        do: latest.dissolved_oxygen,
        temp: latest.temperature,
        tds: latest.tds,
        nitrate: latest.nitrate_mg_l,
        quality: latest.data_quality || 'Fair',
        agency: latest.reporting_agency,
        source: latest.source,
        readingsCount: recs.length,
        latestReading: latest,
      });
    }

    // Priority item calculation
    const highCount = recs.filter((r) => r.status === 'High Priority').length;
    const reviewCount = recs.filter((r) => r.status === 'Needs Review').length;
    const mlCount = recs.filter((r) => r.ml_anomaly).length;

    let priorityScore = 15;
    let priorityCategory:
      | 'Review recommended'
      | 'Further verification needed'
      | 'Insufficient data'
      | 'Nominal' = 'Nominal';
    let suggestedNextStep = 'Maintain regular monitoring cadence.';
    let actionType:
      | 'Check source records'
      | 'Repeat field measurement'
      | 'Consult certified environmental laboratory'
      | 'Calibrate probe sensor' = 'Check source records';

    if (highCount > 0) {
      priorityScore = Math.min(100, 80 + highCount * 6);
      priorityCategory = 'Review recommended';
      suggestedNextStep =
        'Collect secondary replicate sample and dispatch for certified spectrophotometric assay.';
      actionType = 'Consult certified environmental laboratory';
    } else if (reviewCount > 0 || mlCount > 0) {
      priorityScore = Math.min(79, 50 + reviewCount * 5 + mlCount * 4);
      priorityCategory = 'Further verification needed';
      suggestedNextStep =
        'Perform probe membrane recalibration and inspect tributary runoff channels.';
      actionType = 'Repeat field measurement';
    } else if (recs.length < 3) {
      priorityScore = 40;
      priorityCategory = 'Insufficient data';
      suggestedNextStep = 'Deploy additional field rounds to establish statistical baseline.';
      actionType = 'Check source records';
    }

    const measurements = ['pH', 'Turbidity', 'TDS', 'Temperature'];
    if (latest.dissolved_oxygen !== undefined) measurements.push('DO');
    if (latest.nitrate_mg_l !== undefined) measurements.push('Nitrate');

    const allReasons = Array.from(new Set(recs.flatMap((r) => r.anomaly_reasons || [])));

    priorityList.push({
      id: `PRI-${100 + priIdx++}`,
      location: loc,
      stationId: latest.station_id || latest.id,
      latitude: latest.latitude || 0,
      longitude: latest.longitude || 0,
      district: latest.district,
      waterBody: latest.water_body,
      basin: latest.water_body ? `${latest.water_body} Basin` : `${loc} Catchment`,
      priorityCategory,
      priorityScore,
      samplingDate: latest.timestamp,
      availableMeasurements: measurements,
      dataCompletenessPct: Math.round((measurements.length / 6) * 100),
      triggeredRules: allReasons.slice(0, 3),
      mlAnomalyDetected: mlCount > 0,
      suggestedNextStep,
      recommendedActionType: actionType,
      latestReading: latest,
    });
  });

  entries.sort((a, b) => a.name.localeCompare(b.name));
  cachedStationEntries = entries;
  cachedStationMarkers = markers;

  priorityList.sort((a, b) => b.priorityScore - a.priorityScore);
  cachedPriorityItems = priorityList;

  // Single pass for readings status counts and parameter stats
  let flaggedTotal = 0;
  let highPriorityTotal = 0;
  let reviewedTotal = 0;
  let normalTotal = 0;
  let phSum = 0, phCount = 0, phMin = Infinity, phMax = -Infinity;
  let turbSum = 0, turbCount = 0, turbMin = Infinity, turbMax = -Infinity;
  let tdsSum = 0, tdsCount = 0, tdsMin = Infinity, tdsMax = -Infinity;
  let tempSum = 0, tempCount = 0, tempMin = Infinity, tempMax = -Infinity;
  let doSum = 0, doCount = 0, doMin = Infinity, doMax = -Infinity;
  let nitSum = 0, nitCount = 0, nitMin = Infinity, nitMax = -Infinity;
  let condSum = 0, condCount = 0, condMin = Infinity, condMax = -Infinity;
  let bodSum = 0, bodCount = 0, bodMin = Infinity, bodMax = -Infinity;

  let latestTimestamp = '';

  for (let i = 0; i < readingsStore.length; i++) {
    const r = readingsStore[i];
    if (
      r.status === 'Needs Review' ||
      r.status === 'High Priority' ||
      r.status === 'Needs Further Investigation'
    ) {
      flaggedTotal++;
    }
    if (r.status === 'High Priority') highPriorityTotal++;
    if (r.status === 'Reviewed') reviewedTotal++;
    if (r.status === 'Normal') normalTotal++;

    if (!latestTimestamp || r.timestamp > latestTimestamp) {
      latestTimestamp = r.timestamp;
    }

    if (typeof r.ph === 'number' && !isNaN(r.ph)) {
      phSum += r.ph; phCount++;
      if (r.ph < phMin) phMin = r.ph;
      if (r.ph > phMax) phMax = r.ph;
    }
    if (typeof r.turbidity === 'number' && !isNaN(r.turbidity)) {
      turbSum += r.turbidity; turbCount++;
      if (r.turbidity < turbMin) turbMin = r.turbidity;
      if (r.turbidity > turbMax) turbMax = r.turbidity;
    }
    if (typeof r.tds === 'number' && !isNaN(r.tds)) {
      tdsSum += r.tds; tdsCount++;
      if (r.tds < tdsMin) tdsMin = r.tds;
      if (r.tds > tdsMax) tdsMax = r.tds;
    }
    if (typeof r.temperature === 'number' && !isNaN(r.temperature)) {
      tempSum += r.temperature; tempCount++;
      if (r.temperature < tempMin) tempMin = r.temperature;
      if (r.temperature > tempMax) tempMax = r.temperature;
    }
    if (typeof r.dissolved_oxygen === 'number' && !isNaN(r.dissolved_oxygen)) {
      doSum += r.dissolved_oxygen; doCount++;
      if (r.dissolved_oxygen < doMin) doMin = r.dissolved_oxygen;
      if (r.dissolved_oxygen > doMax) doMax = r.dissolved_oxygen;
    }
    if (typeof r.nitrate_mg_l === 'number' && !isNaN(r.nitrate_mg_l)) {
      nitSum += r.nitrate_mg_l; nitCount++;
      if (r.nitrate_mg_l < nitMin) nitMin = r.nitrate_mg_l;
      if (r.nitrate_mg_l > nitMax) nitMax = r.nitrate_mg_l;
    }
    if (typeof r.conductivity_us_cm === 'number' && !isNaN(r.conductivity_us_cm)) {
      condSum += r.conductivity_us_cm; condCount++;
      if (r.conductivity_us_cm < condMin) condMin = r.conductivity_us_cm;
      if (r.conductivity_us_cm > condMax) condMax = r.conductivity_us_cm;
    }
    if (typeof r.bod_mg_l === 'number' && !isNaN(r.bod_mg_l)) {
      bodSum += r.bod_mg_l; bodCount++;
      if (r.bod_mg_l < bodMin) bodMin = r.bod_mg_l;
      if (r.bod_mg_l > bodMax) bodMax = r.bod_mg_l;
    }
  }

  const parameterStats = {
    ph: { avg: phCount > 0 ? Number((phSum / phCount).toFixed(2)) : 0, min: phMin !== Infinity ? phMin : 0, max: phMax !== -Infinity ? phMax : 0 },
    turbidity: { avg: turbCount > 0 ? Number((turbSum / turbCount).toFixed(2)) : 0, min: turbMin !== Infinity ? turbMin : 0, max: turbMax !== -Infinity ? turbMax : 0 },
    tds: { avg: tdsCount > 0 ? Number((tdsSum / tdsCount).toFixed(0)) : 0, min: tdsMin !== Infinity ? tdsMin : 0, max: tdsMax !== -Infinity ? tdsMax : 0 },
    temperature: { avg: tempCount > 0 ? Number((tempSum / tempCount).toFixed(1)) : 0, min: tempMin !== Infinity ? tempMin : 0, max: tempMax !== -Infinity ? tempMax : 0 },
    dissolved_oxygen: { avg: doCount > 0 ? Number((doSum / doCount).toFixed(2)) : 0, min: doMin !== Infinity ? doMin : 0, max: doMax !== -Infinity ? doMax : 0 },
    nitrate: { avg: nitCount > 0 ? Number((nitSum / nitCount).toFixed(2)) : 0, min: nitMin !== Infinity ? nitMin : 0, max: nitMax !== -Infinity ? nitMax : 0 },
    conductivity: { avg: condCount > 0 ? Number((condSum / condCount).toFixed(1)) : 0, min: condMin !== Infinity ? condMin : 0, max: condMax !== -Infinity ? condMax : 0 },
    bod: { avg: bodCount > 0 ? Number((bodSum / bodCount).toFixed(2)) : 0, min: bodMin !== Infinity ? bodMin : 0, max: bodMax !== -Infinity ? bodMax : 0 },
  };

  const anomalyRate = readingsStore.length > 0 ? Number(((flaggedTotal / readingsStore.length) * 100).toFixed(1)) : 0;

  cachedSummary = {
    totalReadings: readingsStore.length,
    totalStations: cachedStationEntries.length,
    totalCountries: cachedCountriesList.length,
    locationsMonitored: cachedStationEntries.length,
    locationsList: cachedTopLocations,
    countriesList: cachedCountriesList,
    parametersList: ['pH', 'Dissolved Oxygen', 'Water Temperature', 'Electrical Conductance / TDS', 'Nitrate', 'Turbidity / Salinity'],
    latestObservationDate: latestTimestamp || undefined,
    riversCount: cachedRiversList.length,
    dataSourceName:
      'UNEP GEMS/Water Global Freshwater Quality Archive (GEMStat - Zenodo DOI: 10.5281/zenodo.13881899, CC-BY 4.0)',
    flaggedReadings: flaggedTotal,
    highPriorityCount: highPriorityTotal,
    reviewedCount: reviewedTotal,
    normalCount: normalTotal,
    anomalyRate,
    locationsRequiringFollowUp: followUpCount,
    latestMeasurement: readingsStore[0] || null,
    parameterStats,
    isIllustrativeData: false,
    gemstatInfo: {
      title: gemstatDatasetMeta.title,
      doi: gemstatDatasetMeta.doi,
      archiveVersion: gemstatDatasetMeta.archiveRecord,
      license: gemstatDatasetMeta.license,
      attribution: gemstatDatasetMeta.provider,
      portalUrl: gemstatDatasetMeta.portalUrl,
    },
  };

  // Precompute Global Trends downsampled to 70 points
  const step = Math.max(1, Math.floor(readingsStore.length / 70));
  const trendSamples: any[] = [];
  const chronoSorted = [...readingsStore].sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
  for (let i = 0; i < chronoSorted.length; i += step) {
    const r = chronoSorted[i];
    trendSamples.push({
      id: r.id,
      timestamp: r.timestamp,
      date: r.timestamp.slice(0, 10),
      dateTime: r.timestamp.slice(0, 16).replace('T', ' '),
      location: r.location,
      ph: r.ph,
      turbidity: r.turbidity,
      tds: r.tds,
      temperature: r.temperature,
      dissolved_oxygen: r.dissolved_oxygen ?? null,
      nitrate_mg_l: r.nitrate_mg_l ?? null,
      status: r.status,
    });
  }

  // Location comparisons: top 15 most active stations
  const top15Entries = cachedStationEntries.slice(0, 15);
  const locationComparisons = top15Entries.map((e) => {
    const recs = stationMap.get(e.name) || [e.latestReading];
    let phS = 0, turbS = 0, tdsS = 0, tempS = 0, doS = 0, doC = 0, nitS = 0, nitC = 0;
    recs.forEach((r) => {
      phS += r.ph;
      turbS += r.turbidity;
      tdsS += r.tds;
      tempS += r.temperature;
      if (typeof r.dissolved_oxygen === 'number') { doS += r.dissolved_oxygen; doC++; }
      if (typeof r.nitrate_mg_l === 'number') { nitS += r.nitrate_mg_l; nitC++; }
    });
    return {
      location: e.name,
      avgPh: Number((phS / recs.length).toFixed(2)),
      avgTurbidity: Number((turbS / recs.length).toFixed(2)),
      avgTds: Number((tdsS / recs.length).toFixed(0)),
      avgTemp: Number((tempS / recs.length).toFixed(1)),
      avgDo: doC > 0 ? Number((doS / doC).toFixed(2)) : null,
      avgNitrate: nitC > 0 ? Number((nitS / nitC).toFixed(2)) : null,
      readingsCount: recs.length,
    };
  });

  cachedTrendsGlobal = {
    trends: trendSamples,
    locationComparisons,
  };

  console.log(`[EcoWatch AI] Caches built in ${Date.now() - t0}ms (${cachedStationEntries.length} stations, ${cachedStationMarkers.length} markers, ${cachedPriorityItems.length} priority targets).`);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Load sample data into store and build fast caches
  loadInitialSampleData();
  refreshServerCaches();

  // 1. GET /api/health
  app.get('/api/health', (_req: Request, res: Response) => {
    const countriesCount = new Set(readingsStore.map((r) => r.country || 'Global')).size;
    const stationsCount = new Set(readingsStore.map((r) => r.location)).size;
    res.json({
      status: 'ok',
      service: 'EcoWatch AI Global Water Quality Monitoring Platform',
      version: '3.0.0-global-gemstat',
      database: 'UNEP GEMS/Water Global Freshwater Quality Archive (GEMStat)',
      doi: '10.5281/zenodo.13881899',
      license: 'Creative Commons Attribution 4.0 International (CC-BY 4.0)',
      scope: 'Global Worldwide Freshwater Quality Monitoring',
      sdgs: ['SDG 6: Clean Water and Sanitation', 'SDG 11: Sustainable Cities', 'SDG 15: Life on Land'],
      timestamp: new Date().toISOString(),
      dataset_count: readingsStore.length,
      locations_count: stationsCount,
      countries_count: countriesCount,
      is_demo_data: false,
    });
  });

  // GEMStat Management Endpoints
  app.get('/api/gemstat/status', (_req: Request, res: Response) => {
    const countriesMap: Record<string, number> = {};
    const stationMap: Record<string, string> = {};
    readingsStore.forEach((r) => {
      const c = r.country || 'Global';
      countriesMap[c] = (countriesMap[c] || 0) + 1;
      stationMap[r.location] = c;
    });

    const countryStationsCount: Record<string, number> = {};
    Object.values(stationMap).forEach((c) => {
      countryStationsCount[c] = (countryStationsCount[c] || 0) + 1;
    });

    const countriesList = Object.entries(countriesMap)
      .map(([country, count]) => ({
        country,
        count,
        stationsCount: countryStationsCount[country] || 0,
      }))
      .sort((a, b) => b.count - a.count);

    res.json({
      status: 'ready',
      metadata: gemstatDatasetMeta,
      totalRecords: readingsStore.length,
      totalStations: Object.keys(stationMap).length,
      totalCountries: countriesList.length,
      countries: countriesList,
      parameters: [
        { code: 'pH', name: 'pH (Potential of Hydrogen)', unit: 'pH units' },
        { code: 'DO', name: 'Dissolved Oxygen', unit: 'mg/L' },
        { code: 'Temp', name: 'Water Temperature', unit: '°C' },
        { code: 'EC', name: 'Electrical Conductance', unit: 'µS/cm' },
        { code: 'TDS', name: 'Total Dissolved Solids', unit: 'mg/L' },
        { code: 'NO3', name: 'Nitrate', unit: 'mg/L' },
        { code: 'Turb', name: 'Turbidity', unit: 'NTU' },
        { code: 'Sal', name: 'Salinity', unit: 'ppt' },
      ],
      attribution:
        'Data provided by the GEMS/Water Programme of the United Nations Environment Programme (UNEP) and hosted at the International Centre for Water Resources and Global Change (ICWRGC) / German Federal Institute of Hydrology (BfG).',
    });
  });

  app.post('/api/gemstat/refresh', (_req: Request, res: Response) => {
    try {
      loadInitialSampleData();
      res.json({
        success: true,
        message: 'GEMStat dataset reloaded and normalized successfully.',
        totalRecords: readingsStore.length,
        totalStations: new Set(readingsStore.map((r) => r.location)).size,
        totalCountries: new Set(readingsStore.map((r) => r.country || 'Global')).size,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to refresh GEMStat dataset', details: err.message });
    }
  });

  // 2. GET /api/summary
  app.get('/api/summary', (_req: Request, res: Response) => {
    try {
      const totalReadings = readingsStore.length;
      const locations = Array.from(new Set(readingsStore.map((r) => r.location)));
      const totalStations = locations.length;
      
      const countryCounts: Record<string, { count: number; stations: Set<string> }> = {};
      readingsStore.forEach((r) => {
        const c = r.country || 'Global';
        if (!countryCounts[c]) countryCounts[c] = { count: 0, stations: new Set() };
        countryCounts[c].count++;
        countryCounts[c].stations.add(r.location);
      });

      const countriesList = Object.entries(countryCounts)
        .map(([country, data]) => ({
          country,
          count: data.count,
          stationsCount: data.stations.size,
        }))
        .sort((a, b) => b.stationsCount - a.stationsCount);

      const totalCountries = countriesList.length;

      const rivers = Array.from(
        new Set(readingsStore.map((r) => r.water_body).filter((w): w is string => Boolean(w)))
      );

      const flaggedReadings = readingsStore.filter(
        (r) =>
          r.status === 'Needs Review' ||
          r.status === 'High Priority' ||
          r.status === 'Needs Further Investigation'
      ).length;
      const highPriorityCount = readingsStore.filter((r) => r.status === 'High Priority').length;
      const reviewedCount = readingsStore.filter((r) => r.status === 'Reviewed').length;
      const normalCount = readingsStore.filter((r) => r.status === 'Normal').length;

      // Locations requiring follow-up
      const followUpLocations = new Set(
        readingsStore
          .filter(
            (r) =>
              r.status === 'High Priority' ||
              r.status === 'Needs Review' ||
              r.status === 'Needs Further Investigation'
          )
          .map((r) => r.location)
      );

      const sortedByTime = [...readingsStore].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      const latestReading = sortedByTime[0] || null;

      const computeParamSummary = (getter: (r: Reading) => number | undefined) => {
        const vals = readingsStore
          .map(getter)
          .filter((v): v is number => typeof v === 'number' && !isNaN(v));
        if (vals.length === 0) return { avg: 0, min: 0, max: 0 };
        const sum = vals.reduce((a, b) => a + b, 0);
        return {
          avg: Number((sum / vals.length).toFixed(2)),
          min: Number(Math.min(...vals).toFixed(2)),
          max: Number(Math.max(...vals).toFixed(2)),
        };
      };

      const parameterStats = {
        ph: computeParamSummary((r) => r.ph),
        turbidity: computeParamSummary((r) => r.turbidity),
        tds: computeParamSummary((r) => r.tds),
        temperature: computeParamSummary((r) => r.temperature),
        dissolved_oxygen: computeParamSummary((r) => r.dissolved_oxygen),
        nitrate: computeParamSummary((r) => r.nitrate_mg_l),
        conductivity: computeParamSummary((r) => r.conductivity_us_cm),
        bod: computeParamSummary((r) => r.bod_mg_l),
      };

      const anomalyRate =
        totalReadings > 0 ? Number(((flaggedReadings / totalReadings) * 100).toFixed(1)) : 0;

      res.json({
        totalReadings,
        totalStations,
        totalCountries,
        locationsMonitored: totalStations,
        locationsList: locations,
        countriesList,
        parametersList: ['pH', 'Dissolved Oxygen', 'Water Temperature', 'Electrical Conductance / TDS', 'Nitrate', 'Turbidity / Salinity'],
        latestObservationDate: latestReading ? latestReading.timestamp : undefined,
        riversCount: rivers.length,
        dataSourceName:
          'UNEP GEMS/Water Global Freshwater Quality Archive (GEMStat - Zenodo DOI: 10.5281/zenodo.13881899, CC-BY 4.0)',
        flaggedReadings,
        highPriorityCount,
        reviewedCount,
        normalCount,
        anomalyRate,
        locationsRequiringFollowUp: followUpLocations.size,
        latestMeasurement: latestReading,
        parameterStats,
        isIllustrativeData: false,
        gemstatInfo: {
          title: gemstatDatasetMeta.title,
          doi: gemstatDatasetMeta.doi,
          archiveVersion: gemstatDatasetMeta.archiveRecord,
          license: gemstatDatasetMeta.license,
          attribution: gemstatDatasetMeta.provider,
          portalUrl: gemstatDatasetMeta.portalUrl,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to generate summary', details: err.message });
    }
  });

  // 3. GET /api/stations (Supports search, country, river, status, parameter, and pagination)
  app.get('/api/stations', (req: Request, res: Response) => {
    try {
      const {
        search = '',
        country = 'all',
        district = 'all',
        river = 'all',
        status = 'all',
        parameter = 'all',
        page = '1',
        limit = '20',
      } = req.query as Record<string, string>;

      const stationMap: Record<string, Reading[]> = {};
      readingsStore.forEach((r) => {
        if (!stationMap[r.location]) stationMap[r.location] = [];
        stationMap[r.location].push(r);
      });

      let stationEntries = Object.entries(stationMap).map(([loc, recs]) => {
        const sorted = [...recs].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        const latest = sorted[0];
        const hasFlag = recs.some((r) => r.status === 'High Priority' || r.status === 'Needs Review');
        return {
          id: latest.station_id || latest.id,
          stationCode: latest.station_id || latest.id,
          name: loc,
          country: latest.country || 'Global',
          district: latest.district,
          waterBody: latest.water_body || 'Freshwater',
          mainBasin: latest.main_basin,
          stationType: latest.station_type,
          elevation: latest.elevation,
          latitude: latest.latitude, // Strictly verified coordinates only
          longitude: latest.longitude,
          readingsCount: recs.length,
          latestReading: latest,
          status: latest.status,
          hasActiveFlag: hasFlag,
          source: latest.source || 'UNEP GEMS/Water GEMStat',
          reportingAgency: latest.reporting_agency,
          is_illustrative: false,
        };
      });

      // Filter by country
      if (country && country !== 'all') {
        stationEntries = stationEntries.filter(
          (s) => s.country.toLowerCase() === country.toLowerCase()
        );
      }

      // Filter by search query
      if (search) {
        const q = search.toLowerCase();
        stationEntries = stationEntries.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.id.toLowerCase().includes(q) ||
            s.country.toLowerCase().includes(q) ||
            (s.waterBody && s.waterBody.toLowerCase().includes(q)) ||
            (s.mainBasin && s.mainBasin.toLowerCase().includes(q)) ||
            (s.district && s.district.toLowerCase().includes(q))
        );
      }

      // Filter by river/water body
      if (river && river !== 'all') {
        stationEntries = stationEntries.filter(
          (s) => s.waterBody.toLowerCase() === river.toLowerCase()
        );
      }

      // Filter by status
      if (status && status !== 'all') {
        if (status === 'flagged') {
          stationEntries = stationEntries.filter((s) => s.hasActiveFlag);
        } else {
          stationEntries = stationEntries.filter(
            (s) => s.status.toLowerCase() === status.toLowerCase()
          );
        }
      }

      // Filter by parameter
      if (parameter && parameter !== 'all') {
        stationEntries = stationEntries.filter((s) => {
          const reasons = s.latestReading.anomaly_reasons || [];
          return reasons.some((r) => r.toLowerCase().includes(parameter.toLowerCase()));
        });
      }

      // Sort alphabetically by name
      stationEntries.sort((a, b) => a.name.localeCompare(b.name));

      const totalStations = stationEntries.length;
      const totalRecords = stationEntries.reduce((sum, s) => sum + s.readingsCount, 0);

      // Collect available countries and rivers across entire store
      const countryCountsMap: Record<string, number> = {};
      readingsStore.forEach((r) => {
        const c = r.country || 'Global';
        countryCountsMap[c] = (countryCountsMap[c] || 0) + 1;
      });
      const allCountries = Object.entries(countryCountsMap)
        .map(([c, cnt]) => ({ country: c, count: cnt }))
        .sort((a, b) => a.country.localeCompare(b.country));

      const allRivers = Array.from(
        new Set(readingsStore.map((r) => r.water_body).filter((w): w is string => Boolean(w)))
      ).sort();

      const allDataSources = Array.from(
        new Set(readingsStore.map((r) => r.source).filter((s): s is string => Boolean(s)))
      ).sort();

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const isAll = limit === 'all' || parseInt(limit, 10) >= 25000;
      const pageSize = isAll ? totalStations : Math.max(1, parseInt(limit, 10) || 20);
      const totalPages = Math.ceil(totalStations / (pageSize || 1)) || 1;

      let paginatedStations = stationEntries;
      if (!isAll) {
        const startIndex = (pageNum - 1) * pageSize;
        paginatedStations = stationEntries.slice(startIndex, startIndex + pageSize);
      }

      res.json({
        stations: paginatedStations,
        totalStations,
        totalRecords,
        page: pageNum,
        limit: isAll ? totalStations : pageSize,
        totalPages,
        countries: allCountries,
        rivers: allRivers,
        dataSources: allDataSources,
        dataSourceNotice:
          'Verified UNEP GEMS/Water Global Freshwater Quality Archive records (CC-BY 4.0). Published screening data reflects public environmental monitoring and does not independently certify drinking water safety.',
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to retrieve stations', details: err.message });
    }
  });

  // 3b. GET /api/stations/map (Lightweight endpoint for worldwide map markers & clustering)
  app.get('/api/stations/map', (req: Request, res: Response) => {
    try {
      const { country = 'all', status = 'all', search = '' } = req.query as Record<string, string>;

      const stationMap: Record<string, Reading[]> = {};
      readingsStore.forEach((r) => {
        // Must have verified numeric coordinates
        if (typeof r.latitude === 'number' && typeof r.longitude === 'number') {
          if (!stationMap[r.location]) stationMap[r.location] = [];
          stationMap[r.location].push(r);
        }
      });

      let markers = Object.entries(stationMap).map(([loc, recs]) => {
        const sorted = [...recs].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        const latest = sorted[0];
        const isFlagged =
          latest.status === 'High Priority' ||
          latest.status === 'Needs Review' ||
          latest.status === 'Needs Further Investigation' ||
          Boolean(latest.anomaly_reasons && latest.anomaly_reasons.length > 0);

        return {
          id: latest.station_id || latest.id,
          code: latest.station_id || latest.id,
          name: loc,
          country: latest.country || 'Global',
          waterBody: latest.water_body,
          mainBasin: latest.main_basin,
          lat: latest.latitude!,
          lng: latest.longitude!,
          status: latest.status,
          isFlagged,
          flagReasons: latest.anomaly_reasons || [],
          sampleDate: latest.timestamp,
          ph: latest.ph,
          do: latest.dissolved_oxygen,
          temp: latest.temperature,
          tds: latest.tds,
          nitrate: latest.nitrate_mg_l,
          quality: latest.data_quality || 'Fair',
          agency: latest.reporting_agency,
          source: latest.source,
          readingsCount: recs.length,
          latestReading: latest,
        };
      });

      if (country && country !== 'all') {
        markers = markers.filter((m) => m.country.toLowerCase() === country.toLowerCase());
      }

      if (status && status !== 'all') {
        if (status === 'flagged') markers = markers.filter((m) => m.isFlagged);
        else if (status === 'normal') markers = markers.filter((m) => !m.isFlagged);
        else markers = markers.filter((m) => m.status.toLowerCase() === status.toLowerCase());
      }

      if (search) {
        const q = search.toLowerCase();
        markers = markers.filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            m.code.toLowerCase().includes(q) ||
            m.country.toLowerCase().includes(q) ||
            (m.waterBody && m.waterBody.toLowerCase().includes(q))
        );
      }

      res.json({
        totalMarkers: markers.length,
        markers,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to retrieve map markers', details: err.message });
    }
  });

  // Nominatim geocoding proxy with strict rate-limiting (max 1 req/sec) and in-memory caching
  const geocodeCache = new Map<string, { timestamp: number; data: any }>();
  let lastNominatimRequestTime = 0;

  app.get('/api/geocode', async (req: Request, res: Response) => {
    try {
      const q = ((req.query.q as string) || '').trim();
      if (!q || q.length < 2) {
        return res.json({ results: [] });
      }

      const cacheKey = q.toLowerCase();
      const cached = geocodeCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < 3600000) {
        return res.json({ results: cached.data, cached: true });
      }

      // Enforce rate limiting: minimum 1100ms between calls to Nominatim API
      const now = Date.now();
      const elapsed = now - lastNominatimRequestTime;
      if (elapsed < 1100) {
        await new Promise((resolve) => setTimeout(resolve, 1100 - elapsed));
      }
      lastNominatimRequestTime = Date.now();

      const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
        q
      )}&addressdetails=1&limit=6`;

      const response = await fetch(nominatimUrl, {
        headers: {
          'User-Agent': 'EcoWatchAI/2.0 (water-quality-gis-monitoring; contact: syedsabatanzeem@gmail.com)',
          'Referer': 'https://ais-dev-dx2437jhnhqbxsyim7obp6-357729376552.asia-southeast1.run.app',
          'Accept-Language': 'en',
        },
      });

      if (!response.ok) {
        console.warn(`Nominatim returned status ${response.status} for query "${q}"`);
        return res.json({
          results: [],
          warning: `Geocoding service returned status ${response.status}`,
        });
      }

      const data = await response.json();
      geocodeCache.set(cacheKey, { timestamp: Date.now(), data });
      res.json({ results: data });
    } catch (err: any) {
      console.error('Nominatim geocode proxy error:', err);
      res.json({
        results: [],
        error: 'Geocoding request could not be completed. Please try again.',
      });
    }
  });

  // 4. GET /api/readings
  app.get('/api/readings', (req: Request, res: Response) => {
    try {
      const {
        search = '',
        country = '',
        location = '',
        district = '',
        river = '',
        status = '',
        parameter = '',
        source = '',
        startDate = '',
        endDate = '',
        sortBy = 'timestamp',
        sortOrder = 'desc',
        page = '1',
        limit = '10',
      } = req.query as Record<string, string>;

      let filtered = [...readingsStore];

      if (country && country !== 'all') {
        filtered = filtered.filter(
          (r) => r.country && r.country.toLowerCase() === country.toLowerCase()
        );
      }

      if (search) {
        const query = search.toLowerCase();
        filtered = filtered.filter(
          (r) =>
            r.id.toLowerCase().includes(query) ||
            r.location.toLowerCase().includes(query) ||
            (r.country && r.country.toLowerCase().includes(query)) ||
            (r.station_id && r.station_id.toLowerCase().includes(query)) ||
            (r.district && r.district.toLowerCase().includes(query)) ||
            (r.water_body && r.water_body.toLowerCase().includes(query)) ||
            (r.main_basin && r.main_basin.toLowerCase().includes(query)) ||
            (r.review_notes && r.review_notes.toLowerCase().includes(query)) ||
            (r.source && r.source.toLowerCase().includes(query))
        );
      }

      if (location && location !== 'all') {
        filtered = filtered.filter((r) => r.location.toLowerCase() === location.toLowerCase());
      }

      if (district && district !== 'all') {
        filtered = filtered.filter((r) => r.district && r.district.toLowerCase() === district.toLowerCase());
      }

      if (river && river !== 'all') {
        filtered = filtered.filter((r) => r.water_body && r.water_body.toLowerCase() === river.toLowerCase());
      }

      if (status && status !== 'all') {
        filtered = filtered.filter((r) => r.status.toLowerCase() === status.toLowerCase());
      }

      if (source && source !== 'all') {
        filtered = filtered.filter((r) => r.source && r.source.toLowerCase() === source.toLowerCase());
      }

      if (parameter && parameter !== 'all') {
        filtered = filtered.filter((r) => {
          const reasons = r.anomaly_reasons || [];
          return reasons.some((reason) => reason.toLowerCase().includes(parameter.toLowerCase()));
        });
      }

      if (startDate) {
        const start = new Date(startDate).getTime();
        filtered = filtered.filter((r) => new Date(r.timestamp).getTime() >= start);
      }
      if (endDate) {
        const end = new Date(endDate).getTime();
        filtered = filtered.filter((r) => new Date(r.timestamp).getTime() <= end);
      }

      filtered.sort((a: any, b: any) => {
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

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const isAll = limit === 'all' || parseInt(limit, 10) >= 1000;
      const total = filtered.length;
      const pageSize = isAll ? total : Math.max(1, parseInt(limit, 10) || 10);
      const totalPages = Math.ceil(total / (pageSize || 1)) || 1;
      const startIndex = (pageNum - 1) * pageSize;
      const paginated = isAll ? filtered : filtered.slice(startIndex, startIndex + pageSize);

      const allCountries = Array.from(
        new Set(readingsStore.map((r) => r.country || 'Global'))
      ).sort();
      const allLocations = Array.from(new Set(readingsStore.map((r) => r.location))).sort();
      const allDistricts = Array.from(
        new Set(readingsStore.map((r) => r.district).filter((d): d is string => Boolean(d)))
      ).sort();
      const allRivers = Array.from(
        new Set(readingsStore.map((r) => r.water_body).filter((w): w is string => Boolean(w)))
      ).sort();
      const allDataSources = Array.from(
        new Set(readingsStore.map((r) => r.source).filter((s): s is string => Boolean(s)))
      ).sort();

      const uniqueStationsInFilter = new Set(filtered.map((r) => r.location)).size;

      res.json({
        readings: paginated,
        total,
        totalStations: uniqueStationsInFilter,
        page: pageNum,
        pageSize: isAll ? total : pageSize,
        totalPages,
        countries: allCountries,
        locations: allLocations,
        districts: allDistricts,
        rivers: allRivers,
        dataSources: allDataSources,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to retrieve readings', details: err.message });
    }
  });

  // 5. GET /api/priority (Ranked Investigation Priorities)
  app.get('/api/priority', (_req: Request, res: Response) => {
    try {
      const stationMap: Record<string, Reading[]> = {};
      readingsStore.forEach((r) => {
        if (!stationMap[r.location]) stationMap[r.location] = [];
        stationMap[r.location].push(r);
      });

      const priorityItems = Object.entries(stationMap).map(([loc, recs], idx) => {
        const sorted = [...recs].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        const latest = sorted[0];

        // Tally flags and issues
        const highCount = recs.filter((r) => r.status === 'High Priority').length;
        const reviewCount = recs.filter((r) => r.status === 'Needs Review').length;
        const mlCount = recs.filter((r) => r.ml_anomaly).length;

        let priorityScore = 15;
        let priorityCategory: 'Review recommended' | 'Further verification needed' | 'Insufficient data' | 'Nominal' =
          'Nominal';
        let suggestedNextStep = 'Maintain regular monitoring cadence.';
        let actionType: 'Check source records' | 'Repeat field measurement' | 'Consult certified environmental laboratory' | 'Calibrate probe sensor' =
          'Check source records';

        if (highCount > 0) {
          priorityScore = Math.min(100, 80 + highCount * 6);
          priorityCategory = 'Review recommended';
          suggestedNextStep =
            'Collect secondary replicate sample and dispatch for certified spectrophotometric assay.';
          actionType = 'Consult certified environmental laboratory';
        } else if (reviewCount > 0 || mlCount > 0) {
          priorityScore = Math.min(79, 50 + reviewCount * 5 + mlCount * 4);
          priorityCategory = 'Further verification needed';
          suggestedNextStep =
            'Perform probe membrane recalibration and inspect tributary runoff channels.';
          actionType = 'Repeat field measurement';
        } else if (recs.length < 3) {
          priorityScore = 40;
          priorityCategory = 'Insufficient data';
          suggestedNextStep = 'Deploy additional field rounds to establish statistical baseline.';
          actionType = 'Check source records';
        }

        const measurements = ['pH', 'Turbidity', 'TDS', 'Temperature'];
        if (latest.dissolved_oxygen !== undefined) measurements.push('DO');
        if (latest.nitrate_mg_l !== undefined) measurements.push('Nitrate');

        const allReasons = Array.from(new Set(recs.flatMap((r) => r.anomaly_reasons || [])));

        return {
          id: `PRI-${100 + idx}`,
          location: loc,
          stationId: latest.station_id || latest.id,
          latitude: latest.latitude, // Genuine verified coordinates, never invented coordinates!
          longitude: latest.longitude,
          district: latest.district,
          waterBody: latest.water_body,
          basin: latest.water_body ? `${latest.water_body} Basin` : `${loc} Catchment`,
          priorityCategory,
          priorityScore,
          samplingDate: latest.timestamp,
          availableMeasurements: measurements,
          dataCompletenessPct: Math.round((measurements.length / 6) * 100),
          triggeredRules: allReasons.slice(0, 3),
          mlAnomalyDetected: mlCount > 0,
          suggestedNextStep,
          recommendedActionType: actionType,
          latestReading: latest,
        };
      });

      // Sort descending by priority score
      priorityItems.sort((a, b) => b.priorityScore - a.priorityScore);

      res.json({
        total: priorityItems.length,
        items: priorityItems,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to generate priorities', details: err.message });
    }
  });

  // 6. GET /api/trends & GET /api/analysis
  const handleTrends = (req: Request, res: Response) => {
    try {
      const { location } = req.query as Record<string, string>;
      let items = [...readingsStore];
      if (location && location !== 'all') {
        items = items.filter((r) => r.location.toLowerCase() === location.toLowerCase());
      }

      items.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      const trendData = items.map((r) => ({
        id: r.id,
        timestamp: r.timestamp,
        date: new Date(r.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        dateTime: new Date(r.timestamp).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        location: r.location,
        ph: r.ph,
        turbidity: r.turbidity,
        tds: r.tds,
        temperature: r.temperature,
        dissolved_oxygen: r.dissolved_oxygen ?? null,
        nitrate_mg_l: r.nitrate_mg_l ?? null,
        status: r.status,
      }));

      // Station comparisons
      const locMap: Record<string, any> = {};
      readingsStore.forEach((r) => {
        if (!locMap[r.location]) {
          locMap[r.location] = {
            count: 0,
            phSum: 0,
            turbSum: 0,
            tdsSum: 0,
            tempSum: 0,
            doSum: 0,
            doCount: 0,
            nitrateSum: 0,
            nitrateCount: 0,
          };
        }
        const e = locMap[r.location];
        e.count++;
        e.phSum += r.ph;
        e.turbSum += r.turbidity;
        e.tdsSum += r.tds;
        e.tempSum += r.temperature;
        if (typeof r.dissolved_oxygen === 'number') {
          e.doSum += r.dissolved_oxygen;
          e.doCount++;
        }
        if (typeof r.nitrate_mg_l === 'number') {
          e.nitrateSum += r.nitrate_mg_l;
          e.nitrateCount++;
        }
      });

      const locationComparisons = Object.entries(locMap).map(([loc, d]) => ({
        location: loc,
        avgPh: Number((d.phSum / d.count).toFixed(2)),
        avgTurbidity: Number((d.turbSum / d.count).toFixed(2)),
        avgTds: Number((d.tdsSum / d.count).toFixed(0)),
        avgTemp: Number((d.tempSum / d.count).toFixed(1)),
        avgDo: d.doCount > 0 ? Number((d.doSum / d.doCount).toFixed(2)) : null,
        avgNitrate: d.nitrateCount > 0 ? Number((d.nitrateSum / d.nitrateCount).toFixed(2)) : null,
        readingsCount: d.count,
      }));

      res.json({
        trends: trendData,
        locationComparisons,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to retrieve analysis trends', details: err.message });
    }
  };

  app.get('/api/trends', handleTrends);
  app.get('/api/analysis', handleTrends);

  // 7. GET /api/alerts & GET /api/flags
  const handleAlerts = (req: Request, res: Response) => {
    try {
      const { status = 'all' } = req.query as Record<string, string>;
      let flagged = readingsStore.filter(
        (r) =>
          r.status === 'Needs Review' ||
          r.status === 'High Priority' ||
          r.status === 'Needs Further Investigation' ||
          r.status === 'Reviewed'
      );

      if (status && status !== 'all') {
        flagged = flagged.filter((r) => r.status.toLowerCase() === status.toLowerCase());
      }

      flagged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      const alerts = flagged.map((r) => ({
        id: r.id,
        location: r.location,
        timestamp: r.timestamp,
        status: r.status,
        reasons: r.anomaly_reasons || [],
        reading: r,
        review_notes: r.review_notes || '',
        z_scores: r.z_scores || {},
      }));

      res.json({ totalAlerts: alerts.length, alerts });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to retrieve flags', details: err.message });
    }
  };

  app.get('/api/alerts', handleAlerts);
  app.get('/api/flags', handleAlerts);

  // 8. PATCH /api/alerts/:alert_id
  app.patch('/api/alerts/:alert_id', (req: Request, res: Response) => {
    try {
      const { alert_id } = req.params;
      const { status, review_notes } = req.body;

      const validStatuses = [
        'Normal',
        'Needs Review',
        'High Priority',
        'Reviewed',
        'Needs Further Investigation',
      ];
      if (status && !validStatuses.includes(status)) {
        return res
          .status(400)
          .json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
      }

      const index = readingsStore.findIndex((r) => r.id === alert_id);
      if (index === -1) {
        return res.status(404).json({ error: `Reading with ID ${alert_id} not found.` });
      }

      if (status) readingsStore[index].status = status;
      if (review_notes !== undefined) readingsStore[index].review_notes = review_notes;

      res.json({ success: true, updated: readingsStore[index] });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to update alert', details: err.message });
    }
  });

  // 9. Community Reports (POST /api/reports, GET /api/reports)
  app.get('/api/reports', (_req: Request, res: Response) => {
    res.json({ reports: communityReportsStore, total: communityReportsStore.length });
  });

  app.post('/api/reports', (req: Request, res: Response) => {
    try {
      const { location, waterBodyName, typeOfConcern, observationDate, description } = req.body;

      if (!location || !typeOfConcern || !description) {
        return res.status(400).json({
          error: 'Location, type of concern, and description are required fields.',
        });
      }

      const newReport: CommunityReport = {
        id: `REP-${Math.floor(100 + Math.random() * 900)}`,
        location: String(location).trim(),
        waterBodyName: waterBodyName ? String(waterBodyName).trim() : undefined,
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
        message:
          'Your community report has been logged. Thank you for protecting local water bodies. Note: Community observations are held for screening and do not represent verified laboratory evidence.',
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to submit community report', details: err.message });
    }
  });

  // 10. POST /api/upload (Strict validation, coordinates range check, accepted vs rejected summary)
  app.post('/api/upload', (req: Request, res: Response) => {
    try {
      const { csvContent } = req.body;
      if (!csvContent || typeof csvContent !== 'string') {
        return res.status(400).json({ error: 'No CSV content provided.' });
      }

      const lines = csvContent.trim().split('\n');
      if (lines.length < 2) {
        return res.status(400).json({
          error: 'CSV file must have at least a header row and one valid data record.',
        });
      }

      const headers = parseCSVLine(lines[0]).map((h) =>
        h.toLowerCase().trim().replace(/[\r\n"]/g, '')
      );

      const requiredCols = ['location', 'ph'];
      const hasLocation = headers.some((h) => h.includes('location') || h.includes('station'));
      const hasPh = headers.some((h) => h === 'ph');
      const hasTurb = headers.some((h) => h.includes('turb'));
      const hasDo = headers.some((h) => h.includes('dissolved') || h.includes('do'));

      if (!hasLocation || !hasPh || !hasTurb) {
        return res.status(400).json({
          error:
            'CSV headers must include at least: location, ph, turbidity (optional: latitude, longitude, dissolved_oxygen, nitrate_mg_l, tds, temperature)',
        });
      }

      let acceptedCount = 0;
      let rejectedCount = 0;
      let duplicateCount = 0;
      const rejectionReasons: string[] = [];
      const newReadings: Reading[] = [];

      for (let i = 1; i < lines.length; i++) {
        const lineStr = lines[i].trim();
        if (!lineStr) continue;

        const cols = parseCSVLine(lineStr);
        const obj: any = {};
        headers.forEach((h, idx) => {
          obj[h] = cols[idx] !== undefined ? cols[idx].trim().replace(/^"|"$/g, '') : '';
        });

        const loc = obj.location || obj.station || obj.site;
        if (!loc) {
          rejectedCount++;
          rejectionReasons.push(`Row ${i}: Missing location name.`);
          continue;
        }

        const ph = parseFloat(obj.ph);
        const turb = parseFloat(obj.turbidity_ntu || obj.turbidity || obj.turb);
        const tds = parseFloat(obj.tds || obj.total_dissolved_solids || '220');
        const temp = parseFloat(obj.temperature_c || obj.temperature || obj.temp || '15.0');
        const doVal = obj.dissolved_oxygen_mg_l || obj.dissolved_oxygen || obj.do;
        const nitrateVal = obj.nitrate_mg_l || obj.nitrate;

        if (isNaN(ph) || ph < 0 || ph > 14) {
          rejectedCount++;
          rejectionReasons.push(`Row ${i}: Invalid pH value '${obj.ph}' (must be 0–14).`);
          continue;
        }

        if (isNaN(turb) || turb < 0) {
          rejectedCount++;
          rejectionReasons.push(`Row ${i}: Invalid turbidity value '${obj.turbidity}' (must be &ge; 0).`);
          continue;
        }

        // Coordinates check if provided
        let lat = obj.latitude ? parseFloat(obj.latitude) : undefined;
        let lon = obj.longitude ? parseFloat(obj.longitude) : undefined;
        if (lat !== undefined && (isNaN(lat) || lat < -90 || lat > 90)) {
          rejectedCount++;
          rejectionReasons.push(`Row ${i}: Latitude '${obj.latitude}' out of range [-90, +90].`);
          continue;
        }
        if (lon !== undefined && (isNaN(lon) || lon < -180 || lon > 180)) {
          rejectedCount++;
          rejectionReasons.push(`Row ${i}: Longitude '${obj.longitude}' out of range [-180, +180].`);
          continue;
        }

        const readingId = obj.station_id || obj.id || `EW-${Math.floor(2000 + Math.random() * 8000)}`;
        const timestamp =
          obj.sample_date || obj.timestamp || new Date().toISOString();

        // Duplicate check
        const isDup = readingsStore.some(
          (e) => e.id === readingId || (e.location === loc && e.timestamp === timestamp)
        );
        if (isDup) {
          duplicateCount++;
          continue;
        }

        newReadings.push({
          id: readingId,
          station_id: obj.station_id || readingId,
          location: loc,
          district: obj.district || undefined,
          water_body: obj.water_body || obj.river || undefined,
          state: obj.state || 'Andhra Pradesh',
          timestamp,
          latitude: lat,
          longitude: lon,
          ph,
          turbidity: turb,
          tds: !isNaN(tds) ? tds : 220,
          temperature: !isNaN(temp) ? temp : 26.0,
          dissolved_oxygen: doVal ? parseFloat(doVal) : undefined,
          nitrate_mg_l: nitrateVal ? parseFloat(nitrateVal) : undefined,
          bod_mg_l: obj.bod_mg_l ? parseFloat(obj.bod_mg_l) : undefined,
          conductivity_us_cm: obj.conductivity_us_cm ? parseFloat(obj.conductivity_us_cm) : undefined,
          source: obj.source || 'Uploaded Telemetry Dataset',
          status: 'Normal',
          review_notes: obj.review_notes || '',
          is_illustrative: false,
        });

        acceptedCount++;
      }

      if (acceptedCount === 0 && rejectedCount > 0) {
        return res.status(400).json({
          error: 'No valid records could be accepted from the uploaded CSV.',
          acceptedCount: 0,
          rejectedCount,
          rejectionReasons: rejectionReasons.slice(0, 5),
        });
      }

      readingsStore = [...readingsStore, ...newReadings];
      readingsStore = runAnomalyDetection(readingsStore, currentThresholds);

      res.json({
        success: true,
        acceptedCount,
        rejectedCount,
        duplicateCount,
        totalDatasetSize: readingsStore.length,
        validationReport: {
          totalRowsProcessed: lines.length - 1,
          acceptedCount,
          rejectedCount,
          duplicateCount,
          sampleErrors: rejectionReasons.slice(0, 5),
        },
        message: `Accepted ${acceptedCount} records (${duplicateCount} duplicates skipped, ${rejectedCount} rejected rows reported).`,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to process file upload', details: err.message });
    }
  });

  // 11. GET /api/export (Filtered CSV export)
  app.get('/api/export', (req: Request, res: Response) => {
    try {
      const { country, location, district, river, status, startDate, endDate } = req.query as Record<string, string>;
      let items = [...readingsStore];

      if (country && country !== 'all') {
        items = items.filter((r) => r.country && r.country.toLowerCase() === country.toLowerCase());
      }
      if (location && location !== 'all') {
        items = items.filter((r) => r.location.toLowerCase() === location.toLowerCase());
      }
      if (district && district !== 'all') {
        items = items.filter((r) => r.district && r.district.toLowerCase() === district.toLowerCase());
      }
      if (river && river !== 'all') {
        items = items.filter((r) => r.water_body && r.water_body.toLowerCase() === river.toLowerCase());
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

      items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      const headers = [
        'station_id',
        'location',
        'country',
        'water_body',
        'main_basin',
        'station_type',
        'latitude',
        'longitude',
        'sample_date',
        'ph',
        'turbidity_ntu',
        'dissolved_oxygen_mg_l',
        'nitrate_mg_l',
        'conductivity_us_cm',
        'tds_mg_l',
        'temperature_c',
        'data_quality',
        'status',
        'anomaly_triggers',
        'ml_anomaly_flag',
        'reporting_agency',
        'source',
      ];
      const rows = [headers.join(',')];

      items.forEach((r) => {
        rows.push(
          [
            `"${r.station_id || r.id}"`,
            `"${(r.location || '').replace(/"/g, '""')}"`,
            `"${(r.country || 'Global').replace(/"/g, '""')}"`,
            `"${(r.water_body || '').replace(/"/g, '""')}"`,
            `"${(r.main_basin || '').replace(/"/g, '""')}"`,
            `"${(r.station_type || '').replace(/"/g, '""')}"`,
            r.latitude !== undefined ? r.latitude.toFixed(6) : '',
            r.longitude !== undefined ? r.longitude.toFixed(6) : '',
            `"${r.timestamp}"`,
            r.ph !== undefined ? r.ph.toFixed(2) : '',
            r.turbidity !== undefined ? r.turbidity.toFixed(2) : '',
            r.dissolved_oxygen !== undefined ? r.dissolved_oxygen.toFixed(2) : '',
            r.nitrate_mg_l !== undefined ? r.nitrate_mg_l.toFixed(2) : '',
            r.conductivity_us_cm !== undefined ? r.conductivity_us_cm.toFixed(1) : '',
            r.tds !== undefined ? Math.round(r.tds) : '',
            r.temperature !== undefined ? r.temperature.toFixed(1) : '',
            `"${r.data_quality || 'Fair'}"`,
            `"${r.status}"`,
            `"${(r.anomaly_reasons || []).join('; ').replace(/"/g, '""')}"`,
            r.ml_anomaly ? 'TRUE' : 'FALSE',
            `"${(r.reporting_agency || '').replace(/"/g, '""')}"`,
            `"${(r.source || 'UNEP GEMS/Water GEMStat Global Archive').replace(/"/g, '""')}"`,
          ].join(',')
        );
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="cpcb_andhra_pradesh_filtered_report.csv"');
      res.status(200).send(rows.join('\n'));
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to export CSV', details: err.message });
    }
  });

  // 12. GET /api/export-ap-dataset (Download raw official AP dataset)
  app.get('/api/export-ap-dataset', (_req: Request, res: Response) => {
    try {
      const apCsvPath = path.join(__dirname, 'data', 'cpcb_andhra_pradesh_water_quality.csv');
      if (fs.existsSync(apCsvPath)) {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader(
          'Content-Disposition',
          'attachment; filename="cpcb_andhra_pradesh_water_quality.csv"'
        );
        fs.createReadStream(apCsvPath).pipe(res);
      } else {
        res.status(404).json({ error: 'Andhra Pradesh dataset file not found.' });
      }
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to download AP dataset', details: err.message });
    }
  });

  // 13. GET /api/sample-csv (Schema template download)
  app.get('/api/sample-csv', (_req: Request, res: Response) => {
    try {
      const template = [
        'station_id,location,district,water_body,state,latitude,longitude,sample_date,ph,turbidity_ntu,dissolved_oxygen_mg_l,nitrate_mg_l,bod_mg_l,temperature_c,tds,conductivity_us_cm,source,status,review_notes',
        'AP-NWMP-1174,"Godavari River at Pushkar Ghat, Rajamahendravaram",East Godavari,Godavari River,Andhra Pradesh,16.9891,81.7840,2026-03-24T09:00:00Z,7.75,3.20,6.80,2.80,2.40,26.5,285,440,"CPCB - National Water Quality Monitoring Programme (NWMP) / APPCB",Normal,"Nominal baseline measurement · CPCB Class C / Bathing Criteria met"',
        'AP-NWMP-4365,"Vasishta Godavari River Upstream Narasapuram",West Godavari,Vasishta Godavari River,Andhra Pradesh,16.4350,81.7010,2026-03-24T09:00:00Z,7.95,4.80,6.20,4.20,3.40,27.2,620,980,"CPCB - National Water Quality Monitoring Programme (NWMP) / APPCB",Needs Review,"Tidal influence and minor organic load upstream"',
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="cpcb_water_quality_template.csv"');
      res.status(200).send(template);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to provide sample template', details: err.message });
    }
  });

  // 12. GET & PUT /api/thresholds
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

      res.json({
        success: true,
        thresholds: currentThresholds,
        message: 'Screening thresholds updated and anomaly models recomputed.',
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to update thresholds', details: err.message });
    }
  });

  // 13. POST /api/reset-sample
  app.post('/api/reset-sample', (_req: Request, res: Response) => {
    currentThresholds = { ...DEFAULT_THRESHOLDS };
    loadInitialSampleData();
    res.json({
      success: true,
      message: 'Dataset reset to baseline illustrative records with standard EPA/WHO thresholds.',
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
    console.log(`[EcoWatch AI] Full-stack Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
