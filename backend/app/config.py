import os
from pydantic import BaseModel

class ThresholdLimits(BaseModel):
    ph_min: float = 6.5
    ph_max: float = 8.5
    dissolved_oxygen_min: float = 5.0  # mg/L (CPCB Class B Outdoor Bathing minimum)
    bod_max: float = 3.0  # mg/L (CPCB Class B Outdoor Bathing maximum)
    cod_max: float = 250.0  # mg/L (CPCB inland surface water standard)
    turbidity_max: float = 10.0  # NTU
    tds_max: float = 500.0  # mg/L
    temp_min: float = 10.0  # Celsius
    temp_max: float = 35.0  # Celsius
    nitrate_max: float = 10.0  # mg/L as NO3-N (WHO/CPCB drinking standard)
    z_score_threshold: float = 2.5
    iqr_multiplier: float = 1.5
    enable_ml_detection: bool = True

class Settings(BaseModel):
    app_name: str = "EcoWatch AI — India River Water Quality Platform API"
    app_version: str = "4.0.0-india-cpcb"
    db_path: str = os.getenv("DB_PATH", "ecowatch_water.db")
    sample_csv_path: str = os.getenv("SAMPLE_CSV_PATH", "data/india_cpcb_river_water_quality.csv")
    allowed_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000", "*"]

settings = Settings()
thresholds_config = ThresholdLimits()
