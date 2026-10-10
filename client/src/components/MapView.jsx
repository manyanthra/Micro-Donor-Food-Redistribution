import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default Leaflet icon paths in bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
});

export default function MapView({
  college = { lat: 12.9716, lng: 77.5946, name: 'Central Engineering College' },
  ngo = null,
  donors = [],
  activeTrip = null,
  selectedDonorId = null,
  onSelectDonor = null
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layerGroupRef = useRef(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const initialCenter = [college.lat, college.lng];
    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: 13,
      zoomControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
    layerGroupRef.current = layerGroup;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Layers when data changes
  useEffect(() => {
    if (!mapInstanceRef.current || !layerGroupRef.current) return;
    const map = mapInstanceRef.current;
    const group = layerGroupRef.current;
    group.clearLayers();

    const bounds = [];

    // 1. College Center & 1.5 km Zone Circle
    if (college && college.lat && college.lng) {
      const collegeLatLng = [college.lat, college.lng];
      bounds.push(collegeLatLng);

      // 1.5 km radius circle (College catchment zone)
      L.circle(collegeLatLng, {
        radius: 1500,
        color: '#4f46e5',
        fillColor: '#6366f1',
        fillOpacity: 0.07,
        weight: 1.5,
        dashArray: '4, 4'
      }).addTo(group).bindTooltip('1.5 km Micro-Donor Zone', { permanent: false, direction: 'top' });

      // College Center Marker
      const collegeIcon = L.divIcon({
        className: 'college-marker-icon',
        html: `<div class="marker-bubble college">🎓</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      L.marker(collegeLatLng, { icon: collegeIcon })
        .addTo(group)
        .bindPopup(`
          <div class="popup-box">
            <h4>🎓 ${college.name}</h4>
            <p><strong>Campus Center</strong></p>
            <p>1.5 km perimeter anchors 15 micro-donors</p>
          </div>
        `);
    }

    // 2. NGO Depot Marker
    if (ngo && ngo.location) {
      const ngoLatLng = [ngo.location.lat, ngo.location.lng];
      bounds.push(ngoLatLng);

      const ngoIcon = L.divIcon({
        className: 'ngo-marker-icon',
        html: `<div class="marker-bubble ngo">🏢</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });

      L.marker(ngoLatLng, { icon: ngoIcon })
        .addTo(group)
        .bindPopup(`
          <div class="popup-box">
            <h4>🏢 ${ngo.name}</h4>
            <p><strong>NGO Distribution Depot</strong></p>
            <p>${ngo.address}</p>
            <p>Nightly Intake Capacity: <strong>${ngo.nightlyCapacity} meals</strong></p>
          </div>
        `);
    }

    // 3. Donor Markers
    donors.forEach((donor) => {
      if (!donor.location) return;
      const dLatLng = [donor.location.lat, donor.location.lng];
      bounds.push(dLatLng);

      const activeDonations = donor.donations || [];
      const primaryDonation = activeDonations[0];
      const status = primaryDonation ? primaryDonation.status : 'NO_POST';

      // Pick marker color/symbol based on status
      let statusClass = 'status-default';
      let iconSymbol = '🍞';
      if (donor.type === 'restaurant') iconSymbol = '🍲';
      if (donor.type === 'hostel_mess') iconSymbol = '🏢';

      if (status === 'AVAILABLE') statusClass = 'status-available';
      else if (status === 'ASSIGNED') statusClass = 'status-assigned';
      else if (status === 'COLLECTED') statusClass = 'status-collected';
      else if (status === 'DELIVERED') statusClass = 'status-delivered';
      else if (status === 'REJECTED') statusClass = 'status-rejected';

      const isSelected = selectedDonorId === donor._id;

      const donorIcon = L.divIcon({
        className: 'donor-marker-icon',
        html: `
          <div class="marker-bubble donor ${statusClass} ${isSelected ? 'selected' : ''}">
            <span class="icon">${iconSymbol}</span>
            ${primaryDonation ? `<span class="badge">${primaryDonation.mealsOffered}m</span>` : ''}
          </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      });

      const marker = L.marker(dLatLng, { icon: donorIcon }).addTo(group);

      if (onSelectDonor) {
        marker.on('click', () => onSelectDonor(donor));
      }

      marker.bindPopup(`
        <div class="popup-box">
          <h4>${donor.name}</h4>
          <p class="type-pill">${donor.type.replace('_', ' ').toUpperCase()}</p>
          <p class="address-text">${donor.address}</p>
          ${primaryDonation ? `
            <hr class="popup-divider" />
            <div class="popup-donation">
              <p><strong>Offered:</strong> ${primaryDonation.mealsOffered} meals (${primaryDonation.category})</p>
              <p><strong>Status:</strong> <span class="status-tag ${status}">${primaryDonation.status}</span></p>
              ${primaryDonation.exclusionReason ? `<p class="warning-text">⚠️ ${primaryDonation.exclusionReason}</p>` : ''}
              <p><small>Safe until: ${new Date(primaryDonation.collectBy).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></p>
            </div>
          ` : '<p class="empty-text">No active surplus posted</p>'}
        </div>
      `);
    });

    // 4. Trip Route Polyline & Stop Sequencing
    if (activeTrip && activeTrip.stops && activeTrip.stops.length > 0 && ngo && ngo.location) {
      const ngoLatLng = [ngo.location.lat, ngo.location.lng];
      const routeCoords = [ngoLatLng];

      activeTrip.stops.forEach((stop, idx) => {
        const donorObj = stop.donorId || stop.donor;
        if (donorObj && donorObj.location) {
          const stopLatLng = [donorObj.location.lat, donorObj.location.lng];
          routeCoords.push(stopLatLng);

          // Add sequential stop number marker
          const stopNumberIcon = L.divIcon({
            className: 'stop-number-icon',
            html: `<div class="stop-number-bubble ${stop.status}">${stop.order}</div>`,
            iconSize: [22, 22],
            iconAnchor: [11, 28]
          });

          L.marker(stopLatLng, { icon: stopNumberIcon })
            .addTo(group)
            .bindTooltip(`Stop #${stop.order}: ${donorObj.name} (${stop.plannedQty} meals)`, {
              direction: 'top'
            });
        }
      });

      // Complete the loop back to NGO depot
      routeCoords.push(ngoLatLng);

      // Draw polyline
      L.polyline(routeCoords, {
        color: '#2563eb',
        weight: 3.5,
        opacity: 0.85,
        dashArray: activeTrip.status === 'PLANNED' ? '6, 6' : undefined
      }).addTo(group);
    }

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }, [college, ngo, donors, activeTrip, selectedDonorId]);

  return (
    <div className="map-view-wrapper">
      <div className="map-container" ref={mapContainerRef} />
      <div className="map-legend">
        <div className="legend-item"><span className="legend-dot ngo"></span> NGO Depot (3km)</div>
        <div className="legend-item"><span className="legend-dot available"></span> Available Surplus</div>
        <div className="legend-item"><span className="legend-dot assigned"></span> In Route / Planned</div>
        <div className="legend-item"><span className="legend-dot collected"></span> Collected</div>
        <div className="legend-item"><span className="legend-dot rejected"></span> Excluded / Expired</div>
        <div className="legend-item"><span className="legend-line route"></span> Clustered Route</div>
      </div>
    </div>
  );
}
