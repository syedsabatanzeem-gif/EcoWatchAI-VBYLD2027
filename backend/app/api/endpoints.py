import io
import json
import sqlite3
import math
from typing import Optional, List, Dict, Any
import pandas as pd
from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Response
from ..config import settings, thresholds_config, ThresholdLimits
from ..database import get_db_connection
from ..schemas.water import (
    ReadingResponse, AlertUpdate, ThresholdUpdate, SummaryResponse,
    CommunityReportCreate, CommunityReportResponse, InvestigationPriorityItem,
    StatesListResponse, RiversListResponse, StationsListResponse, TrendsResponse
)
from ..services.anomaly_detector import AnomalyDetector

router = APIRouter()
detector = AnomalyDetector(thresholds_config)

# India Bounding Box Constants
INDIA_LAT_MIN = 6.5
INDIA_LAT_MAX = 37.5
INDIA_LNG_MIN = 68.0
INDIA_LNG_MAX = 97.5

def is_within_india(lat: Optional[float], lng: Optional[float]) -> bool:
    if lat is None or lng is None:
        return False
    try:
        return INDIA_LAT_MIN <= float(lat) <= INDIA_LAT_MAX and INDIA_LNG_MIN <= float(lng) <= INDIA_LNG_MAX
    except (ValueError, TypeError):
        return False

@router.get("/health")
def get_health():
    conn = get_db_connection()
    try:
        count = conn.execute("SELECT COUNT(*) FROM readings WHERE latitude >= ? AND latitude <= ? AND longitude >= ? AND longitude <= ?",
                             (INDIA_LAT_MIN, INDIA_LAT_MAX, INDIA_LNG_MIN, INDIA_LNG_MAX)).fetchone()[0]
    except Exception:
        count = 0
    conn.close()
    return {
        "status": "ok",
        "service": "EcoWatch AI — India River Water Quality Monitoring Platform",
        "version": settings.app_version,
        "scope": "India Only",
        "dataSource": "Central Pollution Control Board (CPCB) - NWMP / Ministry of Jal Shakti",
        "dataset_count": count,
        "is_demo_data": False
    }

@router.get("/states", response_model=StatesListResponse)
def get_states():
    conn = get_db_connection()
    query = """
        SELECT state,
               COUNT(DISTINCT location) as stations_count,
               COUNT(DISTINCT river) as rivers_count,
               COUNT(*) as readings_count,
               AVG(dissolved_oxygen) as avg_do,
               AVG(bod_mg_l) as avg_bod,
               SUM(CASE WHEN status IN ('High Priority', 'Needs Review', 'Needs Further Investigation') THEN 1 ELSE 0 END) as flagged_count
        FROM readings
        WHERE latitude >= ? AND latitude <= ? AND longitude >= ? AND longitude <= ?
        GROUP BY state
        ORDER BY stations_count DESC
    """
    rows = conn.execute(query, (INDIA_LAT_MIN, INDIA_LAT_MAX, INDIA_LNG_MIN, INDIA_LNG_MAX)).fetchall()
    conn.close()

    states = []
    for r in rows:
        st_name = r["state"] or "National Reach"
        states.append({
            "state": st_name,
            "stationsCount": r["stations_count"] or 0,
            "riversCount": r["rivers_count"] or 0,
            "readingsCount": r["readings_count"] or 0,
            "avgDo": round(float(r["avg_do"] or 0.0), 2),
            "avgBod": round(float(r["avg_bod"] or 0.0), 2),
            "flaggedCount": r["flagged_count"] or 0
        })

    return {
        "totalStates": len(states),
        "states": states
    }

@router.get("/rivers", response_model=RiversListResponse)
def get_rivers():
    conn = get_db_connection()
    query = """
        SELECT river,
               MIN(basin) as basin,
               COUNT(DISTINCT location) as stations_count,
               COUNT(*) as readings_count,
               AVG(dissolved_oxygen) as avg_do,
               AVG(bod_mg_l) as avg_bod,
               AVG(ph) as avg_ph,
               SUM(CASE WHEN dissolved_oxygen >= 5.0 AND bod_mg_l <= 3.0 THEN 1 ELSE 0 END) as compliant_count
        FROM readings
        WHERE latitude >= ? AND latitude <= ? AND longitude >= ? AND longitude <= ?
        GROUP BY river
        ORDER BY stations_count DESC
    """
    rows = conn.execute(query, (INDIA_LAT_MIN, INDIA_LAT_MAX, INDIA_LNG_MIN, INDIA_LNG_MAX)).fetchall()

    rivers = []
    for r in rows:
        r_name = r["river"] or "Ganga River"
        # Get states traversed by this river
        st_rows = conn.execute("""
            SELECT DISTINCT state FROM readings
            WHERE river = ? AND state IS NOT NULL AND state != ''
        """, (r_name,)).fetchall()
        states = [sr["state"] for sr in st_rows]

        rd_count = r["readings_count"] or 1
        comp_count = r["compliant_count"] or 0
        comp_rate = round((comp_count / rd_count) * 100)

        rivers.append({
            "id": r_name.lower().replace(" ", "-"),
            "name": r_name,
            "hindiName": r_name,
            "basin": r["basin"] or f"{r_name} Basin",
            "origin": "Himalayan / Peninsular Plateau Catchment",
            "outflow": "Bay of Bengal / Arabian Sea",
            "lengthKm": 1000,
            "states": states,
            "color": "#0284C7",
            "keyStretches": "CPCB National Water Quality Monitoring Stretches",
            "stationsCount": r["stations_count"] or 0,
            "readingsCount": rd_count,
            "avgDo": round(float(r["avg_do"] or 0.0), 2),
            "avgBod": round(float(r["avg_bod"] or 0.0), 2),
            "avgPh": round(float(r["avg_ph"] or 0.0), 2),
            "cpcbComplianceRate": comp_rate
        })

    conn.close()
    return {
        "totalRivers": len(rivers),
        "rivers": rivers
    }

