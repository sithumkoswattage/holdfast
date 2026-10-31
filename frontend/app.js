// Map Initialization
const map = L.map('map-canvas', {
    zoomControl: false
}).setView([50.5, 5.5], 7);

L.control.zoom({ position: 'topright' }).addTo(map);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Global State
const API_BASE_URL = 'http://localhost:5000/api/maps';
let currentCampaign = null;
let activeMarkers = {}; // unitId -> Leaflet marker instance
let isEditorMode = false;
let pendingWaypointCoord = null;
let pendingPlacementMarker = null;

let minTimestamp = 0;
let maxTimestamp = 0;
let currentTimestamp = 0;
let playbackInterval = null;

// DOM Targets
const campaignSelect = document.getElementById('campaign-select');
const loadCampaignBtn = document.getElementById('load-campaign-btn');
const activeCampaignTitle = document.getElementById('active-campaign-title');
const activeCampaignDesc = document.getElementById('active-campaign-desc');
const totalUnitsCount = document.getElementById('total-units-count');

const timelineSlider = document.getElementById('timeline-slider');
const deckTimestamp = document.getElementById('deck-timestamp');
const prevBtn = document.getElementById('prev-btn');
const playBtn = document.getElementById('play-btn');
const nextBtn = document.getElementById('next-btn');
const playbackSpeed = document.getElementById('playback-speed');

const editorToggleBtn = document.getElementById('editor-toggle-btn');
const editorPanel = document.getElementById('editor-panel');
const intelPanel = document.getElementById('intel-panel');
const loggerUnitSelect = document.getElementById('logger-unit-select');
const newUnitFields = document.getElementById('new-unit-fields');
const newUnitName = document.getElementById('new-unit-name');
const newUnitFaction = document.getElementById('new-unit-faction');
const newUnitType = document.getElementById('new-unit-type');
const waypointTimestamp = document.getElementById('waypoint-timestamp');
const waypointStrength = document.getElementById('waypoint-strength');
const waypointAmmo = document.getElementById('waypoint-ammo');
const waypointNotes = document.getElementById('waypoint-notes');
const clickStatus = document.getElementById('click-status');
const saveWaypointBtn = document.getElementById('save-waypoint-btn');

const locationInput = document.getElementById('location-input');
const searchBtn = document.getElementById('search-btn');

// --- 1. GEOCODING ---
searchBtn.addEventListener('click', async () => {
    const query = locationInput.value.trim();
    if (!query) return;
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (data.length > 0) {
            const { lat, lon, display_name } = data[0];
            map.flyTo([parseFloat(lat), parseFloat(lon)], 12, { animate: true, duration: 1.5 });
            L.marker([parseFloat(lat), parseFloat(lon)])
                .addTo(map)
                .bindPopup(`<b>Anchor Target</b><br>${display_name}`)
                .openPopup();
        }
    } catch (err) {
        console.error('[GEO ERROR]:', err);
    }
});

// --- 2. CAMPAIGN LOADING ---
async function loadCampaignDropdown() {
    try {
        const res = await fetch(API_BASE_URL);
        const campaigns = await res.json();
        campaignSelect.innerHTML = '<option value="">-- Select Active Campaign --</option>';
        campaigns.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c._id;
            opt.textContent = c.title;
            campaignSelect.appendChild(opt);
        });
    } catch (err) {
        console.error('[FETCH ERROR]:', err);
    }
}

loadCampaignBtn.addEventListener('click', async () => {
    const id = campaignSelect.value;
    if (!id) return;
    stopPlayback();
    await hydrateCampaign(id);
});

