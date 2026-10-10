# Project Specification: Micro-Donor Food Redistribution

## 1. Project Overview & Problem Statement
- **Product Name**: Micro-Donor Food Redistribution
- **Context**: 24-hour hackathon prototype.
- **Problem**: Small food donors (e.g., 9 bakeries, 4 small restaurants, 2 hostel messes within a 1.5 km radius of a college, each wasting 5–15 meals nightly) are systematically excluded from surplus food donation programs. A single pickup of 5–10 meals never justifies fuel or logistics costs. Meanwhile, an NGO 3 km away feeds 80+ people nightly.
- **Solution**: A smart clustering and route generation platform that aggregates nearby micro-contributions into **ONE safe, feasible, and economically viable collection trip**.
- **Key Deliverables**:
  1. Surplus food posting by micro-donors with safety validation.
  2. Spatial clustering of nearby contributions.
  3. Safe and optimized collection route generation comparing clustered route vs. individual round-trip baseline.
  4. End-to-end trip execution tracking (Pending -> Collected/Skipped -> Delivered) with actual metrics and impact reporting.

---

## 2. Technology Stack & Constraints
- **Backend**: Node.js + Express (`/server`)
- **Frontend**: React + Vite (`/client`)
- **Database**: MongoDB via Mongoose
  - Uses `MONGODB_URI` from `.env`.
  - If `MONGODB_URI` is unset or database connection fails/absent, auto-start `mongodb-memory-server` for zero-setup execution.
- **Mapping**: Leaflet + OpenStreetMap
- **Validation**: Zod schema validation for inputs and status transitions.
- **Testing**: Jest + Supertest
- **Authentication**: Intentionally simple role switcher (`DONOR` / `NGO`), no auth passwords/tokens needed for hackathon scope.
- **Exclusions**: No AI/LLM runtime dependencies, no payment gateways, no mobile native app, no live GPS hardware tracking.
- **Environment**: Windows / PowerShell compatible scripts throughout.

---

## 3. Core Status Flows & Quantity Tracking Rules

### 3.1 Donation Status Lifecycle
```
AVAILABLE ──> ASSIGNED ──> COLLECTED ──> DELIVERED
    │             │              │
    ├──> CANCELLED├──> SKIPPED   └──> (Recorded delivered)
    └──> REJECTED └──> CANCELLED
```
- Allowed states: `AVAILABLE`, `ASSIGNED`, `COLLECTED`, `DELIVERED`, `CANCELLED`, `REJECTED`.
- Every transition appends an entry to `statusHistory: [{ status, at, note }]`.

### 3.2 Trip Status Lifecycle
```
PLANNED ──> IN_PROGRESS ──> COMPLETED
   │              │
   └─── CANCELLED ┴───> CANCELLED
```
- Allowed states: `PLANNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`.
- Stop states within trip: `PENDING`, `COLLECTED`, `SKIPPED`.

### 3.3 Quantity Rule (Critical)
- **Planned Quantity (`plannedQty`)** vs. **Actual Collected Quantity (`collectedQty`)** vs. **Delivered Quantity (`deliveredQty`)** are stored as separate fields.
- **Partial Collection Rule**: If offered 10 meals, but donor only hands over 7 meals, `collectedQty = 7`. The system counts `7` everywhere in actual metrics, capacity checks, and downstream impact reports — **never** the planned 10.

---

## 4. Food Safety & Operational Configuration (`/server/config/foodRules.js`)

### 4.1 Categories & Safe Windows (Demo Values - Not legal advice)
| Category Key | Label | Safe Window (Minutes) | Compatibility Group | Donatable |
|---|---|---|---|---|
| `cooked_hot` | Cooked Hot Food | 120 (2 hrs) | cooked | `true` |
| `cooked_cold` | Cooked Chilled Food | 180 (3 hrs) | cooked | `true` |
| `bakery_baked` | Bakery / Baked Goods | 480 (8 hrs) | bakery | `true` |
| `packaged_sealed` | Packaged & Sealed Food | 1440 (24 hrs) | packaged | `true` |
| `raw_produce` | Raw Fresh Produce | 720 (12 hrs) | produce | `true` |
| `leftover_plate` | Leftover Plate Scrapings | 0 | cooked | `false` |

