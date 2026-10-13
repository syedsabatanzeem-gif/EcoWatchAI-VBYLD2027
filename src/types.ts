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
  dissolved_oxygen: number; // DO in mg/L
  bod_mg_l: number; // Biochemical Oxygen Demand in mg/L
  cod_mg_l?: number; // Chemical Oxygen Demand in mg/L
  turbidity?: number; // NTU
  nitrate_mg_l?: number; // mg/L
  temperature: number; // °C
  tds: number; // mg/L
  conductivity_us_cm?: number; // µS/cm
  cpcb_class?: 'Class A' | 'Class B' | 'Class C' | 'Class D' | 'Class E' | 'Below Class E';
  elevation?: number;
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
  dissolved_oxygen: { min: number }; // CPCB Bathing criteria: min 5.0 mg/L
  bod: { max: number }; // CPCB Bathing criteria: max 3.0 mg/L
  cod: { max: number }; // CPCB limit: max 250 mg/L
  turbidity: { max: number };
  tds: { max: number };
  temperature: { min: number; max: number };
  nitrate: { max: number }; // CPCB / WHO drinking guideline: 10.0 mg/L
  zScoreThreshold: number;
  iqrMultiplier: number;
  enableMlDetection: boolean;
}

export interface ParameterStat {
  avg: number;
  min: number;
  max: number;
}

export interface StateStatItem {
  state: string;
  count: number;
  stationsCount: number;
  riversCount: number;
}

export interface RiverStatItem {
  river: string;
  count: number;
  stationsCount: number;
  basin: string;
  avgDo: number;
  avgBod: number;
  avgPh: number;
  cpcbStatus: string;
}

export interface SummaryData {
  totalReadings: number;
  totalStations: number;
  totalRivers: number;
  totalStates: number;
  locationsMonitored: number;
  locationsList: string[];
  statesList: StateStatItem[];
  riversList: RiverStatItem[];
  parametersList: string[];
  latestObservationDate?: string;
  dataSourceName: string;
  flaggedReadings: number;
  highPriorityCount: number;
  reviewedCount: number;
  normalCount: number;
  anomalyRate: number;
  locationsRequiringFollowUp: number;
  recentObservationsCount: number;
  latestMeasurement: Reading | null;
  parameterStats: {
    ph: ParameterStat;
    dissolved_oxygen: ParameterStat;
    bod: ParameterStat;
    cod?: ParameterStat;
    turbidity?: ParameterStat;
    tds?: ParameterStat;
    temperature?: ParameterStat;
    nitrate?: ParameterStat;
    conductivity?: ParameterStat;
  };
  cpcbCriteriaNotice: string;
  isIllustrativeData: boolean;
}

export interface TrendPoint {
  id: string;
  timestamp: string;
  date: string;
  dateTime: string;
  location: string;
  river?: string;
  ph: number;
  dissolved_oxygen: number | null;
  bod_mg_l: number | null;
  cod_mg_l?: number | null;
  turbidity: number | null;
  tds: number;
  temperature: number;
  nitrate_mg_l: number | null;
  status: string;
}

export interface LocationComparison {
  location: string;
  river?: string;
  avgPh: number;
  avgDo: number | null;
  avgBod: number | null;
  avgCod?: number | null;
  avgTurbidity: number;
  avgTds: number;
  avgTemp: number;
  avgNitrate: number | null;
  readingsCount: number;
}

export interface AlertItem {
  id: string;
  location: string;
  river?: string;
  state?: string;
  timestamp: string;
  status: 'Normal' | 'Needs Review' | 'High Priority' | 'Reviewed' | 'Needs Further Investigation';
  reasons: string[];
  z_scores: Record<string, number>;
  review_notes: string;
  reading: Reading;
}

export interface InvestigationPriorityItem {
  id: string;
  location: string;
  river: string;
  state: string;
  stationId: string;
  latitude: number;
  longitude: number;
  basin: string;
  priorityCategory: 'Review recommended' | 'Further verification needed' | 'Insufficient data' | 'Nominal';
  priorityScore: number; // 1-100 (higher = more urgent)
  samplingDate: string;
  availableMeasurements: string[];
  dataCompletenessPct: number;
  triggeredRules: string[];
  mlAnomalyDetected: boolean;
  suggestedNextStep: string;
  recommendedActionType: 'Check source records' | 'Repeat field measurement' | 'Consult certified environmental laboratory' | 'Calibrate probe sensor';
  latestReading?: Reading;
}

export interface CommunityReport {
  id: string;
  location: string;
  waterBodyName?: string;
  state?: string;
  typeOfConcern: 'Discoloration' | 'Unusual Odor' | 'Dead Fish / Wildlife' | 'Foam / Chemical Sheen' | 'Suspicious Runoff' | 'Other';
  observationDate: string;
  description: string;
  status: 'Pending Verification' | 'Under Local Review' | 'Triaged';
  submittedAt: string;
  isVerified: false;
}
