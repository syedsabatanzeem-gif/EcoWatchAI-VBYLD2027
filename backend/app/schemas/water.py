from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class ReadingBase(BaseModel):
    location: str
    river: Optional[str] = "Ganga River"
    state: Optional[str] = "Uttar Pradesh"
    district: Optional[str] = None
    basin: Optional[str] = None
    timestamp: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    ph: float
    dissolved_oxygen: Optional[float] = None
    bod_mg_l: Optional[float] = None
    cod_mg_l: Optional[float] = None
    turbidity: Optional[float] = None
    nitrate_mg_l: Optional[float] = None
    temperature: float
    tds: float
    conductivity_us_cm: Optional[float] = None
    cpcb_class: Optional[str] = "Class B"
    data_quality: Optional[str] = "Verified CPCB Lab Assay"
    source: Optional[str] = "Central Pollution Control Board (CPCB) - NWMP / Ministry of Jal Shakti"
    review_notes: Optional[str] = ""

class ReadingCreate(ReadingBase):
    id: Optional[str] = None
    status: Optional[str] = "Normal"

class ReadingResponse(ReadingBase):
    id: str
    station_id: Optional[str] = None
    status: str
    anomaly_reasons: Optional[List[str]] = []
    z_scores: Optional[Dict[str, float]] = {}
    ml_anomaly: Optional[bool] = False
    is_illustrative: Optional[bool] = False

    class Config:
        from_attributes = True

class StateSummary(BaseModel):
    state: str
    stationsCount: int
    riversCount: int
    readingsCount: int
    avgDo: float
    avgBod: float
    flaggedCount: int

class StatesListResponse(BaseModel):
    totalStates: int
    states: List[StateSummary]

class RiverSummary(BaseModel):
    id: str
    name: str
    hindiName: Optional[str] = None
    basin: str
    origin: Optional[str] = None
    outflow: Optional[str] = None
    lengthKm: Optional[int] = None
    states: List[str]
    color: Optional[str] = "#0284C7"
    keyStretches: Optional[str] = None
    stationsCount: int
    readingsCount: int
    avgDo: float
    avgBod: float
    avgPh: float
    cpcbComplianceRate: int

class RiversListResponse(BaseModel):
    totalRivers: int
    rivers: List[RiverSummary]

class StationSummary(BaseModel):
    id: str
    stationCode: str
    name: str
    river: str
    state: str
    district: Optional[str] = None
    basin: Optional[str] = None
    lat: float
    lng: float
    readingsCount: int
    status: str
    cpcbClass: str
    hasActiveFlag: bool
    source: str
    latestReading: Optional[Dict[str, Any]] = None

class StationsListResponse(BaseModel):
    totalStations: int
    stations: List[StationSummary]
    page: int
    limit: int
    totalPages: int
    states: List[str]
    rivers: List[str]

class TrendPoint(BaseModel):
    id: str
    timestamp: str
    date: str
    dateTime: str
    location: str
    river: Optional[str] = None
    ph: float
    dissolved_oxygen: Optional[float] = None
    bod_mg_l: Optional[float] = None
    cod_mg_l: Optional[float] = None
    turbidity: Optional[float] = None
    tds: float
    temperature: float
    nitrate_mg_l: Optional[float] = None
    status: str

class LocationComparison(BaseModel):
    location: str
    river: Optional[str] = None
    avgPh: float
    avgDo: Optional[float] = None
    avgBod: Optional[float] = None
    avgTurbidity: Optional[float] = None
    avgTds: Optional[float] = None
    avgTemp: Optional[float] = None
    avgNitrate: Optional[float] = None
    readingsCount: int

class TrendsResponse(BaseModel):
    trends: List[TrendPoint]
    locationComparisons: List[LocationComparison]

class ParameterStats(BaseModel):
    avg: float
    min: float
    max: float

class SummaryResponse(BaseModel):
    totalReadings: int
    totalStations: int
    totalRivers: int
    totalStates: int
    locationsMonitored: int
    locationsList: List[str]
    statesList: List[Any]
    riversList: List[Any]
    parametersList: List[str]
    latestObservationDate: Optional[str] = None
    dataSourceName: str
    flaggedReadings: int
    highPriorityCount: int
    reviewedCount: int
    normalCount: int
    anomalyRate: float
    locationsRequiringFollowUp: int
    recentObservationsCount: int
    latestMeasurement: Optional[ReadingResponse] = None
    parameterStats: Dict[str, ParameterStats]
    cpcbCriteriaNotice: str
    isIllustrativeData: bool = False

class AlertUpdate(BaseModel):
    status: str = Field(..., description="Normal, Needs Review, High Priority, Reviewed, Needs Further Investigation")
    review_notes: Optional[str] = None

class ThresholdUpdate(BaseModel):
    ph_min: Optional[float] = None
    ph_max: Optional[float] = None
    dissolved_oxygen_min: Optional[float] = None
    bod_max: Optional[float] = None
    cod_max: Optional[float] = None
    turbidity_max: Optional[float] = None
    tds_max: Optional[float] = None
    temp_min: Optional[float] = None
    temp_max: Optional[float] = None
    nitrate_max: Optional[float] = None
    z_score_threshold: Optional[float] = None
    iqr_multiplier: Optional[float] = None
    enable_ml_detection: Optional[bool] = None

class CommunityReportCreate(BaseModel):
    location: str
    water_body_name: Optional[str] = None
    type_of_concern: str
    observation_date: str
    description: str

class CommunityReportResponse(CommunityReportCreate):
    id: str
    status: str = "Pending Verification"
    submitted_at: str
    is_verified: bool = False

class InvestigationPriorityItem(BaseModel):
    id: str
    location: str
    river: str
    state: str
    stationId: str
    latitude: float
    longitude: float
    basin: str
    priorityCategory: str
    priorityScore: int
    samplingDate: str
    availableMeasurements: List[str]
    dataCompletenessPct: int
    triggeredRules: List[str]
    mlAnomalyDetected: bool
    suggestedNextStep: str
    recommendedActionType: str