async function hydrateCampaign(campaignId) {
    try {
        const res = await fetch(`${API_BASE_URL}/${campaignId}`);
        currentCampaign = await res.json();

        activeCampaignTitle.textContent = currentCampaign.title;
        activeCampaignDesc.textContent = currentCampaign.description;
        totalUnitsCount.textContent = currentCampaign.units ? currentCampaign.units.length : 0;

        map.flyTo(
            [currentCampaign.centerLatitude, currentCampaign.centerLongitude],
            currentCampaign.defaultZoomLevel || 8,
            { animate: true, duration: 1.8 }
        );

        populateUnitSelector();
        computeTemporalBounds();

        // Render at initial timeline start
        renderAtTime(minTimestamp);
    } catch (err) {
        console.error('[HYDRATE ERROR]:', err);
    }
}

function computeTemporalBounds() {
    let allTimes = [];
    if (currentCampaign && currentCampaign.units) {
        currentCampaign.units.forEach(u => {
            if (u.waypoints) {
                u.waypoints.forEach(w => allTimes.push(new Date(w.timestamp).getTime()));
            }
        });
    }

    if (allTimes.length > 0) {
        minTimestamp = Math.min(...allTimes);
        maxTimestamp = Math.max(...allTimes);

        // If all waypoints have the same timestamp, expand window by 1 day
        if (minTimestamp === maxTimestamp) {
            maxTimestamp += 86400000;
        }

        currentTimestamp = minTimestamp;
        timelineSlider.min = minTimestamp;
        timelineSlider.max = maxTimestamp;
        timelineSlider.value = minTimestamp;
        timelineSlider.disabled = false;
    } else {
        timelineSlider.disabled = true;
        deckTimestamp.textContent = 'NO WAYPOINTS RECORDED';
    }
}

// --- 3. DYNAMIC INTERPOLATION & GLIDING ENGINE ---
function renderAtTime(timeMs) {
    if (!currentCampaign || !currentCampaign.units) return;

    currentTimestamp = timeMs;
    timelineSlider.value = timeMs;
    deckTimestamp.textContent = new Date(timeMs).toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

    currentCampaign.units.forEach(unit => {
        if (!unit.waypoints || unit.waypoints.length === 0) return;

        // Sort waypoints chronologically
        const sorted = [...unit.waypoints].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const firstTime = new Date(sorted[0].timestamp).getTime();
        const lastTime = new Date(sorted[sorted.length - 1].timestamp).getTime();

        // Case 1: Unit not yet deployed historically
        if (timeMs < firstTime) {
            if (activeMarkers[unit._id]) {
                map.removeLayer(activeMarkers[unit._id]);
                delete activeMarkers[unit._id];
            }
            return;
        }

        let lat, lng, activeNotes, activeStrength, activeAmmo;

        // Case 2: Past its final logged waypoint (holds final position)
        if (timeMs >= lastTime) {
            const finalWp = sorted[sorted.length - 1];
            [lng, lat] = finalWp.location.coordinates;
            activeNotes = finalWp.notes;
            activeStrength = finalWp.troopStrength;
            activeAmmo = finalWp.ammoStatus;
        } else {
            // Case 3: Gliding between two recorded waypoints
            let prevWp = sorted[0];
            let nextWp = sorted[sorted.length - 1];

            for (let i = 0; i < sorted.length - 1; i++) {
                const tA = new Date(sorted[i].timestamp).getTime();
                const tB = new Date(sorted[i + 1].timestamp).getTime();
                if (timeMs >= tA && timeMs <= tB) {
                    prevWp = sorted[i];
                    nextWp = sorted[i + 1];
                    break;
                }
            }

            const tA = new Date(prevWp.timestamp).getTime();
            const tB = new Date(nextWp.timestamp).getTime();
            const alpha = tB === tA ? 0 : (timeMs - tA) / (tB - tA);

            const [lngA, latA] = prevWp.location.coordinates;
            const [lngB, latB] = nextWp.location.coordinates;

            // Linear interpolation of coordinate path
            lat = latA + alpha * (latB - latA);
            lng = lngA + alpha * (lngB - lngA);

            activeNotes = alpha < 0.5 ? prevWp.notes : nextWp.notes;
            activeStrength = Math.round(prevWp.troopStrength + alpha * (nextWp.troopStrength - prevWp.troopStrength));
            activeAmmo = prevWp.ammoStatus;
        }

        const popupHTML = `
            <div style="font-family: monospace; font-size: 11px;">
                <b style="color: #22c55e;">${unit.name}</b> [${unit.unitType}]<br>
                <b>Faction:</b> ${unit.faction}<br>
                <b>Est. Strength:</b> ${activeStrength.toLocaleString()}<br>
                <b>Ammo:</b> ${activeAmmo}<br>
                <p style="margin-top: 5px; color: #cbd5e1; font-style: italic;">"${activeNotes || 'Holding position.'}"</p>
            </div>
        `;

        if (activeMarkers[unit._id]) {
            // Smoothly glide position
            activeMarkers[unit._id].setLatLng([lat, lng]);
            activeMarkers[unit._id].getPopup().setContent(popupHTML);
        } else {
            // Spawn unique instance
            const factionClass = (unit.faction || 'neutral').toLowerCase();
            const icon = L.divIcon({
                className: `tactical-marker ${factionClass}`,
                html: `<span>${unit.name.substring(0, 4).toUpperCase()}</span>`,
                iconSize: [36, 24],
                iconAnchor: [18, 12]
            });

            const marker = L.marker([lat, lng], { icon: icon }).addTo(map);
            marker.bindPopup(popupHTML);
            activeMarkers[unit._id] = marker;
        }
    });
}

