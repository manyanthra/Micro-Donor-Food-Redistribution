import React, { useState, useEffect, useCallback } from 'react';
import Navbar from './components/Navbar';
import MapView from './components/MapView';
import DonorPortal from './components/DonorPortal';
import NgoOperations from './components/NgoOperations';
import { 
  fetchHealth, 
  fetchConfig, 
  fetchDonors, 
  fetchDonations, 
  fetchNgo, 
  fetchTrips, 
  reseedDatabase 
} from './services/api';
import './App.css';

export default function App() {
  const [role, setRole] = useState('NGO'); // Default to NGO view for hackathon demo
  const [healthOk, setHealthOk] = useState(false);
  const [config, setConfig] = useState({
    foodCategories: {},
    routingConfig: {},
    college: { lat: 12.9716, lng: 77.5946, name: 'Central Engineering College' }
  });
  const [ngo, setNgo] = useState(null);
  const [donors, setDonors] = useState([]);
  const [donations, setDonations] = useState([]);
  const [trips, setTrips] = useState([]);
  const [activeTrip, setActiveTrip] = useState(null);
  const [selectedDonorId, setSelectedDonorId] = useState(null);
  const [isReseeding, setIsReseeding] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load all initial data from backend
  const loadData = useCallback(async () => {
    try {
      const [hRes, cfgRes, ngoRes, dRes, donRes, tRes] = await Promise.allSettled([
        fetchHealth(),
        fetchConfig(),
        fetchNgo(),
        fetchDonors(),
        fetchDonations(),
        fetchTrips()
      ]);

      if (hRes.status === 'fulfilled' && hRes.value.ok) {
        setHealthOk(true);
      } else {
        setHealthOk(false);
      }

      if (cfgRes.status === 'fulfilled') {
        setConfig(cfgRes.value);
      }

      if (ngoRes.status === 'fulfilled' && ngoRes.value.ok) {
        setNgo(ngoRes.value.ngo);
      }

      if (dRes.status === 'fulfilled' && dRes.value.ok) {
        setDonors(dRes.value.donors);
        if (!selectedDonorId && dRes.value.donors.length > 0) {
          setSelectedDonorId(dRes.value.donors[0]._id);
        }
      }

      if (donRes.status === 'fulfilled' && donRes.value.ok) {
        setDonations(donRes.value.donations);
      }

      if (tRes.status === 'fulfilled' && tRes.value.ok) {
        setTrips(tRes.value.trips);
        const inProgressTrip = tRes.value.trips.find((t) => t.status === 'IN_PROGRESS');
        if (inProgressTrip) {
          setActiveTrip(inProgressTrip);
        } else if (tRes.value.trips.length > 0 && !activeTrip) {
          setActiveTrip(tRes.value.trips[0]);
        }
      }
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedDonorId, activeTrip]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000); // Poll every 10s
    return () => clearInterval(interval);
  }, [loadData]);

  // Reseed demo data handler
  async function handleReseed() {
    setIsReseeding(true);
    try {
      const res = await reseedDatabase();
      if (res.ok) {
        await loadData();
        setActiveTrip(null);
      } else {
        alert(`Reseed failed: ${res.error}`);
      }
    } catch (err) {
      alert(`Reseed error: ${err.message}`);
    } finally {
      setIsReseeding(false);
    }
  }

  return (
    <div className="app-root">
      <Navbar
        role={role}
        setRole={setRole}
        onReseed={handleReseed}
        isReseeding={isReseeding}
        healthOk={healthOk}
      />

      <main className="app-main">
        {/* Interactive Map Row */}
        <section className="map-section">
          <div className="section-header">
            <h3>Geographic Cluster & Route Visualization</h3>
            <span className="subtitle">
              Anchor: {config.college?.name} (1.5 km perimeter) | NGO Depot: ~3.0 km North
            </span>
          </div>
          <MapView
            college={config.college}
            ngo={ngo}
            donors={donors}
            activeTrip={activeTrip}
            selectedDonorId={selectedDonorId}
            onSelectDonor={(donor) => {
              setSelectedDonorId(donor._id);
              if (role !== 'DONOR') setRole('DONOR');
            }}
          />
        </section>

        {/* Role Content Row */}
        <section className="role-content-section">
          {role === 'DONOR' ? (
            <DonorPortal
              donors={donors}
              selectedDonorId={selectedDonorId}
              setSelectedDonorId={setSelectedDonorId}
              categories={config.foodCategories || {}}
              donations={donations}
              onRefresh={loadData}
            />
          ) : (
            <NgoOperations
              ngo={ngo}
              donors={donors}
              donations={donations}
              trips={trips}
              activeTrip={activeTrip}
              setActiveTrip={setActiveTrip}
              categories={config.foodCategories || {}}
              routingConfig={config.routingConfig || {}}
              onRefresh={loadData}
            />
          )}
        </section>
      </main>

      <footer className="app-footer">
        <p>
          Micro-Donor Food Redistribution Platform &bull; Prototype for 24-hour Hackathon &bull; Demo Simulation Only
        </p>
      </footer>
    </div>
  );
}