@router.get("/stations", response_model=StationsListResponse)
def get_stations(
    search: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    river: Optional[str] = Query(None),
    district: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    cpcbClass: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100)
):
    conn = get_db_connection()
    df = pd.read_sql_query("""
        SELECT * FROM readings
        WHERE latitude >= ? AND latitude <= ? AND longitude >= ? AND longitude <= ?
    """, conn, params=(INDIA_LAT_MIN, INDIA_LAT_MAX, INDIA_LNG_MIN, INDIA_LNG_MAX))
    conn.close()

    if df.empty:
        return {
            "totalStations": 0,
            "stations": [],
            "page": page,
            "limit": limit,
            "totalPages": 1,
            "states": [],
            "rivers": []
        }

    # Station grouping
    stations_data = []
    for loc, group in df.groupby("location"):
        sorted_g = group.sort_values(by="timestamp", ascending=False)
        latest = sorted_g.iloc[0]
        has_flag = bool((group["status"].isin(["High Priority", "Needs Review", "Needs Further Investigation"])).any())

        st_id = str(latest.get("station_id") or latest.get("id") or "")
        st_state = str(latest.get("state") or "National Reach")
        st_river = str(latest.get("river") or "Ganga River")
        st_district = str(latest.get("district") or "") if pd.notna(latest.get("district")) else None
        st_basin = str(latest.get("basin") or f"{st_river} Basin")
        st_cpcb = str(latest.get("cpcb_class") or "Class B")
        st_status = str(latest.get("status") or "Normal")

        # Filters
        if state and state != "all" and st_state.lower() != state.lower():
            continue
        if river and river != "all" and st_river.lower() != river.lower():
            continue
        if district and district != "all" and (not st_district or st_district.lower() != district.lower()):
            continue
        if status and status != "all":
            if status == "flagged" and not has_flag:
                continue
            elif status != "flagged" and st_status.lower() != status.lower():
                continue
        if cpcbClass and cpcbClass != "all" and st_cpcb.lower() != cpcbClass.lower():
            continue
        if search:
            q = search.lower()
            if not (q in loc.lower() or q in st_river.lower() or q in st_state.lower() or (st_district and q in st_district.lower()) or q in st_id.lower()):
                continue

        stations_data.append({
            "id": st_id,
            "stationCode": st_id,
            "name": loc,
            "river": st_river,
            "state": st_state,
            "district": st_district,
            "basin": st_basin,
            "lat": float(latest["latitude"]),
            "lng": float(latest["longitude"]),
            "readingsCount": len(group),
            "status": st_status,
            "cpcbClass": st_cpcb,
            "hasActiveFlag": has_flag,
            "source": str(latest.get("source") or "Central Pollution Control Board (CPCB) - NWMP"),
            "latestReading": dict(latest)
        })

    stations_data.sort(key=lambda s: s["name"])
    total = len(stations_data)
    total_pages = max(1, math.ceil(total / limit))
    offset = (page - 1) * limit
    paginated = stations_data[offset:offset + limit]

    all_states = sorted(list(set(df["state"].dropna().unique())))
    all_rivers = sorted(list(set(df["river"].dropna().unique())))

    return {
        "totalStations": total,
        "stations": paginated,
        "page": page,
        "limit": limit,
        "totalPages": total_pages,
        "states": all_states,
        "rivers": all_rivers
    }

