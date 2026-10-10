import React from 'react';
import { RefreshCw, CheckCircle2, Building2, Truck, ShieldCheck } from 'lucide-react';

export default function Navbar({ role, setRole, onReseed, isReseeding, healthOk }) {
  return (
    <header className="navbar">
      <div className="navbar-brand">
        <div className="brand-logo">🍲</div>
        <div>
          <h1 className="brand-title">Micro-Donor Food Redistribution</h1>
          <p className="brand-subtitle">Smart Hyperlocal Surplus Clustering & Safe Collection</p>
        </div>
      </div>

      <div className="navbar-controls">
        <div className="role-switcher" role="tablist">
          <button
            type="button"
            className={`role-btn ${role === 'DONOR' ? 'active donor' : ''}`}
            onClick={() => setRole('DONOR')}
            title="Switch to Donor Portal"
          >
            <Building2 size={16} />
            <span>Donor Portal</span>
          </button>
          <button
            type="button"
            className={`role-btn ${role === 'NGO' ? 'active ngo' : ''}`}
            onClick={() => setRole('NGO')}
            title="Switch to NGO Operations"
          >
            <Truck size={16} />
            <span>NGO Operations</span>
          </button>
        </div>

        <button
          type="button"
          className="reseed-btn"
          onClick={onReseed}
          disabled={isReseeding}
          title="Reset & Seed 15 Donors, NGO, and test cases"
        >
          <RefreshCw size={15} className={isReseeding ? 'spin' : ''} />
          <span>{isReseeding ? 'Reseeding...' : 'Reseed Data'}</span>
        </button>

        <div className="health-badge" title="Backend API Health">
          <ShieldCheck size={14} color={healthOk ? '#10b981' : '#ef4444'} />
          <span>{healthOk ? 'API Live' : 'Connecting...'}</span>
        </div>
      </div>
    </header>
  );
}