// --- 4. PLAYBACK CONTROLS ---
timelineSlider.addEventListener('input', (e) => {
    stopPlayback();
    renderAtTime(parseInt(e.target.value, 10));
});

playBtn.addEventListener('click', () => {
    if (playbackInterval) {
        stopPlayback();
    } else {
        startPlayback();
    }
});

function startPlayback() {
    if (minTimestamp === maxTimestamp) return;
    playBtn.textContent = '⏸ PAUSE';

    // 25 updates per second for smooth interpolation
    const fps = 25;
    const intervalMs = 1000 / fps;

    playbackInterval = setInterval(() => {
        const ratePerSecond = parseInt(playbackSpeed.value, 10);
        const timeIncrement = ratePerSecond / fps;

        let nextTime = currentTimestamp + timeIncrement;
        if (nextTime > maxTimestamp) {
            nextTime = minTimestamp; // Loop back
        }
        renderAtTime(nextTime);
    }, intervalMs);
}

function stopPlayback() {
    if (playbackInterval) {
        clearInterval(playbackInterval);
        playbackInterval = null;
        playBtn.textContent = '▶ PLAY';
    }
}

prevBtn.addEventListener('click', () => {
    stopPlayback();
    const jump = parseInt(playbackSpeed.value, 10);
    renderAtTime(Math.max(minTimestamp, currentTimestamp - jump));
});

nextBtn.addEventListener('click', () => {
    stopPlayback();
    const jump = parseInt(playbackSpeed.value, 10);
    renderAtTime(Math.min(maxTimestamp, currentTimestamp + jump));
});

// --- 5. WAYPOINT LOGGER & EDITOR ---
editorToggleBtn.addEventListener('click', () => {
    if (!currentCampaign) {
        alert('Please load a campaign before entering Logger Mode.');
        return;
    }

    isEditorMode = !isEditorMode;
    if (isEditorMode) {
        editorToggleBtn.textContent = 'EXIT LOGGER MODE';
        editorToggleBtn.classList.add('active');
        editorPanel.style.display = 'block';
        intelPanel.style.display = 'none';
        document.getElementById('map-canvas').classList.add('crosshair-active');
        stopPlayback();
    } else {
        editorToggleBtn.textContent = 'ENTER LOGGER MODE';
        editorToggleBtn.classList.remove('active');
        editorPanel.style.display = 'none';
        intelPanel.style.display = 'block';
        document.getElementById('map-canvas').classList.remove('crosshair-active');
        clearPendingPlacement();
    }
});