### 4.2 Routing & Economic Parameters
- `AVG_SPEED_KMH = 25` (urban transit speed in km/h)
- `STOP_SERVICE_MINUTES = 5` (dwell time per pickup stop)
- `COST_PER_KM = 12` (INR per kilometer)
- `OTHER_TRIP_COST = 50` (INR fixed cost per vehicle dispatch)
- `VEHICLE_CAPACITY_MEALS = 60` (standard collection van/auto capacity)
- `NGO_NIGHTLY_CAPACITY_MEALS = 100` (max capacity for beneficiary intake)
- `CLUSTER_RADIUS_KM = 1.0` (spatial clustering distance limit)
- `MIN_VIABLE_COST_PER_MEAL = 8.0` (INR cost per meal benchmark threshold)
- `BASELINE_TEXT = "each donor gets a separate round trip NGO->donor->NGO"`

---

## 5. Domain Data Models (Mongoose)

### 5.1 Donor
- `name` (String, required)
- `type` (Enum: `'bakery'`, `'restaurant'`, `'hostel_mess'`)
- `address` (String, required)
- `location`: `{ lat: Number, lng: Number }`
- `phone` (String)

### 5.2 Donation
- `donorId` (ObjectId ref Donor)
- `mealsOffered` (Number, >= 1)
- `category` (Enum key from foodRules)
- `readyAt` (Date)
- `collectBy` (Date; calculated default = `readyAt + safeWindowMinutes`, custom override capped to safe window)
- `status` (`AVAILABLE` | `ASSIGNED` | `COLLECTED` | `DELIVERED` | `CANCELLED` | `REJECTED`)
- `statusHistory`: `[{ status: String, at: Date, note: String }]`
- `exclusionReason` (String, optional)
- `plannedQty` (Number, default 0)
- `collectedQty` (Number, default 0)
- `deliveredQty` (Number, default 0)
- `tripId` (ObjectId ref Trip, optional)
- `notes` (String)

### 5.3 Trip
- `ngoId` (ObjectId ref Ngo)
- `status` (`PLANNED` | `IN_PROGRESS` | `COMPLETED` | `CANCELLED`)
- `stops`: Array of:
  - `donationId` (ObjectId ref Donation)
  - `donorId` (ObjectId ref Donor)
  - `order` (Number)
  - `plannedQty` (Number)
  - `collectedQty` (Number, default 0)
  - `eta` (Date)
  - `distanceFromPrevKm` (Number)
  - `status` (`PENDING` | `COLLECTED` | `SKIPPED`)
  - `skipReason` (String)
- `plannedMetrics`: `{ distanceKm, cost, meals, costPerMeal, durationMin }`
- `baselineMetrics`: `{ distanceKm, cost, meals, costPerMeal, durationMin }`
- `actualMetrics`: `{ distanceKm, cost, meals, costPerMeal, durationMin }`
- `excluded`: `[{ donationId, reason }]`
- `deliveredQty` (Number, default 0)
- `startedAt` (Date)
- `completedAt` (Date)
- `ngoConfirmed` (Boolean, default false)

### 5.4 Ngo
- `name` (String, required)
- `address` (String, required)
- `location`: `{ lat: Number, lng: Number }`
- `nightlyCapacity` (Number, default 100)

---

## 6. Seed Dataset Specification
- Deterministic random seed for consistency.
- College reference anchor: `COLLEGE_LAT` / `COLLEGE_LNG` (default: 12.9716, 77.5946).
- 1 NGO located ~3.0 km from college center.
- Exactly 15 micro-donors within 1.5 km of college:
  - 9 bakeries
  - 4 restaurants
  - 2 hostel messes
- Each with 5–15 meals offered, total offered > 120 meals.
- Dynamic relative timestamps (anchored to runtime `new Date()`) so demo is always live:
  - Deliberately included edge cases:
    1. Two very close donors with incompatible deadlines (one urgent window, one long).
    2. One expired donation (`collectBy` in the past).
    3. One non-donatable category (`leftover_plate`).
    4. One tiny 5-meal donor placed further away from clusters.
- Scripts: `npm run seed` and REST endpoint `POST /api/dev/reseed`.

---

## 7. Core User Journey
1. **Post Surplus**: Micro-donor posts meals, category, ready time.
2. **Validate**: Safety rules check donatable status, safe window, expiration.
3. **Cluster**: Engine groups available donations by spatial proximity (<= 1 km) and time window compatibility.
4. **Generate Route**: Greedy/TSP heuristic from NGO -> stops -> NGO respecting vehicle capacity (60 meals).
5. **Start Trip**: NGO dispatches driver; trip status becomes `IN_PROGRESS`, donations `ASSIGNED`.
6. **Collect**: Stops visited sequentially; driver records actual collected quantity or skips with reason.
7. **Deliver**: NGO verifies delivered quantity at depot; trip marked `COMPLETED`, donations `DELIVERED`.
8. **Measure Impact**: Baseline vs. clustered savings (cost, fuel, meals saved).
