import sqlite3
import os
import csv
from .config import settings

def get_db_connection():
    conn = sqlite3.connect(settings.db_path)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS readings (
            id TEXT PRIMARY KEY,
            station_id TEXT,
            location TEXT NOT NULL,
            river TEXT DEFAULT 'Ganga River',
            state TEXT DEFAULT 'National Reach',
            district TEXT DEFAULT '',
            basin TEXT DEFAULT '',
            latitude REAL,
            longitude REAL,
            timestamp TEXT NOT NULL,
            ph REAL NOT NULL,
            dissolved_oxygen REAL,
            bod_mg_l REAL DEFAULT 2.0,
            cod_mg_l REAL,
            turbidity REAL DEFAULT 5.0,
            nitrate_mg_l REAL,
            temperature REAL NOT NULL,
            tds REAL NOT NULL,
            conductivity_us_cm REAL,
            cpcb_class TEXT DEFAULT 'Class B',
            data_quality TEXT DEFAULT 'Verified CPCB Lab Assay',
            source TEXT DEFAULT 'Central Pollution Control Board (CPCB) - NWMP / Ministry of Jal Shakti',
            status TEXT NOT NULL DEFAULT 'Normal',
            review_notes TEXT DEFAULT '',
            anomaly_reasons TEXT DEFAULT '',
            z_scores TEXT DEFAULT '{}',
            ml_anomaly INTEGER DEFAULT 0
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS community_reports (
            id TEXT PRIMARY KEY,
            location TEXT NOT NULL,
            water_body_name TEXT,
            type_of_concern TEXT NOT NULL,
            observation_date TEXT NOT NULL,
            description TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'Pending Verification',
            submitted_at TEXT NOT NULL
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS thresholds (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            ph_min REAL,
            ph_max REAL,
            dissolved_oxygen_min REAL,
            bod_max REAL,
            cod_max REAL,
            turbidity_max REAL,
            tds_max REAL,
            temp_min REAL,
            temp_max REAL,
            nitrate_max REAL,
            z_score_threshold REAL,
            iqr_multiplier REAL,
            enable_ml_detection INTEGER
        )
    """)

    # Seed initial data from India CPCB CSV if table is empty
    count = cursor.execute("SELECT COUNT(*) FROM readings").fetchone()[0]
    if count == 0:
        csv_path = settings.sample_csv_path
        if not os.path.exists(csv_path):
            csv_path = os.path.join(os.path.dirname(__file__), "..", "..", "data", "india_cpcb_river_water_quality.csv")

        if os.path.exists(csv_path):
            with open(csv_path, mode="r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                rows_to_insert = []
                idx = 0
                for row in reader:
                    idx += 1
                    lat = float(row.get("latitude") or 0.0)
                    lng = float(row.get("longitude") or 0.0)

                    # Strictly validate Indian boundary coordinates
                    if lat < 6.5 or lat > 37.5 or lng < 68.0 or lng > 97.5:
                        continue

                    r_id = row.get("station_id") or f"CPCB-{idx}"
                    do_val = float(row.get("dissolved_oxygen_mg_l") or row.get("dissolved_oxygen") or 6.5)
                    bod_val = float(row.get("bod_mg_l") or 2.5)

                    rows_to_insert.append((
                        f"{r_id}-{row.get('sample_date', '')}",
                        r_id,
                        row.get("location", "River Monitoring Station"),
                        row.get("river", "Ganga River"),
                        row.get("state", "Uttar Pradesh"),
                        row.get("district", ""),
                        row.get("basin", ""),
                        lat,
                        lng,
                        row.get("sample_date", ""),
                        float(row.get("ph") or 7.5),
                        do_val,
                        bod_val,
                        float(row.get("cod_mg_l")) if row.get("cod_mg_l") else None,
                        float(row.get("turbidity_ntu") or row.get("turbidity") or 5.0),
                        float(row.get("nitrate_mg_l")) if row.get("nitrate_mg_l") else None,
                        float(row.get("temperature_c") or row.get("temperature") or 24.0),
                        float(row.get("tds_mg_l") or row.get("tds") or 280.0),
                        float(row.get("conductivity_us_cm")) if row.get("conductivity_us_cm") else None,
                        row.get("cpcb_class", "Class B"),
                        row.get("data_quality", "Verified CPCB Lab Assay"),
                        row.get("source", "Central Pollution Control Board (CPCB) - NWMP / Ministry of Jal Shakti"),
                        row.get("status", "Normal"),
                        row.get("review_notes", ""),
                        "",
                        "{}",
                        0
                    ))

                if rows_to_insert:
                    cursor.executemany("""
                        INSERT OR IGNORE INTO readings (
                            id, station_id, location, river, state, district, basin, latitude, longitude, timestamp,
                            ph, dissolved_oxygen, bod_mg_l, cod_mg_l, turbidity, nitrate_mg_l, temperature,
                            tds, conductivity_us_cm, cpcb_class, data_quality, source, status, review_notes,
                            anomaly_reasons, z_scores, ml_anomaly
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, rows_to_insert)

    conn.commit()
    conn.close()
