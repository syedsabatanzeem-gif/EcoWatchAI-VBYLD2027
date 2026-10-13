import pytest
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)

def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "version" in data
    assert data["scope"] == "India Only"
    assert data["is_demo_data"] is False

def test_get_states():
    response = client.get("/api/states")
    assert response.status_code == 200
    data = response.json()
    assert "totalStates" in data
    assert "states" in data
    assert isinstance(data["states"], list)

def test_get_rivers():
    response = client.get("/api/rivers")
    assert response.status_code == 200
    data = response.json()
    assert "totalRivers" in data
    assert "rivers" in data
    assert isinstance(data["rivers"], list)

def test_get_stations():
    response = client.get("/api/stations?limit=10")
    assert response.status_code == 200
    data = response.json()
    assert "totalStations" in data
    assert "stations" in data
    assert "page" in data
    assert "totalPages" in data

def test_get_water_quality_readings():
    response = client.get("/api/water-quality?limit=5")
    assert response.status_code == 200
    data = response.json()
    assert "readings" in data
    assert "total" in data
    assert "totalPages" in data

def test_get_water_quality_trends():
    response = client.get("/api/water-quality/trends")
    assert response.status_code == 200
    data = response.json()
    assert "trends" in data
    assert "locationComparisons" in data

def test_get_summary_structure():
    response = client.get("/api/summary")
    assert response.status_code == 200
    data = response.json()
    assert "totalReadings" in data
    assert "totalStations" in data
    assert "totalRivers" in data
    assert "totalStates" in data
    assert "locationsMonitored" in data
    assert "flaggedReadings" in data
    assert "locationsRequiringFollowUp" in data
    assert "cpcbCriteriaNotice" in data
    assert data["isIllustrativeData"] is False

def test_get_thresholds():
    response = client.get("/api/thresholds")
    assert response.status_code == 200
    data = response.json()
    assert "ph_min" in data
    assert "dissolved_oxygen_min" in data
    assert "bod_max" in data

def test_get_priority_queue():
    response = client.get("/api/priority")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data

def test_community_report_submission():
    payload = {
        "location": "Ganga River at Assi Ghat, Varanasi",
        "water_body_name": "Ganga River",
        "type_of_concern": "Discoloration",
        "observation_date": "2026-03-30",
        "description": "Noticeable cloudy runoff near bathing ghat steps following rainfall."
    }
    response = client.post("/api/reports", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "report" in data
