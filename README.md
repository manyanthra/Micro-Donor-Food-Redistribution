# Micro-Donor Food Redistribution Platform

> A 24-hour hackathon prototype connecting micro-donors (bakeries, small restaurants, mess halls) with local NGOs via intelligent clustering and safe routing.

## Problem Statement
Small food donors (5–15 surplus meals per night) are traditionally excluded because one individual pickup never justifies vehicle fuel or logistics overhead. Meanwhile, local community NGOs feed dozens of vulnerable people every night. This platform aggregates micro-donors within a 1.5 km college cluster into **ONE safe, feasible, and economically viable collection trip**.

## Technology Stack
- **Backend**: Node.js, Express, MongoDB (Mongoose + `mongodb-memory-server` auto-fallback)
- **Frontend**: React, Vite, Leaflet, OpenStreetMap
- **Validation & Testing**: Zod, Jest, Supertest
- **No setup required**: In-memory database boots automatically if no local MongoDB connection string is provided.

## Quick Start (Zero Setup)

1. **Install dependencies:**
   ```bash
   npm run install:all
   ```

2. **Seed live demo data:**
   ```bash
   npm run seed
   ```

3. **Start the application (Server on :5000 + Client on :5173):**
   ```bash
   npm run dev
   ```

4. **Run backend tests:**
   ```bash
   npm test
   ```

## Architecture & Status Lifecycle
- **Donation lifecycle**: `AVAILABLE` -> `ASSIGNED` -> `COLLECTED` -> `DELIVERED` (alternatives: `CANCELLED`, `REJECTED`)
- **Trip lifecycle**: `PLANNED` -> `IN_PROGRESS` -> `COMPLETED` (or `CANCELLED`)
- **Quantity tracking**: Planned quantity, collected quantity, and delivered quantity are tracked separately. Partial collections (e.g. 7 collected out of 10 offered) flow through all impact calculations.