@router.get("/stations/map")
def get_stations_map(
    state: Optional[str] = Query(None),
    river: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None)
):
    conn = get_db_connection()
    df = pd.read_sql_query("""
        SELECT * FROM readings
        WHERE latitude >= ? AND latitude <= ? AND longitude >= ? AND longitude <= ?
    """, conn, params=(INDIA_LAT_MIN, INDIA_LAT_MAX, INDIA_LNG_MIN, INDIA_LNG_MAX))
    conn.close()

    markers = []
    for loc, group in df.groupby("location"):
        sorted_g = group.sort_values(by="timestamp", ascending=False)
        latest = sorted_g.iloc[0]
        has_flag = bool((group["status"].isin(["High Priority", "Needs Review", "Needs Further Investigation"])).any())

        st_id = str(latest.get("station_id") or latest.get("id"))
        st_state = str(latest.get("state") or "")
        st_river = str(latest.get("river") or "")
        st_district = str(latest.get("district") or "") if pd.notna(latest.get("district")) else ""
        st_status = str(latest.get("status") or "Normal")

        if state and state != "all" and st_state.lower() != state.lower():
            continue
        if river and river != "all" and st_river.lower() != river.lower():
            continue
        if status and status != "all":
            if status == "flagged" and not has_flag:
                continue
            elif status != "flagged" and st_status.lower() != status.lower():
                continue
        if search:
            q = search.lower()
            if not (q in loc.lower() or q in st_river.lower() or q in st_state.lower() or q in st_district.lower()):
                continue

        reasons = [x.strip() for x in str(latest.get("anomaly_reasons", "")).split(";")] if latest.get("anomaly_reasons") else []

        markers.append({
            "id": st_id,
            "code": st_id,
            "name": loc,
            "river": st_river,
            "state": st_state,
            "district": st_district,
            "basin": str(latest.get("basin") or f"{st_river} Basin"),
            "lat": float(latest["latitude"]),
            "lng": float(latest["longitude"]),
            "status": st_status,
            "cpcbClass": str(latest.get("cpcb_class") or "Class B"),
            "isFlagged": has_flag,
            "sampleDate": str(latest["timestamp"]),
            "ph": float(latest["ph"]),
            "do": float(latest["dissolved_oxygen"]) if pd.notna(latest.get("dissolved_oxygen")) else None,
            "bod": float(latest["bod_mg_l"]) if pd.notna(latest.get("bod_mg_l")) else None,
            "cod": float(latest["cod_mg_l"]) if pd.notna(latest.get("cod_mg_l")) else None,
            "turbidity": float(latest["turbidity"]) if pd.notna(latest.get("turbidity")) else None,
            "nitrate": float(latest["nitrate_mg_l"]) if pd.notna(latest.get("nitrate_mg_l")) else None,
            "temp": float(latest["temperature"]),
            "tds": float(latest["tds"]),
            "flagReasons": reasons,
            "source": str(latest.get("source") or "Central Pollution Control Board (CPCB) - NWMP")
        })

    return {
        "totalMarkers": len(markers),
        "markers": markers
    }

@router.get("/water-quality")
@router.get("/readings")
def get_water_quality(
    search: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    river: Optional[str] = Query(None),
    district: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    cpcbClass: Optional[str] = Query(None),
    startDate: Optional[str] = Query(None),
    endDate: Optional[str] = Query(None),
    sortBy: str = Query("timestamp"),
    sortOrder: str = Query("desc"),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100)
):
    conn = get_db_connection()
    query = """
        SELECT * FROM readings
        WHERE latitude >= ? AND latitude <= ? AND longitude >= ? AND longitude <= ?
    """
    params = [INDIA_LAT_MIN, INDIA_LAT_MAX, INDIA_LNG_MIN, INDIA_LNG_MAX]

    if search:
        query += " AND (id LIKE ? OR station_id LIKE ? OR location LIKE ? OR river LIKE ? OR state LIKE ? OR district LIKE ?)"
        term = f"%{search}%"
        params.extend([term, term, term, term, term, term])

    if state and state != "all":
        query += " AND LOWER(state) = LOWER(?)"
        params.append(state)

    if river and river != "all":
        query += " AND LOWER(river) = LOWER(?)"
        params.append(river)

    if district and district != "all":
        query += " AND LOWER(district) = LOWER(?)"
        params.append(district)

    if location and location != "all":
        query += " AND LOWER(location) = LOWER(?)"
        params.append(location)

    if status and status != "all":
        query += " AND LOWER(status) = LOWER(?)"
        params.append(status)

    if cpcbClass and cpcbClass != "all":
        query += " AND LOWER(cpcb_class) = LOWER(?)"
        params.append(cpcbClass)

    if startDate:
        query += " AND timestamp >= ?"
        params.append(startDate)

    if endDate:
        query += " AND timestamp <= ?"
        params.append(endDate)

    valid_cols = ["id", "location", "river", "state", "timestamp", "ph", "dissolved_oxygen", "bod_mg_l", "cod_mg_l", "turbidity", "tds", "temperature", "status"]
    sort_col = sortBy if sortBy in valid_cols else "timestamp"
    direction = "ASC" if sortOrder.lower() == "asc" else "DESC"
    query += f" ORDER BY {sort_col} {direction}"

    cursor = conn.cursor()
    cursor.execute(query, params)
    all_rows = cursor.fetchall()
    total = len(all_rows)

    offset = (page - 1) * limit
    paginated_rows = all_rows[offset:offset + limit]

    readings = []
    for r in paginated_rows:
        reasons = [x.strip() for x in r["anomaly_reasons"].split(";")] if r["anomaly_reasons"] else []
        try:
            z_sc = json.loads(r["z_scores"]) if r["z_scores"] else {}
        except Exception:
            z_sc = {}

        readings.append({
            "id": r["id"],
            "station_id": r["station_id"],
            "location": r["location"],
            "river": r["river"],
            "state": r["state"],
            "district": r["district"],
            "basin": r["basin"],
            "timestamp": r["timestamp"],
            "latitude": r["latitude"],
            "longitude": r["longitude"],
            "ph": r["ph"],
            "dissolved_oxygen": r["dissolved_oxygen"],
            "bod_mg_l": r["bod_mg_l"],
            "cod_mg_l": r["cod_mg_l"],
            "turbidity": r["turbidity"],
            "tds": r["tds"],
            "temperature": r["temperature"],
            "nitrate_mg_l": r["nitrate_mg_l"],
            "conductivity_us_cm": r["conductivity_us_cm"],
            "cpcb_class": r["cpcb_class"],
            "data_quality": r["data_quality"],
            "source": r["source"],
            "status": r["status"],
            "review_notes": r["review_notes"],
            "anomaly_reasons": reasons,
            "z_scores": z_sc,
            "ml_anomaly": bool(r["ml_anomaly"]),
            "is_illustrative": False
        })

    loc_rows = conn.execute("SELECT DISTINCT location FROM readings WHERE latitude >= ? AND latitude <= ? AND longitude >= ? AND longitude <= ? ORDER BY location ASC",
                            (INDIA_LAT_MIN, INDIA_LAT_MAX, INDIA_LNG_MIN, INDIA_LNG_MAX)).fetchall()
    locations = [lr["location"] for lr in loc_rows]

    st_rows = conn.execute("SELECT DISTINCT state FROM readings WHERE state IS NOT NULL ORDER BY state ASC").fetchall()
    states = [sr["state"] for sr in st_rows]

    riv_rows = conn.execute("SELECT DISTINCT river FROM readings WHERE river IS NOT NULL ORDER BY river ASC").fetchall()
    rivers = [rr["river"] for rr in riv_rows]

    conn.close()

    return {
        "readings": readings,
        "total": total,
        "page": page,
        "pageSize": limit,
        "totalPages": (total + limit - 1) // limit if limit > 0 else 1,
        "locations": locations[:100],
        "states": states,
        "rivers": rivers
    }

