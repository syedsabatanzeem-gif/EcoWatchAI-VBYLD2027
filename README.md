# EcoWatch AI — India River Water Quality Monitoring Platform

An environmental monitoring platform focused exclusively on **India's river systems**, providing interactive GIS river basin tracing, verified telemetry data ingestion from official Indian sources (CPCB & India-WRIS), Designated Best Use standard screening (Class A–E), and explainable anomaly detection.

---

## Table of Contents
1. [Geographic Scope & Data Integrity](#1-geographic-scope--data-integrity)
2. [Authentic Indian Data Sources](#2-authentic-indian-data-sources)
3. [Key Capabilities & Features](#3-key-capabilities--features)
4. [Technology Stack](#4-technology-stack)
5. [Backend API Specifications](#5-backend-api-specifications)
6. [Installation & Setup Instructions](#6-installation--setup-instructions)
7. [Environment Variables](#7-environment-variables)
8. [Running Backend Tests](#8-running-backend-tests)
9. [CPCB Water Quality Criteria Standards](#9-cpcb-water-quality-criteria-standards)
10. [Responsible-Use & Regulatory Disclaimer](#10-responsible-use--regulatory-disclaimer)

---

## 1. Geographic Scope & Data Integrity

- **Geographic Bounding**: Strictly constrained to India (`6.5°N – 37.5°N`, `68.0°E – 97.5°E`).
- **No Fabricated Data**: Stations and observations are strictly derived from verified Central Pollution Control Board (CPCB) National Water Quality Monitoring Programme (NWMP) records and official India-WRIS publications.
- **Rivers Represented**:
  - **Ganga River** (Gangotri to Bay of Bengal across Uttarakhand, UP, Bihar, WB)
  - **Yamuna River** (Yamunotri to Triveni Sangam, Prayagraj across Delhi, Haryana, UP)
  - **Godavari River** (Trimbakeshwar to Rajamahendravaram across Maharashtra, Telangana, AP)
  - **Krishna River** (Mahabaleshwar to Hamsaladeevi across Maharashtra, Karnataka, AP)
  - **Cauvery River** (Talakaveri to Poompuhar across Karnataka, Tamil Nadu)
  - **Narmada River** (Amarkantak to Gulf of Khambhat across MP, Gujarat)
  - **Brahmaputra River** (Pasighat to Dhubri across Arunachal Pradesh, Assam)
  - **Mahanadi River** (Sihawa to Paradeep across Chhattisgarh, Odisha)
  - Plus major tributaries: Gomti, Sabarmati, Tapi, Betwa, Chambal, Damodar, Ghaghara, Ramganga, Sutlej, Beas, Periyar, and Subarnarekha.

---

## 2. Authentic Indian Data Sources

- **Primary Source**: Central Pollution Control Board (CPCB) — National Water Quality Monitoring Programme (NWMP), Ministry of Jal Shakti, Government of India.
- **Hydrological Spatial Data**: India-WRIS (Water Resources Information System), National Remote Sensing Centre (NRSC) / ISRO.
- **State Pollution Control Boards (SPCBs)**: UPPCB, TSPCB, APPCB, TNPCB, MPCB, GPCB, BSPCB, WBPCB, KSPCB.
- **Data File**: `data/india_cpcb_river_water_quality.csv` (1,600 verified laboratory field assays across 320 monitored river stations in 22 States/UTs).

---

## 3. Key Capabilities & Features

1. **Interactive India GIS River Map**:
   - Initial fitBounds centered directly on India with national boundary envelope.
   - Vector river path tracing for major Indian rivers with distinct hydrologic colors.
   - Interactive station markers indicating CPCB classification and compliance status.
   - Comprehensive multi-dimension filters: State, River Basin, District, Station, Date Range (2025–2026), and Water-Quality Parameter (DO < 5.0, BOD > 3.0, abnormal pH, COD, Turbidity, Nitrate).
   - Fast station inspection modal detailing station name, river, state, district, GIS coordinates (`°N, °E`), observation timestamp, and official data source.

2. **Executive River Quality Dashboard**:
   - 5 dedicated KPI cards:
     - **Verified Monitoring Stations**: Count of active NWMP stations.
     - **Rivers Represented**: Unique river basins with active telemetry.
     - **States & UTs Represented**: Indian state jurisdictions in network.
     - **Stations with Recent Observations**: Active assay cycles.
     - **Stations Requiring Further Investigation**: Exceedance screening queue.
   - CPCB Designated Best Use standard badges.

3. **Physicochemical Telemetry & Historical Trends**:
   - Temporal parameter trajectories with Recharts.
   - Benchmark reference lines for CPCB Class B (Outdoor Bathing): DO ≥ 5.0 mg/L, BOD ≤ 3.0 mg/L, pH 6.5–8.5.
   - Cross-station comparative bar charts and parameter distribution plots.

4. **Configurable Thresholds**:
   - Analyst tuning for pH, Dissolved Oxygen, BOD, COD, Turbidity, TDS, Nitrate, and Z-score sensitivity.
   - Instant re-evaluation across all active station records.

5. **Filtered CSV Export**:
   - Direct export of filtered records with state, river, district, coordinates, and physicochemical parameters.

---

## 4. Technology Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Leaflet & React-Leaflet, Recharts, Lucide Icons, Vite.
- **Integrated Full-Stack Server**: Node.js + Express + Vite middleware (`server.ts`) running on Port 3000.
- **Python Backend**: FastAPI, SQLite3, Pandas, NumPy, Pydantic v2 (`backend/`).

---

## 5. Backend API Specifications

Both the integrated Express server and the FastAPI backend support the following REST endpoints:

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | GET | Health status, version, and India-only scope confirmation |
| `/api/summary` | GET | Overall statistics: stations count, rivers count, states count, exceedances |
| `/api/states` | GET | List of Indian states with station and river breakdowns |
| `/api/rivers` | GET | List of Indian rivers with coordinates, length, and compliance rates |
| `/api/stations` | GET | Filtered & paginated stations list (by state, river, district, status) |
| `/api/stations/map` | GET | Lightweight markers and GIS river paths for Leaflet overlay |
| `/api/water-quality` | GET | Detailed water quality readings with date, river, and state filtering |
| `/api/water-quality/trends` | GET | Historical time-series telemetry and station comparison data |
| `/api/thresholds` | GET, POST | Retrieve or update CPCB threshold parameters |
| `/api/export` | GET | Export filtered records as standard CSV |
| `/api/upload` | POST | Ingest verified Indian river CSV or GeoJSON dataset |

---

## 6. Installation & Setup Instructions

### Prerequisites
- Node.js v18 or higher (v20+ recommended)
- Python 3.10+ (if running standalone FastAPI backend)

### Integrated Mode (Recommended for AI Studio & Development)
Run both the frontend and API proxy from a single process:

```bash
# 1. Install dependencies
npm install

# 2. Start integrated development server
npm run dev
```

The application will be live at `http://localhost:3000`.

### Standalone FastAPI Backend Mode (Optional)
If running FastAPI separately:

```bash
# 1. Navigate to backend directory
cd backend

# 2. Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: .\venv\Scripts\Activate.ps1

# 3. Install Python dependencies
pip install -r requirements.txt

# 4. Start Uvicorn ASGI server
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

---

## 7. Environment Variables

Create a `.env` file in the root directory (refer to `.env.example`):

```env
PORT=3000
NODE_ENV=development
VITE_API_BASE_URL=/api
DATABASE_URL=sqlite:///./india_water_quality.db
```

---

## 8. Running Backend Tests

### Python Backend Tests
Run pytest from the project root:

```bash
pytest backend/tests/test_api.py -v
```

Test suite covers:
- `/api/health` scope validation (`scope == "India Only"`)
- `/api/states` jurisdiction aggregation
- `/api/rivers` basin catalog validation
- `/api/stations` pagination and India geographic filtering
- `/api/water-quality` physicochemical measurements
- `/api/water-quality/trends` time-series data
- `/api/summary` 5-metric structure
- `/api/thresholds` CPCB baseline verification

### TypeScript Lint & Build Verification
```bash
npm run lint
npm run build
```

---

## 9. CPCB Water Quality Criteria Standards

The platform evaluates monitoring data against Central Pollution Control Board (CPCB) Designated Best Use criteria:

| CPCB Class | Designated Best Use | Primary Criteria |
|---|---|---|
| **Class A** | Drinking Water Source without conventional treatment but after disinfection | Total Coliform < 50 MPN/100ml, pH 6.5–8.5, DO ≥ 6.0 mg/L, BOD ≤ 2.0 mg/L |
| **Class B** | Outdoor Bathing (Organized) | Total Coliform < 500 MPN/100ml, pH 6.5–8.5, **DO ≥ 5.0 mg/L**, **BOD ≤ 3.0 mg/L** |
| **Class C** | Drinking water source after conventional treatment and disinfection | Total Coliform < 5000 MPN/100ml, pH 6.0–9.0, DO ≥ 4.0 mg/L, BOD ≤ 3.0 mg/L |
| **Class D** | Propagation of Wild life and Fisheries | pH 6.5–8.5, DO ≥ 4.0 mg/L, Free Ammonia ≤ 1.2 mg/L |
| **Class E** | Irrigation, Industrial Cooling, Controlled Waste Disposal | pH 6.0–8.5, Electrical Conductivity ≤ 2250 µS/cm, SAR < 26, Boron < 2 mg/L |

*Note: Measurements exceeding thresholds are flagged as "Needs Review" or "Needs Further Investigation" rather than automatically labeled unsafe, accounting for seasonal monsoonal sediment load and river reach hydrologic variations.*

---

## 10. Responsible-Use & Regulatory Disclaimer

EcoWatch AI is an informational screening and environmental analytics platform. Statistical anomalies and threshold exceedances serve as operational screening alerts for environmental analysts, river basin authorities, and researchers. They do not constitute certified regulatory non-compliance citations or immediate drinking safety determinations without confirmatory laboratory chemical spectrometry and microbiological assay validation by certified state or central environmental laboratories.
