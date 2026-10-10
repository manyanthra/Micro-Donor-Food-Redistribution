const API_BASE = '/api';

export async function fetchHealth() {
  const res = await fetch(`${API_BASE}/health`);
  return res.json();
}

export async function fetchConfig() {
  const res = await fetch(`${API_BASE}/config`);
  return res.json();
}

export async function fetchDonors() {
  const res = await fetch(`${API_BASE}/donors`);
  return res.json();
}

export async function fetchDonations(params = {}) {
  const query = new URLSearchParams(params).toString();
  const url = query ? `${API_BASE}/donations?${query}` : `${API_BASE}/donations`;
  const res = await fetch(url);
  return res.json();
}

export async function createDonation(data) {
  const res = await fetch(`${API_BASE}/donations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function updateDonationStatus(id, updateData) {
  const res = await fetch(`${API_BASE}/donations/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updateData)
  });
  return res.json();
}

export async function fetchNgo() {
  const res = await fetch(`${API_BASE}/ngo`);
  return res.json();
}

export async function fetchTrips() {
  const res = await fetch(`${API_BASE}/trips`);
  return res.json();
}

export async function fetchTrip(id) {
  const res = await fetch(`${API_BASE}/trips/${id}`);
  return res.json();
}

export async function clusterAndPlanTrip(commit = false, departureTime = null) {
  const res = await fetch(`${API_BASE}/trips/cluster-and-plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commit, departureTime })
  });
  return res.json();
}

export async function startTrip(id) {
  const res = await fetch(`${API_BASE}/trips/${id}/start`, {
    method: 'POST'
  });
  return res.json();
}

export async function updateTripStop(id, stopOrder, { action, collectedQty, skipReason }) {
  const res = await fetch(`${API_BASE}/trips/${id}/stop/${stopOrder}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, collectedQty, skipReason })
  });
  return res.json();
}

export async function completeTrip(id, { deliveredQty, ngoConfirmed }) {
  const res = await fetch(`${API_BASE}/trips/${id}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deliveredQty, ngoConfirmed })
  });
  return res.json();
}

export async function cancelTrip(id) {
  const res = await fetch(`${API_BASE}/trips/${id}/cancel`, {
    method: 'POST'
  });
  return res.json();
}

export async function reseedDatabase() {
  const res = await fetch(`${API_BASE}/dev/reseed`, {
    method: 'POST'
  });
  return res.json();
}