loggerUnitSelect.addEventListener('change', () => {
    if (loggerUnitSelect.value === 'NEW') {
        newUnitFields.style.display = 'block';
    } else {
        newUnitFields.style.display = 'none';
    }
});

function populateUnitSelector() {
    loggerUnitSelect.innerHTML = '<option value="NEW">+ Register New Unit</option>';
    if (currentCampaign && currentCampaign.units) {
        currentCampaign.units.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u._id;
            opt.textContent = `${u.name} (${u.faction})`;
            loggerUnitSelect.appendChild(opt);
        });
    }
    newUnitFields.style.display = 'block';
}

map.on('click', (e) => {
    if (!isEditorMode) return;
    pendingWaypointCoord = [e.latlng.lng, e.latlng.lat];

    if (pendingPlacementMarker) {
        pendingPlacementMarker.setLatLng(e.latlng);
    } else {
        pendingPlacementMarker = L.circleMarker(e.latlng, {
            radius: 8,
            color: '#facc15',
            fillColor: '#ca8a04',
            fillOpacity: 0.8
        }).addTo(map);
    }

    clickStatus.textContent = `TARGET LOCKED: [${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}]`;
    clickStatus.classList.add('active');
});

function clearPendingPlacement() {
    if (pendingPlacementMarker) {
        map.removeLayer(pendingPlacementMarker);
        pendingPlacementMarker = null;
    }
    pendingWaypointCoord = null;
    clickStatus.textContent = 'CLICK MAP TO SET LOCATION';
    clickStatus.classList.remove('active');
}

saveWaypointBtn.addEventListener('click', async () => {
    if (!pendingWaypointCoord) {
        alert('Please click on the map to set the waypoint GPS coordinates.');
        return;
    }

    const timestampVal = waypointTimestamp.value;
    if (!timestampVal) {
        alert('Please select a valid historical Date & Time.');
        return;
    }

    const waypointPayload = {
        timestamp: new Date(timestampVal).toISOString(),
        location: {
            type: 'Point',
            coordinates: pendingWaypointCoord
        },
        troopStrength: parseInt(waypointStrength.value, 10) || 0,
        ammoStatus: waypointAmmo.value,
        notes: waypointNotes.value.trim()
    };

    saveWaypointBtn.disabled = true;
    saveWaypointBtn.textContent = 'TRANSMITTING...';

    try {
        if (loggerUnitSelect.value === 'NEW') {
            const name = newUnitName.value.trim();
            if (!name) {
                alert('Please enter a Unit Designation (e.g. 101st Airborne).');
                saveWaypointBtn.disabled = false;
                saveWaypointBtn.textContent = 'RECORD WAYPOINT';
                return;
            }

            const unitPayload = {
                name: name,
                faction: newUnitFaction.value,
                unitType: newUnitType.value,
                waypoints: [waypointPayload]
            };

            const res = await fetch(`${API_BASE_URL}/${currentCampaign._id}/units`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(unitPayload)
            });

            if (!res.ok) throw new Error('Failed to create new unit');
        } else {
            const unitId = loggerUnitSelect.value;
            const res = await fetch(`${API_BASE_URL}/${currentCampaign._id}/units/${unitId}/waypoints`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(waypointPayload)
            });

            if (!res.ok) throw new Error('Failed to append waypoint');
        }

        alert('Waypoint successfully recorded to historical ledger.');
        clearPendingPlacement();
        waypointNotes.value = '';

        // Rehydrate campaign so the new waypoint is immediately loaded
        await hydrateCampaign(currentCampaign._id);
    } catch (err) {
        console.error('[LOGGER ERROR]:', err);
        alert('Transmission failed. Check server console.');
    } finally {
        saveWaypointBtn.disabled = false;
        saveWaypointBtn.textContent = 'RECORD WAYPOINT';
    }
});

// Boot
loadCampaignDropdown();