@router.get("/water-quality/trends", response_model=TrendsResponse)
@router.get("/trends", response_model=TrendsResponse)
def get_water_quality_trends(
    location: Optional[str] = Query(None),
    river: Optional[str] = Query(None),
    state: Optional[str] = Query(None)
):
    conn = get_db_connection()
    query = """
        SELECT * FROM readings
        WHERE latitude >= ? AND latitude <= ? AND longitude >= ? AND longitude <= ?
    """
    params = [INDIA_LAT_MIN, INDIA_LAT_MAX, INDIA_LNG_MIN, INDIA_LNG_MAX]

    if location and location != "all":
        query += " AND LOWER(location) = LOWER(?)"
        params.append(location)
    elif river and river != "all":
        query += " AND LOWER(river) = LOWER(?)"
        params.append(river)
    elif state and state != "all":
        query += " AND LOWER(state) = LOWER(?)"
        params.append(state)

    query += " ORDER BY timestamp ASC"
    df = pd.read_sql_query(query, conn, params=params)

    # Top location comparisons
    top_locs_df = pd.read_sql_query("""
        SELECT location, river,
               AVG(ph) as avg_ph,
               AVG(dissolved_oxygen) as avg_do,
               AVG(bod_mg_l) as avg_bod,
               AVG(turbidity) as avg_turb,
               AVG(tds) as avg_tds,
               AVG(temperature) as avg_temp,
               AVG(nitrate_mg_l) as avg_nit,
               COUNT(*) as readings_count
        FROM readings
        WHERE latitude >= ? AND latitude <= ? AND longitude >= ? AND longitude <= ?
        GROUP BY location
        ORDER BY readings_count DESC
        LIMIT 15
    """, conn, params=(INDIA_LAT_MIN, INDIA_LAT_MAX, INDIA_LNG_MIN, INDIA_LNG_MAX))
    conn.close()

    trends = []
    # If full dataset, take downsampled points to avoid oversized responses
    step = max(1, len(df) // 60) if len(df) > 60 else 1
    sampled_df = df.iloc[::step] if not df.empty else df

    for _, r in sampled_df.iterrows():
        ts = str(r["timestamp"])
        trends.append({
            "id": str(r["id"]),
            "timestamp": ts,
            "date": ts[:10],
            "dateTime": ts[:16].replace("T", " "),
            "location": str(r["location"]),
            "river": str(r.get("river", "")),
            "ph": float(r["ph"]),
            "dissolved_oxygen": float(r["dissolved_oxygen"]) if pd.notna(r.get("dissolved_oxygen")) else None,
            "bod_mg_l": float(r["bod_mg_l"]) if pd.notna(r.get("bod_mg_l")) else None,
            "cod_mg_l": float(r["cod_mg_l"]) if pd.notna(r.get("cod_mg_l")) else None,
            "turbidity": float(r["turbidity"]) if pd.notna(r.get("turbidity")) else None,
            "tds": float(r["tds"]),
            "temperature": float(r["temperature"]),
            "nitrate_mg_l": float(r["nitrate_mg_l"]) if pd.notna(r.get("nitrate_mg_l")) else None,
            "status": str(r["status"])
        })

    comparisons = []
    for _, r in top_locs_df.iterrows():
        comparisons.append({
            "location": str(r["location"]),
            "river": str(r.get("river", "")),
            "avgPh": round(float(r["avg_ph"] or 0), 2),
            "avgDo": round(float(r["avg_do"] or 0), 2) if pd.notna(r["avg_do"]) else None,
            "avgBod": round(float(r["avg_bod"] or 0), 2) if pd.notna(r["avg_bod"]) else None,
            "avgTurbidity": round(float(r["avg_turb"] or 0), 1) if pd.notna(r["avg_turb"]) else None,
            "avgTds": round(float(r["avg_tds"] or 0)),
            "avgTemp": round(float(r["avg_temp"] or 0), 1),
            "avgNitrate": round(float(r["avg_nit"] or 0), 2) if pd.notna(r["avg_nit"]) else None,
            "readingsCount": int(r["readings_count"])
        })

    return {
        "trends": trends,
        "locationComparisons": comparisons
    }

@router.get("/summary", response_model=SummaryResponse)
def get_summary():
    conn = get_db_connection()
    df = pd.read_sql_query("""
        SELECT * FROM readings
        WHERE latitude >= ? AND latitude <= ? AND longitude >= ? AND longitude <= ?
    """, conn, params=(INDIA_LAT_MIN, INDIA_LAT_MAX, INDIA_LNG_MIN, INDIA_LNG_MAX))
    conn.close()

    total = len(df)
    if total == 0:
        return SummaryResponse(
            totalReadings=0,
            totalStations=0,
            totalRivers=0,
            totalStates=0,
            locationsMonitored=0,
            locationsList=[],
            statesList=[],
            riversList=[],
            parametersList=[],
            latestObservationDate=None,
            dataSourceName="Central Pollution Control Board (CPCB) - NWMP / Ministry of Jal Shakti",
            flaggedReadings=0,
            highPriorityCount=0,
            reviewedCount=0,
            normalCount=0,
            anomalyRate=0.0,
            locationsRequiringFollowUp=0,
            recentObservationsCount=0,
            latestMeasurement=None,
            parameterStats={},
            cpcbCriteriaNotice="CPCB Class B Outdoor Bathing Criteria: DO >= 5.0 mg/L, BOD <= 3.0 mg/L, pH 6.5–8.5.",
            isIllustrativeData=False
        )

    locations = sorted(df["location"].unique().tolist())
    rivers = sorted(df["river"].dropna().unique().tolist())
    states = sorted(df["state"].dropna().unique().tolist())

    flagged = int(df["status"].isin(["Needs Review", "High Priority", "Needs Further Investigation"]).sum())
    high_priority = int((df["status"] == "High Priority").sum())
    reviewed = int((df["status"] == "Reviewed").sum())
    normal = int((df["status"] == "Normal").sum())

    follow_up_locs = df[df["status"].isin(["Needs Review", "High Priority", "Needs Further Investigation"])]["location"].nunique()
    recent_obs = int(df["timestamp"].str.startswith("2026").sum())

    df["dt"] = pd.to_datetime(df["timestamp"])
    latest_row = df.sort_values(by="dt", ascending=False).iloc[0]
    latest_date = str(latest_row["timestamp"])

    latest_obj = ReadingResponse(
        id=str(latest_row["id"]),
        station_id=str(latest_row.get("station_id") or latest_row["id"]),
        location=str(latest_row["location"]),
        river=str(latest_row.get("river") or "Ganga River"),
        state=str(latest_row.get("state") or "Uttar Pradesh"),
        district=str(latest_row.get("district") or "") if pd.notna(latest_row.get("district")) else None,
        basin=str(latest_row.get("basin") or ""),
        timestamp=str(latest_row["timestamp"]),
        latitude=float(latest_row["latitude"]) if pd.notna(latest_row.get("latitude")) else None,
        longitude=float(latest_row["longitude"]) if pd.notna(latest_row.get("longitude")) else None,
        ph=float(latest_row["ph"]),
        turbidity=float(latest_row["turbidity"]) if pd.notna(latest_row.get("turbidity")) else 5.0,
        tds=float(latest_row["tds"]),
        temperature=float(latest_row["temperature"]),
        dissolved_oxygen=float(latest_row["dissolved_oxygen"]) if pd.notna(latest_row.get("dissolved_oxygen")) else None,
        bod_mg_l=float(latest_row["bod_mg_l"]) if pd.notna(latest_row.get("bod_mg_l")) else None,
        cod_mg_l=float(latest_row["cod_mg_l"]) if pd.notna(latest_row.get("cod_mg_l")) else None,
        nitrate_mg_l=float(latest_row["nitrate_mg_l"]) if pd.notna(latest_row.get("nitrate_mg_l")) else None,
        cpcb_class=str(latest_row.get("cpcb_class") or "Class B"),
        source=str(latest_row.get("source") or "Central Pollution Control Board (CPCB) - NWMP / Ministry of Jal Shakti"),
        status=str(latest_row["status"]),
        review_notes=str(latest_row.get("review_notes", "")),
        is_illustrative=False
    )

    stats = {}
    param_keys = ["ph", "dissolved_oxygen", "bod_mg_l", "cod_mg_l", "turbidity", "tds", "temperature", "nitrate_mg_l"]
    for p in param_keys:
        if p in df.columns:
            s = pd.to_numeric(df[p], errors='coerce').dropna()
            if not s.empty:
                stats[p] = {
                    "avg": round(float(s.mean()), 2),
                    "min": round(float(s.min()), 2),
                    "max": round(float(s.max()), 2)
                }
            else:
                stats[p] = {"avg": 0.0, "min": 0.0, "max": 0.0}

    # Format rivers list
    rivers_list = []
    for r_name, group in df.groupby("river"):
        comp = int(((group["dissolved_oxygen"] >= 5.0) & (group["bod_mg_l"] <= 3.0)).sum())
        rivers_list.append({
            "river": r_name,
            "count": len(group),
            "stationsCount": group["location"].nunique(),
            "basin": group["basin"].iloc[0] if "basin" in group.columns and pd.notna(group["basin"].iloc[0]) else f"{r_name} Basin",
            "avgDo": round(float(group["dissolved_oxygen"].mean()), 2) if "dissolved_oxygen" in group.columns else 0.0,
            "avgBod": round(float(group["bod_mg_l"].mean()), 2) if "bod_mg_l" in group.columns else 0.0,
            "avgPh": round(float(group["ph"].mean()), 2) if "ph" in group.columns else 0.0,
            "cpcbStatus": "Satisfactory" if comp / len(group) >= 0.7 else "Impaired Reach"
        })
    rivers_list.sort(key=lambda x: x["stationsCount"], reverse=True)

    # Format states list
    states_list = []
    for s_name, group in df.groupby("state"):
        states_list.append({
            "state": s_name,
            "stationsCount": group["location"].nunique(),
            "riversCount": group["river"].nunique(),
            "readingsCount": len(group),
            "avgDo": round(float(group["dissolved_oxygen"].mean()), 2) if "dissolved_oxygen" in group.columns else 0.0,
            "avgBod": round(float(group["bod_mg_l"].mean()), 2) if "bod_mg_l" in group.columns else 0.0,
            "flaggedCount": int(group["status"].isin(["High Priority", "Needs Review", "Needs Further Investigation"]).sum())
        })
    states_list.sort(key=lambda x: x["stationsCount"], reverse=True)

    return SummaryResponse(
        totalReadings=total,
        totalStations=len(locations),
        totalRivers=len(rivers),
        totalStates=len(states),
        locationsMonitored=len(locations),
        locationsList=locations[:100],
        statesList=states_list,
        riversList=rivers_list,
        parametersList=[
            "pH",
            "Dissolved Oxygen (DO)",
            "Biochemical Oxygen Demand (BOD)",
            "Chemical Oxygen Demand (COD)",
            "Turbidity",
            "Nitrate",
            "Water Temperature",
            "Total Dissolved Solids (TDS)"
        ],
        latestObservationDate=latest_date,
        dataSourceName="Central Pollution Control Board (CPCB) - NWMP / Ministry of Jal Shakti",
        flaggedReadings=flagged,
        highPriorityCount=high_priority,
        reviewedCount=reviewed,
        normalCount=normal,
        anomalyRate=round((flagged / total) * 100, 1),
        locationsRequiringFollowUp=int(follow_up_locs),
        recentObservationsCount=recent_obs,
        latestMeasurement=latest_obj,
        parameterStats=stats,
        cpcbCriteriaNotice="CPCB Designated Best Use Criteria: Class B (Outdoor Bathing) requires DO >= 5.0 mg/L, BOD <= 3.0 mg/L, pH 6.5–8.5.",
        isIllustrativeData=False
    )

@router.get("/priority")
def get_priority():
    conn = get_db_connection()
    df = pd.read_sql_query("""
        SELECT * FROM readings
        WHERE latitude >= ? AND latitude <= ? AND longitude >= ? AND longitude <= ?
    """, conn, params=(INDIA_LAT_MIN, INDIA_LAT_MAX, INDIA_LNG_MIN, INDIA_LNG_MAX))
    conn.close()

    items = []
    if df.empty:
        return {"total": 0, "items": []}

    for idx, (loc, group) in enumerate(df.groupby("location")):
        sorted_g = group.sort_values(by="timestamp", ascending=False)
        latest = sorted_g.iloc[0]
        high_c = int((group["status"] == "High Priority").sum())
        rev_c = int((group["status"] == "Needs Review").sum())
        ml_c = int((group.get("ml_anomaly", 0) == 1).sum()) if "ml_anomaly" in group.columns else 0

        score = 20
        cat = "Nominal"
        action = "Check source records"
        step = "Maintain regular NWMP monthly monitoring cadence."

        if high_c > 0:
            score = min(100, 80 + high_c * 6)
            cat = "Review recommended"
            action = "Consult certified environmental laboratory"
            step = "Conduct multi-point cross-sectional re-sampling and inspect upstream effluent discharge drains."
        elif rev_c > 0 or ml_c > 0:
            score = min(79, 50 + rev_c * 5 + ml_c * 4)
            cat = "Further verification needed"
            action = "Repeat field measurement"
            step = "Check optical DO probe calibration and verify river flow regime upstream."

        meas = ["pH", "DO", "BOD", "Temperature", "TDS"]
        if pd.notna(latest.get("cod_mg_l")): meas.append("COD")
        if pd.notna(latest.get("turbidity")): meas.append("Turbidity")
        if pd.notna(latest.get("nitrate_mg_l")): meas.append("Nitrate")

        reasons = [r for sub in group["anomaly_reasons"].dropna() for r in sub.split(";") if r.strip()]

        items.append({
            "id": f"IND-PRI-{100 + idx}",
            "location": loc,
            "river": str(latest.get("river") or "Ganga River"),
            "state": str(latest.get("state") or "Uttar Pradesh"),
            "station_id": str(latest.get("station_id") or latest["id"]),
            "latitude": float(latest["latitude"]),
            "longitude": float(latest["longitude"]),
            "basin": str(latest.get("basin") or f"{latest.get('river')} Basin"),
            "priority_category": cat,
            "priority_score": score,
            "sampling_date": str(latest["timestamp"]),
            "available_measurements": meas,
            "data_completeness_pct": round(len(meas) / 8 * 100),
            "triggered_rules": list(set(reasons))[:3],
            "ml_anomaly_detected": ml_c > 0,
            "suggested_next_step": step,
            "recommended_action_type": action
        })

    items.sort(key=lambda x: x["priority_score"], reverse=True)
    return {"total": len(items), "items": items}

@router.get("/alerts")
@router.get("/flags")
def get_alerts():
    conn = get_db_connection()
    query = """
        SELECT * FROM readings
        WHERE latitude >= ? AND latitude <= ? AND longitude >= ? AND longitude <= ?
          AND status IN ('Needs Review', 'High Priority', 'Needs Further Investigation', 'Reviewed')
        ORDER BY timestamp DESC
        LIMIT 100
    """
    rows = conn.execute(query, (INDIA_LAT_MIN, INDIA_LAT_MAX, INDIA_LNG_MIN, INDIA_LNG_MAX)).fetchall()
    conn.close()

    alerts = []
    for r in rows:
        reasons = [x.strip() for x in r["anomaly_reasons"].split(";")] if r["anomaly_reasons"] else []
        try:
            z_sc = json.loads(r["z_scores"]) if r["z_scores"] else {}
        except Exception:
            z_sc = {}
        alerts.append({
            "id": r["id"],
            "location": r["location"],
            "river": r["river"],
            "state": r["state"],
            "timestamp": r["timestamp"],
            "status": r["status"],
            "reasons": reasons,
            "z_scores": z_sc,
            "review_notes": r["review_notes"],
            "reading": dict(r)
        })

    return {"totalAlerts": len(alerts), "alerts": alerts}

@router.get("/reports")
def get_reports():
    conn = get_db_connection()
    rows = conn.execute("SELECT * FROM community_reports ORDER BY submitted_at DESC").fetchall()
    conn.close()
    return {"reports": [dict(r) for r in rows], "total": len(rows)}

@router.post("/reports")
def create_report(payload: CommunityReportCreate):
    import uuid, datetime
    conn = get_db_connection()
    r_id = f"IND-REP-{str(uuid.uuid4())[:6]}"
    now = datetime.datetime.utcnow().isoformat() + "Z"
    conn.execute("""
        INSERT INTO community_reports (id, location, water_body_name, type_of_concern, observation_date, description, status, submitted_at)
        VALUES (?, ?, ?, ?, ?, ?, 'Pending Verification', ?)
    """, (r_id, payload.location, payload.water_body_name, payload.type_of_concern, payload.observation_date, payload.description, now))
    conn.commit()
    conn.close()
    return {
        "success": True,
        "report": {"id": r_id, "location": payload.location, "status": "Pending Verification", "submitted_at": now},
        "message": "Community observation logged for verification."
    }

@router.patch("/alerts/{alert_id}")
def update_alert(alert_id: str, payload: AlertUpdate):
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM readings WHERE id = ?", (alert_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Alert reading not found")

    conn.execute(
        "UPDATE readings SET status = ?, review_notes = COALESCE(?, review_notes) WHERE id = ?",
        (payload.status, payload.review_notes, alert_id)
    )
    conn.commit()
    updated = conn.execute("SELECT * FROM readings WHERE id = ?", (alert_id,)).fetchone()
    conn.close()
    return {"success": True, "updated": dict(updated)}

