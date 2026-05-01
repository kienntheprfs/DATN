# Test Strategy - Wayfinder

## 1. Overview

| Item | Description |
|------|------------|
| Project | Wayfinder - Indoor Navigation Service |
| Test Framework | pytest |
| Test Type | Unit Tests, Integration Tests |
| API Base | http://localhost:8004 |

## 2. Test Scope

### 2.1 Route Logic (RL)
- Angle calculation between points
- Turn action determination (straight, left, right)
- Path geometry calculations

### 2.2 Geo Service (GS)
- Polyline length calculation
- Distance measurement
- Point-to-point distance

### 2.3 NLP Service (NL)
- Location name normalization
- A-to-B extraction from natural language
- Vietnamese text processing

## 3. Test Environment Setup

```bash
# Install dependencies
pip install -r requirements.txt

# Run tests
pytest

# Run with coverage
pytest --cov=backend --cov-report=html
```

---

## Test Cases

### RL - Route Logic

| ID | Test Name | Test Data | Expected Result | Status |
|----|-----------|----------|----------------|--------|
| RL-001 | Tính góc đường thẳng | P1(0,0), P2(1,0), P3(2,0) | angle = 0° | Passed |
| RL-002 | Tính góc quay phải 90° | P1(0,0), P2(1,0), P3(1,1) | angle ≈ 90° | Passed |
| RL-003 | Tính góc quay trái 90° | P1(0,0), P2(1,0), P3(1,-1) | angle ≈ -90° | Passed |
| RL-004 | Tiếp tục đi thẳng | P1(0,0), P2(1,1), P3(2,2) | angle ≈ 0° | Passed |
| RL-005 | Hành động straight (0°)) | angle = 0 | "straight" | Passed |
| RL-006 | Hành động straight (±10°) | angle = 10 | "straight" | Passed |
| RL-007 | Hành động slight right | angle = 20 | "slight_right" | Passed |
| RL-008 | Hành động slight right (44°) | angle = 44 | "slight_right" | Passed |
| RL-009 | Hành động slight left | angle = -20 | "slight_left" | Passed |
| RL-010 | Hành động slight left (-44°) | angle = -44 | "slight_left" | Passed |
| RL-011 | Hành động right (46-180°) | angle = 46 | "right" | Passed |
| RL-012 | Hành động right (90°) | angle = 90 | "right" | Passed |
| RL-013 | Hành động right (180°) | angle = 180 | "right" | Passed |
| RL-014 | Hành động left (-46°) | angle = -46 | "left" | Passed |
| RL-015 | Hành động left (-90°) | angle = -90 | "left" | Passed |
| RL-016 | Hành động left (-180°) | angle = -180 | "left" | Passed |

### GS - Geo Service

| ID | Test Name | Test Data | Expected Result | Status |
|----|-----------|----------|----------------|--------|
| GS-001 | Độ dài polyline rỗng | [] | 0.0 | Passed |
| GS-002 | Độ dài 1 điểm | [(0, 0)] | 0.0 | Passed |
| GS-003 | Độ dài 2 điểm | [(0, 0), (3, 4)] | 5.0 | Passed |
| GS-004 | Độ dài 3 điểm | [(0, 0), (3, 0), (3, 4)] | 7.0 | Passed |
| GS-005 | Độ dài đường thẳng | [(0, 0), (1, 0), (2, 0), (3, 0)] | 3.0 | Passed |
| GS-006 | Độ dài phức tạp | [(0, 0), (1, 1), (2, 2), (3, 3)] | ≈ 4.2426 | Passed |

### NL - NLP Service

| ID | Test Name | Test Data | Expected Result | Status |
|----|-----------|----------|----------------|--------|
| NL-001 | Normalize chuỗi rỗng | "" | "" | Passed |
| NL-002 | Normalize None | None | "" | Passed |
| NL-003 | Normalize lowercase | "HELLO WORLD" | "hello world" | Passed |
| NL-004 | Normalize strip whitespace | "  hello  " | "hello" | Passed |
| NL-005 | Normalize giữ tiếng Việt | "Phòng Học" | "phòng học" | Passed |
| NL-006 | Extract "Từ...đến" | "Từ Sảnh A đến Thang máy" | start="sảnh a", end="thang máy" | Passed |
| NL-007 | Extract "Đi từ...tới" | "Đi từ Phòng 101 tới Phòng 202" | start="phòng 101", end="phòng 202" | Passed |
| NL-008 | Extract "Từ...sang" | "Từ Nhà vệ sinh sang Căn tin" | start="nhà vệ sinh", end="căn tin" | Passed |
| NL-009 | Extract "Từ...về" | "Từ Sân vườn về Sảnh chính" | start="sân vườn", end="sảnh chính" | Passed |
| NL-010 | Extract chỉ có đích | "Đến Thang máy" | start=None, end="thang máy" | Passed |
| NL-011 | Extract "Tìm" | "Tìm Phòng Họp" | start=None, end="phòng họp" | Passed |
| NL-012 | Extract chỉ địa điểm | "Phòng 101" | start=None, end="phòng 101" | Passed |
| NL-013 | Extract nhiều từ | "Đi từ Khoa Công Nghệ Thông Tin đến Phòng Hành Chính" | start="khoa công nghệ thông tin", end="phòng hành chính" | Passed |

---

## 4. Test File Structure

```
wayfinder/
├── backend/
│   ├── tests/
│   │   └── unit/
│   │       ├── test_route_logic.py
│   │       ├── test_geo_service.py
│   │       └── test_nlp_service.py
│   ├── routers/
│   │   └── routes.py
│   └── services/
│       ├── geo.py
│       └── nlp.py
```

## 5. Running Tests

```bash
# All unit tests
pytest backend/tests/unit/ -v

# Specific test file
pytest backend/tests/unit/test_route_logic.py -v

# With coverage
pytest backend/tests/unit/ --cov=backend --cov-report=term-missing
```

---

## 6. API Endpoints (Test coverage)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/maps/search` | POST | Search location |
| `/api/maps/navigate` | POST | Calculate route |
| `/health` | GET | Health check |