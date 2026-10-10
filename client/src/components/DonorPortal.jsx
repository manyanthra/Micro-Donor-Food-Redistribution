import React, { useState, useEffect } from 'react';
import {
  PlusCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  History,
  X,
  Info,
  Utensils,
  Store,
  FileText,
  Leaf,
  Recycle,
} from 'lucide-react';

import {
  createDonation,
  updateDonationStatus,
} from '../services/api';

export default function DonorPortal({
  donors = [],
  selectedDonorId,
  setSelectedDonorId,
  categories = {},
  donations = [],
  onRefresh,
}) {
  const selectedDonor =
    donors.find((d) => d._id === selectedDonorId) || donors[0];

  const [category, setCategory] = useState('bakery_baked');
  const [mealsOffered, setMealsOffered] = useState(10);

  const [readyAtStr, setReadyAtStr] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });

  const [collectByStr, setCollectByStr] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [activeHistoryModal, setActiveHistoryModal] = useState(null);

  // Demo-only state for NGO delay and BSF recovery.
  // This does not update the backend or book a real processor.
  const [rescueDonation, setRescueDonation] = useState(null);
  const [bsfRescues, setBsfRescues] = useState({});

  // Sync the default category when the selected donor changes.
  useEffect(() => {
    if (selectedDonor) {
      if (selectedDonor.type === 'bakery') {
        setCategory('bakery_baked');
      } else if (
        selectedDonor.type === 'restaurant' ||
        selectedDonor.type === 'hostel_mess'
      ) {
        setCategory('cooked_hot');
      }
    }
  }, [selectedDonor?._id]);

  // Recalculate the default collection deadline when
  // the food category or ready time changes.
  useEffect(() => {
    const catConfig = categories[category];

    if (catConfig && readyAtStr) {
      const readyDate = new Date(readyAtStr);
      const safeMinutes = catConfig.safeWindowMinutes || 120;

      const computedDeadline = new Date(
        readyDate.getTime() + safeMinutes * 60 * 1000
      );

      computedDeadline.setMinutes(
        computedDeadline.getMinutes() -
          computedDeadline.getTimezoneOffset()
      );

      setCollectByStr(
        computedDeadline.toISOString().slice(0, 16)
      );
    }
  }, [category, readyAtStr, categories]);

  const catConfig = categories[category] || {
    label: category,
    safeWindowMinutes: 120,
    donatable: true,
  };

  const isNonDonatable = !catConfig.donatable;

  // Filter donations for the currently selected donor.
  const donorDonations = donations.filter((d) => {
    const donorId = d.donorId?._id || d.donorId;
    return donorId === selectedDonor?._id;
  });

  // Post a new food surplus donation.
  async function handleSubmit(e) {
    e.preventDefault();

    if (!selectedDonor) return;

    setSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const payload = {
        donorId: selectedDonor._id,
        mealsOffered: Number(mealsOffered),
        category,
        readyAt: new Date(readyAtStr).toISOString(),
        collectBy: collectByStr
          ? new Date(collectByStr).toISOString()
          : undefined,
        notes,
      };

      const res = await createDonation(payload);

      if (res.ok) {
        setSuccessMsg(
          `Surplus posted successfully! Status: ${res.donation.status}`
        );

        setNotes('');

        if (onRefresh) {
          onRefresh();
        }
      } else {
        setErrorMsg(res.error || 'Failed to post surplus');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  // Cancel an available donation.
  async function handleCancel(donationId) {
    if (!window.confirm('Cancel this surplus posting?')) {
      return;
    }

    try {
      await updateDonationStatus(donationId, {
        status: 'CANCELLED',
        note: 'Cancelled by donor',
      });

      if (onRefresh) {
        onRefresh();
      }
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  }

  // Open the NGO-delay recovery panel.
  function simulateNgoDelay(donation) {
    setRescueDonation(donation);
  }

  // Record a BSF diversion in local demo state only.
  function confirmBsfDiversion(donation) {
    setBsfRescues((previous) => ({
      ...previous,
      [donation._id]: {
        status: 'BSF_RECOVERY_REQUESTED_DEMO',
        at: new Date().toISOString(),
        quantity: donation.mealsOffered,
      },
    }));

    setRescueDonation(null);
  }

  return (
    <div className="donor-portal">
      {/* Donor Selector Banner */}
      <div className="donor-selector-card">
        <div className="selector-header">
          <Store className="header-icon" size={20} />

          <div>
            <h3>Micro-Donor Selection</h3>
            <p>
              Switch between the 15 simulated micro-donors in the
              college cluster
            </p>
          </div>
        </div>

        <div className="selector-body">
          <select
            className="donor-dropdown"
            value={selectedDonor?._id || ''}
            onChange={(e) => setSelectedDonorId(e.target.value)}
          >
            {donors.map((d) => (
              <option key={d._id} value={d._id}>
                {d.name} ({d.type.replace('_', ' ').toUpperCase()}) —{' '}
                {d.address}
              </option>
            ))}
          </select>

          {selectedDonor && (
            <div className="donor-meta-chips">
              <span className="chip type">
                {selectedDonor.type.replace('_', ' ').toUpperCase()}
              </span>

              <span className="chip address">
                📍 {selectedDonor.address}
              </span>

              <span className="chip phone">
                📞 {selectedDonor.phone || 'N/A'}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="donor-grid">
        {/* Post Surplus Form */}
        <div className="form-card">
          <div className="card-header">
            <PlusCircle className="card-icon" size={18} />
            <h4>Post Food Surplus</h4>
          </div>

          {errorMsg && (
            <div className="alert-box error">
              <AlertTriangle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="alert-box success">
              <CheckCircle2 size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="surplus-form">
            <div className="form-group">
              <label>Food Category & Food Safety Rule</label>

              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="input-select"
              >
                {Object.values(categories).map((cat) => (
                  <option key={cat.key} value={cat.key}>
                    {cat.label} (
                    {cat.donatable
                      ? `${cat.safeWindowMinutes / 60}h safe window`
                      : 'NON-DONATABLE'}
                    )
                  </option>
                ))}
              </select>
            </div>

            {/* Food Safety Guidance */}
            {isNonDonatable ? (
              <div className="safety-callout error">
                <AlertTriangle size={16} />

                <div>
                  <strong>
                    STRICT FOOD SAFETY RULE: NON-DONATABLE
                  </strong>

                  <p>
                    Plate scrapings and partially consumed portions
                    cannot be donated under food safety norms. This
                    entry will be automatically rejected.
                  </p>
                </div>
              </div>
            ) : (
              <div className="safety-callout info">
                <Info size={16} />

                <div>
                  <strong>
                    Safe Holding Window: {catConfig.safeWindowMinutes}{' '}
                    minutes ({catConfig.safeWindowMinutes / 60} hours)
                  </strong>

                  <p>{catConfig.description}</p>
                </div>
              </div>
            )}

            <div className="form-row">
              <div className="form-group half">
                <label>Meals Offered (Qty)</label>

                <input
                  type="number"
                  min="1"
                  max="50"
                  value={mealsOffered}
                  onChange={(e) =>
                    setMealsOffered(e.target.value)
                  }
                  required
                  className="input-field"
                />
              </div>

              <div className="form-group half">
                <label>Ready At</label>

                <input
                  type="datetime-local"
                  value={readyAtStr}
                  onChange={(e) => setReadyAtStr(e.target.value)}
                  required
                  className="input-field"
                />
              </div>
            </div>

            <div className="form-group">
              <label>
                Collection Deadline (Collect-By)
                <span className="label-hint">
                  Capped at safe window ({catConfig.safeWindowMinutes}m)
                </span>
              </label>

              <input
                type="datetime-local"
                value={collectByStr}
                onChange={(e) => setCollectByStr(e.target.value)}
                required
                className="input-field"
              />
            </div>

            <div className="form-group">
              <label>Notes / Packaging Details</label>

              <textarea
                rows="2"
                placeholder="e.g. Packed in clean stainless trays; keep upright"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input-textarea"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className={`submit-btn ${
                isNonDonatable ? 'btn-warning' : 'btn-primary'
              }`}
            >
              {submitting
                ? 'Posting...'
                : isNonDonatable
                  ? 'Post Non-Donatable (Demo Test)'
                  : 'Post Surplus Food'}
            </button>
          </form>
        </div>

        {/* Donor Surplus History */}
        <div className="history-card">
          <div className="card-header">
            <History className="card-icon" size={18} />
            <h4>
              Surplus Postings by {selectedDonor?.name || 'Donor'}
            </h4>
          </div>

          {donorDonations.length === 0 ? (
            <div className="empty-state">
              <Utensils size={32} className="empty-icon" />
              <p>No surplus postings from this donor yet.</p>
            </div>
          ) : (
            <div className="donations-table-wrapper">
              <table className="donations-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Offered</th>
                    <th>Planned</th>
                    <th>Collected</th>
                    <th>Delivered</th>
                    <th>Deadline</th>
                    <th>Status</th>
                    <th>Audit</th>
                  </tr>
                </thead>

                <tbody>
                  {donorDonations.map((don) => (
                    <tr key={don._id}>
                      <td>
                        <strong>
                          {categories[don.category]?.label ||
                            don.category}
                        </strong>
                      </td>

                      <td>{don.mealsOffered}m</td>

                      <td>{don.plannedQty || 0}m</td>

                      <td>
                        <span
                          className={
                            don.collectedQty > 0 ? 'qty-highlight' : ''
                          }
                        >
                          {don.collectedQty || 0}m
                        </span>
                      </td>

                      <td>
                        <span
                          className={
                            don.deliveredQty > 0 ? 'qty-delivered' : ''
                          }
                        >
                          {don.deliveredQty || 0}m
                        </span>
                      </td>

                      <td>
                        <small>
                          {don.collectBy
                            ? new Date(don.collectBy).toLocaleTimeString(
                                [],
                                {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                }
                              )
                            : 'N/A'}
                        </small>
                      </td>

                      <td>
                        <span className={`status-pill ${don.status}`}>
                          {don.status}
                        </span>

                        {don.exclusionReason && (
                          <div
                            className="exclusion-hint"
                            title={don.exclusionReason}
                          >
                            ⚠️ {don.exclusionReason}
                          </div>
                        )}

                        {bsfRescues[don._id] && (
                          <div className="exclusion-hint">
                            <Recycle size={12} />
                            BSF recovery requested (demo)
                          </div>
                        )}
                      </td>

                      <td>
                        <button
                          type="button"
                          className="audit-btn"
                          onClick={() => setActiveHistoryModal(don)}
                          title="View complete state change history"
                        >
                          <FileText size={14} />
                        </button>

                        {don.status === 'AVAILABLE' && (
                          <>
                            <button
                              type="button"
                              className="audit-btn"
                              onClick={() => simulateNgoDelay(don)}
                              title="Simulate NGO pickup delay"
                            >
                              <Clock size={14} />
                            </button>

                            <button
                              type="button"
                              className="cancel-btn"
                              onClick={() => handleCancel(don._id)}
                              title="Cancel donation"
                            >
                              <X size={14} />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* NGO Delay / BSF Recovery Panel */}
      {rescueDonation && (
        <div
          className="safety-callout info"
          style={{
            margin: '16px 0',
            padding: '16px',
            borderRadius: '12px',
          }}
          role="region"
          aria-live="polite"
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
            }}
          >
            <Recycle size={22} />

            <div style={{ flex: 1 }}>
              <strong>NGO delay simulated — backup recovery</strong>

              <p style={{ margin: '8px 0' }}>
                Donation #{String(rescueDonation._id).slice(-6)} contains{' '}
                {rescueDonation.mealsOffered} listed meals.
              </p>

              <p style={{ margin: '8px 0' }}>
                If the NGO cannot collect the food within its verified
                safe window, first check whether another eligible
                recipient can collect it in time.
              </p>

              <p style={{ margin: '8px 0' }}>
                <strong>BSF fallback:</strong> Only material that is no
                longer suitable for human consumption, suitable for
                approved organic processing, and accepted by an
                authorized processing partner may be diverted. Safe
                edible food should be prioritized for people. Do not
                automatically divert contaminated material or plate
                scrapings.
              </p>

              {bsfRescues[rescueDonation._id] ? (
                <div
                  className="alert-box success"
                  style={{ marginTop: '10px' }}
                >
                  <CheckCircle2 size={16} />

                  <span>
                    BSF recovery request recorded in this demo UI. No
                    real pickup or processor booking occurred.
                  </span>
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px',
                    marginTop: '12px',
                  }}
                >
                  <button
                    type="button"
                    className="submit-btn btn-warning"
                    onClick={() =>
                      confirmBsfDiversion(rescueDonation)
                    }
                  >
                    <Leaf
                      size={16}
                      style={{
                        marginRight: '6px',
                        verticalAlign: 'middle',
                      }}
                    />
                    <>
  <span style={{ marginRight: '8px', fontSize: '18px' }}>
    🪰
  </span>
  <Leaf
    size={16}
    style={{
      marginRight: '6px',
      verticalAlign: 'middle',
    }}
  />
  Simulate BSF Diversion
</>
                  </button>

                  <button
                    type="button"
                    className="audit-btn"
                    onClick={() => setRescueDonation(null)}
                  >
                    Close
                  </button>
                </div>
              )}

              <small
                style={{
                  display: 'block',
                  marginTop: '10px',
                }}
              >
                Prototype only: this changes local screen state. Real
                delay detection, backend persistence, processor
                availability checks, and booking are not implemented.
              </small>
            </div>
          </div>
        </div>
      )}

      {/* Audit Log Modal */}
      {activeHistoryModal && (
        <div
          className="modal-backdrop"
          onClick={() => setActiveHistoryModal(null)}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h4>
                Audit History: Donation #
                {String(activeHistoryModal._id).slice(-6)}
              </h4>

              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setActiveHistoryModal(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="modal-meta">
                <p>
                  <strong>Category:</strong>{' '}
                  {categories[activeHistoryModal.category]?.label ||
                    activeHistoryModal.category}
                </p>

                <p>
                  <strong>Offered:</strong>{' '}
                  {activeHistoryModal.mealsOffered} meals |{' '}
                  <strong>Collected:</strong>{' '}
                  {activeHistoryModal.collectedQty || 0} meals |{' '}
                  <strong>Delivered:</strong>{' '}
                  {activeHistoryModal.deliveredQty || 0} meals
                </p>

                <p>
                  <strong>Safe Window Collect-By:</strong>{' '}
                  {activeHistoryModal.collectBy
                    ? new Date(
                        activeHistoryModal.collectBy
                      ).toLocaleString()
                    : 'N/A'}
                </p>
              </div>

              <h5>State Change Timeline (`statusHistory`)</h5>

              <div className="timeline">
                {(activeHistoryModal.statusHistory || []).map(
                  (step, idx) => (
                    <div key={idx} className="timeline-item">
                      <div className="timeline-marker"></div>

                      <div className="timeline-content">
                        <div className="timeline-header">
                          <span
                            className={`status-pill ${step.status}`}
                          >
                            {step.status}
                          </span>

                          <span className="timeline-time">
                            {step.at
                              ? new Date(step.at).toLocaleTimeString(
                                  [],
                                  {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit',
                                  }
                                )
                              : 'N/A'}
                          </span>
                        </div>

                        <p className="timeline-note">
                          {step.note || 'No notes'}
                        </p>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}