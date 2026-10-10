import React, { useState } from 'react';
import { 
  Truck, 
  MapPin, 
  Clock, 
  TrendingDown, 
  CheckCircle, 
  AlertCircle, 
  Play, 
  CheckCheck, 
  SkipForward, 
  PackageCheck, 
  Percent, 
  DollarSign, 
  Layers, 
  AlertTriangle 
} from 'lucide-react';
import { 
  clusterAndPlanTrip, 
  startTrip, 
  updateTripStop, 
  completeTrip, 
  cancelTrip 
} from '../services/api';

export default function NgoOperations({
  ngo,
  donors = [],
  donations = [],
  trips = [],
  activeTrip,
  setActiveTrip,
  categories = {},
  routingConfig = {},
  onRefresh
}) {
  const [planning, setPlanning] = useState(false);
  const [previewPlan, setPreviewPlan] = useState(null);
  const [skipModal, setSkipModal] = useState(null); // { tripId, stopOrder }
  const [skipReasonText, setSkipReasonText] = useState('');
  const [stopCollectedInputs, setStopCollectedInputs] = useState({});
  const [deliveredInput, setDeliveredInput] = useState('');
  const [planningError, setPlanningError] = useState('');

  // Available meals currently in cluster
  const availableDonations = donations.filter((d) => d.status === 'AVAILABLE');
  const availableMealsTotal = availableDonations.reduce((sum, d) => sum + d.mealsOffered, 0);

  // Handle clustering and route generation preview
  async function handleClusterAndPlan() {
    setPlanning(true);
    setPlanningError('');
    setPreviewPlan(null);
    try {
      const res = await clusterAndPlanTrip(false); // commit = false (preview mode)
      if (res.ok) {
        setPreviewPlan(res);
      } else {
        setPlanningError(res.error || 'Failed to cluster and plan route');
      }
    } catch (err) {
      setPlanningError(err.message);
    } finally {
      setPlanning(false);
    }
  }

  // Commit and dispatch trip
  async function handleCommitAndDispatch() {
    setPlanning(true);
    setPlanningError('');
    try {
      const planRes = await clusterAndPlanTrip(true); // commit = true
      if (planRes.ok && planRes.trip) {
        // Now start the trip immediately
        const startRes = await startTrip(planRes.trip._id);
        if (startRes.ok) {
          setActiveTrip(startRes.trip);
          setPreviewPlan(null);
          onRefresh();
        } else {
          setPlanningError(startRes.error || 'Failed to start trip');
        }
      } else {
        setPlanningError(planRes.error || 'Failed to commit planned trip');
      }
    } catch (err) {
      setPlanningError(err.message);
    } finally {
      setPlanning(false);
    }
  }

  // Handle Stop Collection (with partial collection support)
  async function handleCollectStop(stop) {
    if (!activeTrip) return;
    const inputVal = stopCollectedInputs[stop.order];
    const qty = inputVal !== undefined && inputVal !== '' ? Number(inputVal) : stop.plannedQty;

    try {
      const res = await updateTripStop(activeTrip._id, stop.order, {
        action: 'COLLECT',
        collectedQty: qty
      });
      if (res.ok) {
        setActiveTrip(res.trip);
        onRefresh();
      } else {
        alert(res.error || 'Failed to record stop collection');
      }
    } catch (err) {
      alert(err.message);
    }
  }

  // Open skip stop modal
  function openSkipModal(stop) {
    setSkipModal({ tripId: activeTrip._id, stopOrder: stop.order, donorName: stop.donorId?.name || stop.donor?.name });
    setSkipReasonText('Donor unavailable / insufficient quantity');
  }

  // Confirm Skip Stop
  async function handleConfirmSkip() {
    if (!skipModal) return;
    try {
      const res = await updateTripStop(skipModal.tripId, skipModal.stopOrder, {
        action: 'SKIP',
        skipReason: skipReasonText
      });
      if (res.ok) {
        setActiveTrip(res.trip);
        setSkipModal(null);
        onRefresh();
      } else {
        alert(res.error || 'Failed to skip stop');
      }
    } catch (err) {
      alert(err.message);
    }
  }

  // Complete Trip at NGO Depot
  async function handleCompleteTrip() {
    if (!activeTrip) return;
    const totalCollected = activeTrip.stops.reduce((sum, s) => {
      return s.status === 'COLLECTED' ? sum + (s.collectedQty || 0) : sum;
    }, 0);

    const deliveredQty = deliveredInput !== '' ? Number(deliveredInput) : totalCollected;

    if (!window.confirm(`Confirm intake of ${deliveredQty} meals at ${ngo?.name || 'NGO Depot'}?`)) {
      return;
    }

    try {
      const res = await completeTrip(activeTrip._id, {
        deliveredQty,
        ngoConfirmed: true
      });
      if (res.ok) {
        setActiveTrip(res.trip);
        setDeliveredInput('');
        onRefresh();
      } else {
        alert(res.error || 'Failed to complete trip');
      }
    } catch (err) {
      alert(err.message);
    }
  }

  // Cancel Trip
  async function handleCancelTrip(tripId) {
    if (!window.confirm('Cancel this collection trip?')) return;
    try {
      const res = await cancelTrip(tripId);
      if (res.ok) {
        setActiveTrip(null);
        onRefresh();
      }
    } catch (err) {
      alert(err.message);
    }
  }

  // Current trip progress stats
  const completedStopsCount = activeTrip?.stops?.filter((s) => s.status === 'COLLECTED' || s.status === 'SKIPPED').length || 0;
  const collectedMealsOnboard = activeTrip?.stops?.reduce((sum, s) => {
    return s.status === 'COLLECTED' ? sum + (s.collectedQty || 0) : sum;
  }, 0) || 0;
  const allStopsProcessed = activeTrip && activeTrip.stops.length > 0 && completedStopsCount === activeTrip.stops.length;

  return (
    <div className="ngo-operations">
      {/* KPI Header Cards */}
      <div className="ngo-kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Target Nightly Feeding</div>
          <div className="kpi-value">80 people</div>
          <div className="kpi-sub">Depot Capacity: {ngo?.nightlyCapacity || 100} meals</div>
        </div>

        <div className="kpi-card highlight">
          <div className="kpi-label">Available Surplus in 1.5km Zone</div>
          <div className="kpi-value">{availableMealsTotal} meals</div>
          <div className="kpi-sub">{availableDonations.length} active donor postings</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Vehicle Capacity</div>
          <div className="kpi-value">{routingConfig.VEHICLE_CAPACITY_MEALS || 60} meals</div>
          <div className="kpi-sub">Standard collection van/auto</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Baseline Rule</div>
          <div className="kpi-value">₹{routingConfig.COST_PER_KM || 12}/km</div>
          <div className="kpi-sub">{routingConfig.BASELINE_TEXT || 'NGO->donor->NGO'}</div>
        </div>
      </div>

      {/* ACTIVE IN-PROGRESS TRIP BANNER */}
      {activeTrip && activeTrip.status === 'IN_PROGRESS' && (
        <div className="active-trip-banner">
          <div className="banner-top">
            <div className="banner-title">
              <Truck className="trip-icon pulse" size={22} />
              <div>
                <h4>Trip In Progress #{activeTrip._id.slice(-6)}</h4>
                <p>Started at {new Date(activeTrip.startedAt).toLocaleTimeString()} | En route through college cluster</p>
              </div>
            </div>

            <div className="banner-stats">
              <div className="stat-pill">
                <span>Stops:</span>
                <strong>{completedStopsCount} / {activeTrip.stops.length}</strong>
              </div>
              <div className="stat-pill highlight">
                <span>Meals Onboard:</span>
                <strong>{collectedMealsOnboard} meals</strong>
              </div>
            </div>
          </div>

          {/* Stop checklist */}
          <div className="stops-execution-list">
            <h5>Collection Route Stops (Sequenced for safety & minimum fuel)</h5>
            {activeTrip.stops.map((stop) => {
              const donor = stop.donorId || stop.donor;
              const inputQty = stopCollectedInputs[stop.order] ?? stop.plannedQty;

              return (
                <div key={stop.order} className={`stop-execution-card ${stop.status.toLowerCase()}`}>
                  <div className="stop-badge">#{stop.order}</div>
                  <div className="stop-details">
                    <div className="stop-name-row">
                      <h6>{donor?.name || 'Micro-Donor'}</h6>
                      <span className="stop-eta">ETA: {new Date(stop.eta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="stop-address">📍 {donor?.address} | +{stop.distanceFromPrevKm} km from prev</p>
                    <div className="stop-quantities">
                      <span>Planned: <strong>{stop.plannedQty} meals</strong></span>
                      {stop.status === 'COLLECTED' && (
                        <span className="collected-tag">
                          Actual Collected: <strong>{stop.collectedQty} meals</strong>
                          {stop.collectedQty !== stop.plannedQty && (
                            <em> (Partial: planned {stop.plannedQty})</em>
                          )}
                        </span>
                      )}
                      {stop.status === 'SKIPPED' && (
                        <span className="skipped-tag">Skipped: {stop.skipReason}</span>
                      )}
                    </div>
                  </div>

                  <div className="stop-actions">
                    {stop.status === 'PENDING' ? (
                      <div className="action-row">
                        <div className="qty-input-group">
                          <label>Collected:</label>
                          <input
                            type="number"
                            min="0"
                            max={stop.plannedQty}
                            value={inputQty}
                            onChange={(e) =>
                              setStopCollectedInputs({
                                ...stopCollectedInputs,
                                [stop.order]: e.target.value
                              })
                            }
                            className="input-qty-small"
                          />
                        </div>
                        <button
                          type="button"
                          className="btn-collect"
                          onClick={() => handleCollectStop(stop)}
                        >
                          <CheckCircle size={15} />
                          <span>Collect</span>
                        </button>
                        <button
                          type="button"
                          className="btn-skip"
                          onClick={() => openSkipModal(stop)}
                        >
                          <SkipForward size={14} />
                          <span>Skip</span>
                        </button>
                      </div>
                    ) : (
                      <span className={`status-pill ${stop.status}`}>
                        {stop.status}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Depot Delivery Reception */}
          <div className="depot-delivery-card">
            <div className="delivery-info">
              <PackageCheck size={24} className="depot-icon" />
              <div>
                <h5>Depot Intake & Verification (Depot: {ngo?.name})</h5>
                <p>
                  Return leg back to NGO depot completes route. Confirm delivered meals counted at the door.
                </p>
              </div>
            </div>

            <div className="delivery-controls">
              <div className="intake-input-wrap">
                <label>Verified Delivered Meals:</label>
                <input
                  type="number"
                  min="0"
                  placeholder={String(collectedMealsOnboard)}
                  value={deliveredInput}
                  onChange={(e) => setDeliveredInput(e.target.value)}
                  className="input-field-depot"
                />
              </div>

              <button
                type="button"
                className="btn-complete-trip"
                onClick={handleCompleteTrip}
              >
                <CheckCheck size={18} />
                <span>Complete Trip & Verify Delivery</span>
              </button>

              <button
                type="button"
                className="btn-cancel-trip"
                onClick={() => handleCancelTrip(activeTrip._id)}
              >
                Cancel Trip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CLUSTERING & ROUTE PLANNING SECTION */}
      {(!activeTrip || activeTrip.status !== 'IN_PROGRESS') && (
        <div className="route-planning-card">
          <div className="planning-header">
            <Layers className="planning-icon" size={20} />
            <div>
              <h4>Hyperlocal Spatial Clustering & Safe Route Generator</h4>
              <p>
                Clusters nearby micro-donors within 1.0 km radius and generates an optimal sequence (Greedy TSP) respecting vehicle capacity (60 meals) and safe food holding windows.
              </p>
            </div>
          </div>

          {planningError && (
            <div className="alert-box error">
              <AlertTriangle size={16} />
              <span>{planningError}</span>
            </div>
          )}

          <div className="planning-action-row">
            <button
              type="button"
              className="btn-plan-route"
              onClick={handleClusterAndPlan}
              disabled={planning || availableDonations.length === 0}
            >
              <TrendingDown size={17} />
              <span>{planning ? 'Clustering & Routing...' : 'Cluster Surplus & Generate Route'}</span>
            </button>

            {previewPlan && (
              <button
                type="button"
                className="btn-dispatch"
                onClick={handleCommitAndDispatch}
                disabled={planning}
              >
                <Play size={16} />
                <span>Commit & Dispatch Trip Now</span>
              </button>
            )}
          </div>

          {/* ROUTE PREVIEW & ECONOMIC COMPARISON */}
          {previewPlan && previewPlan.route && (
            <div className="plan-preview-results">
              {/* Comparison Matrix */}
              <div className="comparison-grid">
                {/* Clustered Route */}
                <div className="metric-box clustered">
                  <div className="metric-box-title">
                    <Truck size={16} />
                    <span>Clustered Single Trip (Aggregated)</span>
                  </div>
                  <div className="metric-row">
                    <span className="lbl">Total Distance:</span>
                    <strong className="val">{previewPlan.route.plannedMetrics.distanceKm} km</strong>
                  </div>
                  <div className="metric-row">
                    <span className="lbl">Vehicle & Fuel Cost:</span>
                    <strong className="val">₹{previewPlan.route.plannedMetrics.cost}</strong>
                  </div>
                  <div className="metric-row">
                    <span className="lbl">Meals Rescued:</span>
                    <strong className="val highlight">{previewPlan.route.plannedMetrics.meals} meals</strong>
                  </div>
                  <div className="metric-row">
                    <span className="lbl">Cost per Meal:</span>
                    <strong className="val">₹{previewPlan.route.plannedMetrics.costPerMeal} / meal</strong>
                  </div>
                  <div className="metric-row">
                    <span className="lbl">Est. Duration:</span>
                    <strong className="val">{previewPlan.route.plannedMetrics.durationMin} mins</strong>
                  </div>
                </div>

                {/* Individual Trips Baseline */}
                <div className="metric-box baseline">
                  <div className="metric-box-title">
                    <DollarSign size={16} />
                    <span>Individual Trips Baseline</span>
                  </div>
                  <p className="baseline-text">"{routingConfig.BASELINE_TEXT}"</p>
                  <div className="metric-row">
                    <span className="lbl">Total Distance:</span>
                    <strong className="val">{previewPlan.route.baselineMetrics.distanceKm} km</strong>
                  </div>
                  <div className="metric-row">
                    <span className="lbl">Total Cost:</span>
                    <strong className="val">₹{previewPlan.route.baselineMetrics.cost}</strong>
                  </div>
                  <div className="metric-row">
                    <span className="lbl">Meals Rescued:</span>
                    <strong className="val">{previewPlan.route.baselineMetrics.meals} meals</strong>
                  </div>
                  <div className="metric-row">
                    <span className="lbl">Cost per Meal:</span>
                    <strong className="val">₹{previewPlan.route.baselineMetrics.costPerMeal} / meal</strong>
                  </div>
                  <div className="metric-row">
                    <span className="lbl">Total Duration:</span>
                    <strong className="val">{previewPlan.route.baselineMetrics.durationMin} mins</strong>
                  </div>
                </div>

                {/* Net Savings Callout */}
                <div className="metric-box savings">
                  <div className="metric-box-title">
                    <TrendingDown size={16} />
                    <span>Economic Impact & Savings</span>
                  </div>
                  <div className="savings-huge">
                    ₹{previewPlan.route.baselineMetrics.cost - previewPlan.route.plannedMetrics.cost}
                    <small>INR SAVED</small>
                  </div>
                  <div className="savings-sub">
                    <strong>
                      {Math.round(
                        ((previewPlan.route.baselineMetrics.cost - previewPlan.route.plannedMetrics.cost) /
                          previewPlan.route.baselineMetrics.cost) *
                          100
                      )}%
                    </strong>{' '}
                    logistics cost reduction!
                  </div>
                  <div className="savings-sub">
                    <strong>
                      {(
                        previewPlan.route.baselineMetrics.distanceKm -
                        previewPlan.route.plannedMetrics.distanceKm
                      ).toFixed(1)}{' '}
                      km
                    </strong>{' '}
                    fuel saved across town
                  </div>
                </div>
              </div>

              {/* Stop Sequence Breakdown */}
              <div className="planned-stops-table">
                <h5>Planned Stop Sequence (NGO Depot ➔ {previewPlan.route.stops.length} Stops ➔ NGO Depot)</h5>
                <table>
                  <thead>
                    <tr>
                      <th>Stop #</th>
                      <th>Donor Name</th>
                      <th>Type</th>
                      <th>Address</th>
                      <th>Leg Dist</th>
                      <th>Planned Meals</th>
                      <th>Arrival ETA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewPlan.route.stops.map((s) => (
                      <tr key={s.order}>
                        <td><strong>#{s.order}</strong></td>
                        <td>{s.donor?.name}</td>
                        <td><span className="type-pill">{s.donor?.type}</span></td>
                        <td>{s.donor?.address}</td>
                        <td>+{s.distanceFromPrevKm} km</td>
                        <td><strong>{s.plannedQty} meals</strong></td>
                        <td>{new Date(s.eta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Exclusions List */}
              {previewPlan.excluded && previewPlan.excluded.length > 0 && (
                <div className="exclusions-section">
                  <h5>
                    <AlertCircle size={15} />
                    <span>Excluded from This Trip ({previewPlan.excluded.length} items screened out)</span>
                  </h5>
                  <div className="exclusions-list">
                    {previewPlan.excluded.map((item, idx) => {
                      const don = donations.find((d) => d._id === item.donationId);
                      return (
                        <div key={idx} className="exclusion-card">
                          <span className="exclusion-badge">EXCLUDED</span>
                          <span className="exclusion-donor">
                            {don?.donorId?.name || 'Micro-Donor'} ({don?.mealsOffered || 'N/A'} meals)
                          </span>
                          <span className="exclusion-reason">⚠️ {item.reason}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* COMPLETED TRIPS LOG & IMPACT REPORTS */}
      <div className="completed-trips-card">
        <div className="card-header">
          <CheckCheck className="card-icon" size={18} />
          <h4>Trip History & Verified Impact</h4>
        </div>

        {trips.length === 0 ? (
          <p className="empty-text">No trips executed yet.</p>
        ) : (
          <div className="trips-log-table">
            <table>
              <thead>
                <tr>
                  <th>Trip ID</th>
                  <th>Status</th>
                  <th>Delivered Meals</th>
                  <th>Actual Dist</th>
                  <th>Actual Cost</th>
                  <th>Cost / Meal</th>
                  <th>Started</th>
                  <th>Completed</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {trips.map((t) => (
                  <tr key={t._id}>
                    <td><code>#{t._id.slice(-6)}</code></td>
                    <td><span className={`status-pill ${t.status}`}>{t.status}</span></td>
                    <td><strong>{t.deliveredQty || 0} meals</strong></td>
                    <td>{t.actualMetrics?.distanceKm || t.plannedMetrics?.distanceKm} km</td>
                    <td>₹{t.actualMetrics?.cost || t.plannedMetrics?.cost}</td>
                    <td>₹{t.actualMetrics?.costPerMeal || t.plannedMetrics?.costPerMeal}</td>
                    <td>{t.startedAt ? new Date(t.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td>{t.completedAt ? new Date(t.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="audit-btn"
                        onClick={() => setActiveTrip(t)}
                        title="View trip on map & stops"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Skip Stop Modal */}
      {skipModal && (
        <div className="modal-backdrop" onClick={() => setSkipModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>Skip Stop #{skipModal.stopOrder}: {skipModal.donorName}</h4>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setSkipModal(null)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p>Provide a reason for skipping this pickup stop:</p>
              <textarea
                rows="3"
                value={skipReasonText}
                onChange={(e) => setSkipReasonText(e.target.value)}
                className="input-textarea"
                placeholder="e.g. Donor premises closed, safety seal broken, etc."
              />
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setSkipModal(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  onClick={handleConfirmSkip}
                >
                  Confirm Skip
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