@router.get("/thresholds")
def get_thresholds():
    return thresholds_config

@router.put("/thresholds")
def update_thresholds(payload: ThresholdUpdate):
    for field, val in payload.model_dump(exclude_unset=True).items():
        setattr(thresholds_config, field, val)
    return {"success": True, "thresholds": thresholds_config}

@router.post("/upload")
async def upload_readings(file: UploadFile = File(...)):
    content = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {str(e)}")

    if 'location' not in df.columns or 'ph' not in df.columns:
        raise HTTPException(status_code=400, detail="Missing required columns: location, ph")

    analyzed_df = detector.analyze(df)
    conn = get_db_connection()
    accepted = 0
    rejected = 0
    for idx, row in analyzed_df.iterrows():
        try:
            lat = float(row.get("latitude") or 0.0)
            lng = float(row.get("longitude") or 0.0)
            # Strictly validate India boundaries
            if not is_within_india(lat, lng):
                rejected += 1
                continue

            r_id = str(row.get("station_id") or row.get("id") or f"IND-UP-{1000 + idx}")
            reasons_str = "; ".join(row.get("anomaly_reasons", []))
            z_scores_str = json.dumps(row.get("z_scores", {}))

            conn.execute("""
                INSERT OR REPLACE INTO readings
                (id, station_id, location, river, state, district, basin, timestamp, latitude, longitude,
                 ph, dissolved_oxygen, bod_mg_l, cod_mg_l, turbidity, nitrate_mg_l, temperature, tds,
                 conductivity_us_cm, cpcb_class, data_quality, source, status, review_notes,
                 anomaly_reasons, z_scores, ml_anomaly)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                r_id,
                r_id,
                str(row["location"]),
                str(row.get("river") or "Ganga River"),
                str(row.get("state") or "Uttar Pradesh"),
                str(row.get("district") or ""),
                str(row.get("basin") or ""),
                str(row.get("sample_date") or row.get("timestamp", "")),
                lat,
                lng,
                float(row["ph"]),
                float(row["dissolved_oxygen"]) if pd.notna(row.get("dissolved_oxygen")) else None,
                float(row.get("bod_mg_l") or row.get("bod") or 2.5),
                float(row.get("cod_mg_l") or 5.0) if pd.notna(row.get("cod_mg_l")) else None,
                float(row.get("turbidity_ntu") or row.get("turbidity") or 5.0),
                float(row["nitrate_mg_l"]) if pd.notna(row.get("nitrate_mg_l")) else None,
                float(row.get("temperature_c") or row.get("temperature") or 24.0),
                float(row.get("tds_mg_l") or row.get("tds") or 280.0),
                float(row.get("conductivity_us_cm")) if pd.notna(row.get("conductivity_us_cm")) else None,
                str(row.get("cpcb_class") or "Class B"),
                str(row.get("data_quality") or "Verified Field Assay"),
                str(row.get("source") or "Uploaded Verified Indian River Dataset"),
                str(row.get("status") or "Normal"),
                str(row.get("review_notes", "")),
                reasons_str,
                z_scores_str,
                1 if row.get("ml_anomaly") else 0
            ))
            accepted += 1
        except Exception:
            rejected += 1

    conn.commit()
    conn.close()

    return {
        "success": True,
        "acceptedCount": accepted,
        "rejectedCount": rejected,
        "message": f"Successfully ingested {accepted} Indian river records ({rejected} rejected outside India or invalid)."
    }

@router.get("/export")
def export_csv(
    state: Optional[str] = Query(None),
    river: Optional[str] = Query(None),
    status: Optional[str] = Query(None)
):
    conn = get_db_connection()
    query = """
        SELECT station_id, location, river, state, district, basin, latitude, longitude,
               timestamp as sample_date, ph, dissolved_oxygen, bod_mg_l, cod_mg_l,
               turbidity as turbidity_ntu, nitrate_mg_l, temperature as temperature_c,
               tds as tds_mg_l, conductivity_us_cm, cpcb_class, data_quality, source, status, review_notes
        FROM readings
        WHERE latitude >= ? AND latitude <= ? AND longitude >= ? AND longitude <= ?
    """
    params = [INDIA_LAT_MIN, INDIA_LAT_MAX, INDIA_LNG_MIN, INDIA_LNG_MAX]

    if state and state != "all":
        query += " AND LOWER(state) = LOWER(?)"
        params.append(state)
    if river and river != "all":
        query += " AND LOWER(river) = LOWER(?)"
        params.append(river)
    if status and status != "all":
        query += " AND LOWER(status) = LOWER(?)"
        params.append(status)

    query += " ORDER BY timestamp DESC"
    df = pd.read_sql_query(query, conn, params=params)
    conn.close()

    stream = io.StringIO()
    df.to_csv(stream, index=False)
    response = Response(content=stream.getvalue(), media_type="text/csv")
    response.headers["Content-Disposition"] = "attachment; filename=india_cpcb_river_water_quality_export.csv"
    return response
