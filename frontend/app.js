// --- MAP INITIALIZATION ---
const map = L.map('map-canvas', { zoomControl: false }).setView([50.5, 5.5], 7);
L.control.zoom({ position: 'topright' }).addTo(map);

// Esri Street Basemap (Full labels & zoom)
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri &mdash; Sources: Esri, USGS, TomTom'
}).addTo(map);

// --- GLOBAL STATE ---
const API_BASE_URL = 'http://localhost:5000/api/maps';
let currentCampaign = null;
let activeMarkers = {}; // unitId -> Leaflet marker instance
let isEditorMode = false;

let minTimestamp = 0;
let maxTimestamp = 0;
let currentTimestamp = 0;
let playbackInterval = null;

// Keyframe & Selection State
let selectedUnitId = null;
let editingWaypointId = null; // null = creating new; string = editing existing
let pendingWaypointCoord = null;
let pendingPlacementMarker = null;

// --- DOM TARGETS ---
const campaignSelect = document.getElementById('campaign-select');
const loadCampaignBtn = document.getElementById('load-campaign-btn');
const activeCampaignTitle = document.getElementById('active-campaign-title');
const activeCampaignDesc = document.getElementById('active-campaign-desc');
const totalUnitsCount = document.getElementById('total-units-count');

const timelineSlider = document.getElementById('timeline-slider');
const deckTimestamp = document.getElementById('deck-timestamp');
const deckUnitTag = document.getElementById('deck-unit-tag');
const keyframePipsTrack = document.getElementById('keyframe-pips-track');
const prevBtn = document.getElementById('prev-btn');
const playBtn = document.getElementById('play-btn');
const nextBtn = document.getElementById('next-btn');
const playbackSpeed = document.getElementById('playback-speed');

const editorToggleBtn = document.getElementById('editor-toggle-btn');
const editorPanel = document.getElementById('editor-panel');
const intelPanel = document.getElementById('intel-panel');
const loggerUnitSelect = document.getElementById('logger-unit-select');
const newUnitFields = document.getElementById('new-unit-fields');
const unitLedgerSection = document.getElementById('unit-ledger-section');
const waypointList = document.getElementById('waypoint-list');
const newWaypointModeBtn = document.getElementById('new-waypoint-mode-btn');
const formModeBanner = document.getElementById('form-mode-banner');

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

// --- HELPER: FORMAT DATE FOR DATETIME-LOCAL INPUT ---
function toDatetimeLocalString(dateObj) {
    const d = new Date(dateObj);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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
            L.marker([parseFloat(lat), parseFloat(lon)]).addTo(map).bindPopup(`<b>Anchor:</b><br>${display_name}`).openPopup();
        }
    } catch (err) {
        console.error('[GEO ERROR]:', err);
    }
});

// --- 2. CAMPAIGN DATA LOADING ---
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
            { animate: true, duration: 1.5 }
        );

        populateUnitSelector();
        computeTemporalBounds();
        renderAtTime(minTimestamp);

        // Refresh keyframe visual layer if a unit is active
        if (selectedUnitId && selectedUnitId !== 'NEW') {
            syncUnitKeyframesView(selectedUnitId);
        } else {
            clearKeyframePips();
        }
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
        if (minTimestamp === maxTimestamp) maxTimestamp += 86400000;

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

// --- 3. DYNAMIC INTERPOLATION ENGINE ---
function renderAtTime(timeMs) {
    if (!currentCampaign || !currentCampaign.units) return;

    currentTimestamp = timeMs;
    timelineSlider.value = timeMs;
    deckTimestamp.textContent = new Date(timeMs).toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

    currentCampaign.units.forEach(unit => {
        if (!unit.waypoints || unit.waypoints.length === 0) return;

        const sorted = [...unit.waypoints].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const firstTime = new Date(sorted[0].timestamp).getTime();
        const lastTime = new Date(sorted[sorted.length - 1].timestamp).getTime();

        if (timeMs < firstTime) {
            if (activeMarkers[unit._id]) {
                map.removeLayer(activeMarkers[unit._id]);
                delete activeMarkers[unit._id];
            }
            return;
        }

        let lat, lng, activeNotes, activeStrength, activeAmmo;

        if (timeMs >= lastTime) {
            const finalWp = sorted[sorted.length - 1];
            [lng, lat] = finalWp.location.coordinates;
            activeNotes = finalWp.notes;
            activeStrength = finalWp.troopStrength;
            activeAmmo = finalWp.ammoStatus;
        } else {
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
                <b>Strength:</b> ${activeStrength.toLocaleString()}<br>
                <b>Ammo:</b> ${activeAmmo}<br>
                <p style="margin-top: 5px; color: #cbd5e1; font-style: italic;">"${activeNotes || 'In transit.'}"</p>
            </div>
        `;

        if (activeMarkers[unit._id]) {
            activeMarkers[unit._id].setLatLng([lat, lng]);
            activeMarkers[unit._id].getPopup().setContent(popupHTML);
        } else {
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

// playback
timelineSlider.addEventListener('input', (e) => {
    stopPlayback();
    renderAtTime(parseInt(e.target.value, 10));
});

playBtn.addEventListener('click', () => {
    if (playbackInterval) stopPlayback();
    else startPlayback();
});

function startPlayback() {
    if (minTimestamp === maxTimestamp) return;
    playBtn.textContent = '⏸ PAUSE';
    const fps = 25;
    const intervalMs = 1000 / fps;

    playbackInterval = setInterval(() => {
        const ratePerSecond = parseInt(playbackSpeed.value, 10);
        const timeIncrement = ratePerSecond / fps;
        let nextTime = currentTimestamp + timeIncrement;
        if (nextTime > maxTimestamp) nextTime = minTimestamp;
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

function clearKeyframePips() {
    keyframePipsTrack.innerHTML = '';
    deckUnitTag.textContent = 'TEMPORAL SCRUBBER (ALL UNITS)';
}

function syncUnitKeyframesView(unitId) {
    clearKeyframePips();
    waypointList.innerHTML = '';

    if (!currentCampaign || !unitId || unitId === 'NEW') return;

    const unit = currentCampaign.units.find(u => u._id === unitId);
    if (!unit) return;

    deckUnitTag.textContent = `KEYFRAMES: ${unit.name.toUpperCase()}`;
    const sortedWaypoints = [...(unit.waypoints || [])].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const totalRange = maxTimestamp - minTimestamp;

    sortedWaypoints.forEach((wp, index) => {
        const wpTime = new Date(wp.timestamp).getTime();

        // 1. Interactive Timeline Pip
        if (totalRange > 0) {
            const pct = Math.min(100, Math.max(0, ((wpTime - minTimestamp) / totalRange) * 100));
            const pip = document.createElement('div');
            pip.className = 'keyframe-pip';
            pip.style.left = `${pct}%`;
            pip.title = `[Keyframe ${index + 1}] ${new Date(wp.timestamp).toISOString().substring(0, 16).replace('T', ' ')}`;
            pip.dataset.waypointId = wp._id;

            pip.addEventListener('click', (e) => {
                e.stopPropagation();
                selectAndInspectWaypoint(unit, wp);
            });

            keyframePipsTrack.appendChild(pip);
        }

        // Sidebar Waypoint Item
        const item = document.createElement('div');
        item.className = 'waypoint-item';
        item.dataset.waypointId = wp._id;
        item.innerHTML = `
            <div>
                <span class="waypoint-item-time">${new Date(wp.timestamp).toISOString().substring(5, 16).replace('T', ' ')}</span>
                <div class="waypoint-item-notes">${wp.notes || 'No description'}</div>
            </div>
            <span style="color: #64748b; font-size: 9px;">#${index + 1}</span>
        `;

        item.addEventListener('click', () => {
            selectAndInspectWaypoint(unit, wp);
        });

        waypointList.appendChild(item);
    });
}

function selectAndInspectWaypoint(unit, waypoint) {
    editingWaypointId = waypoint._id;

    document.querySelectorAll('.keyframe-pip').forEach(p => {
        p.classList.toggle('active', p.dataset.waypointId === waypoint._id);
    });
    document.querySelectorAll('.waypoint-item').forEach(i => {
        i.classList.toggle('active', i.dataset.waypointId === waypoint._id);
    });

    waypointTimestamp.value = toDatetimeLocalString(waypoint.timestamp);
    waypointStrength.value = waypoint.troopStrength;
    waypointAmmo.value = waypoint.ammoStatus;
    waypointNotes.value = waypoint.notes;

    const [lng, lat] = waypoint.location.coordinates;
    pendingWaypointCoord = [lng, lat];
    updatePlacementMarker(lat, lng);

    formModeBanner.textContent = `MODE: EDITING KEYFRAME`;
    formModeBanner.classList.add('editing');
    saveWaypointBtn.textContent = 'UPDATE KEYFRAME';

    const timeMs = new Date(waypoint.timestamp).getTime();
    renderAtTime(timeMs);
}

function resetToNewWaypointMode() {
    editingWaypointId = null;
    formModeBanner.textContent = 'MODE: NEW WAYPOINT';
    formModeBanner.classList.remove('editing');
    saveWaypointBtn.textContent = 'RECORD WAYPOINT';

    // Auto-set the date-time
    waypointTimestamp.value = toDatetimeLocalString(currentTimestamp || Date.now());
    waypointNotes.value = '';
    clearPendingPlacement();

    document.querySelectorAll('.keyframe-pip').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.waypoint-item').forEach(i => i.classList.remove('active'));
}

newWaypointModeBtn.addEventListener('click', () => {
    resetToNewWaypointMode();
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

    if (selectedUnitId && selectedUnitId !== 'NEW') {
        loggerUnitSelect.value = selectedUnitId;
        newUnitFields.style.display = 'none';
        unitLedgerSection.style.display = 'block';
    } else {
        loggerUnitSelect.value = 'NEW';
        newUnitFields.style.display = 'block';
        unitLedgerSection.style.display = 'none';
    }
}

loggerUnitSelect.addEventListener('change', () => {
    selectedUnitId = loggerUnitSelect.value;
    if (selectedUnitId === 'NEW') {
        newUnitFields.style.display = 'block';
        unitLedgerSection.style.display = 'none';
        clearKeyframePips();
        resetToNewWaypointMode();
    } else {
        newUnitFields.style.display = 'none';
        unitLedgerSection.style.display = 'block';
        syncUnitKeyframesView(selectedUnitId);
        resetToNewWaypointMode();
    }
});

editorToggleBtn.addEventListener('click', () => {
    if (!currentCampaign) {
        alert('Please select and engage an operational campaign first.');
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
        resetToNewWaypointMode();
        if (selectedUnitId && selectedUnitId !== 'NEW') syncUnitKeyframesView(selectedUnitId);
    } else {
        editorToggleBtn.textContent = 'ENTER LOGGER MODE';
        editorToggleBtn.classList.remove('active');
        editorPanel.style.display = 'none';
        intelPanel.style.display = 'block';
        document.getElementById('map-canvas').classList.remove('crosshair-active');
        clearPendingPlacement();
        clearKeyframePips();
    }
});

// Map click coordinate capture
map.on('click', (e) => {
    if (!isEditorMode) return;
    pendingWaypointCoord = [e.latlng.lng, e.latlng.lat];
    updatePlacementMarker(e.latlng.lat, e.latlng.lng);
});

function updatePlacementMarker(lat, lng) {
    if (pendingPlacementMarker) {
        pendingPlacementMarker.setLatLng([lat, lng]);
    } else {
        pendingPlacementMarker = L.circleMarker([lat, lng], {
            radius: 8,
            color: '#facc15',
            fillColor: '#ca8a04',
            fillOpacity: 0.85
        }).addTo(map);
    }
    clickStatus.textContent = `TARGET LOCKED: [${lat.toFixed(4)}, ${lng.toFixed(4)}]`;
    clickStatus.classList.add('active');
}

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
        alert('Click the tactical map canvas to lock waypoint coordinates.');
        return;
    }

    const timestampVal = waypointTimestamp.value;
    if (!timestampVal) {
        alert('Specify a valid Date & Time.');
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

    try {
        if (editingWaypointId) {
            // Update existing keyframe
            saveWaypointBtn.textContent = 'UPDATING...';
            const unitId = loggerUnitSelect.value;
            const res = await fetch(`${API_BASE_URL}/${currentCampaign._id}/units/${unitId}/waypoints/${editingWaypointId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(waypointPayload)
            });

            if (!res.ok) throw new Error('Failed to update keyframe');
            alert('Keyframe updated and chronologically sorted.');
        } else if (loggerUnitSelect.value === 'NEW') {
            // Create unit + 1st waypoint
            saveWaypointBtn.textContent = 'TRANSMITTING...';
            const name = newUnitName.value.trim();
            if (!name) {
                alert('Enter a Unit Designation.');
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
            const createdUnit = await res.json();
            selectedUnitId = createdUnit._id;
        } else {
            // Append waypoint from existing unit
            saveWaypointBtn.textContent = 'TRANSMITTING...';
            const unitId = loggerUnitSelect.value;
            const res = await fetch(`${API_BASE_URL}/${currentCampaign._id}/units/${unitId}/waypoints`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(waypointPayload)
            });

            if (!res.ok) throw new Error('Failed to append waypoint');
        }

        // Rehydrate campaign
        await hydrateCampaign(currentCampaign._id);
        resetToNewWaypointMode();
    } catch (err) {
        console.error('[TRANSMIT ERROR]:', err);
        alert('Operation failed. Check server log.');
    } finally {
        saveWaypointBtn.disabled = false;
        if (!editingWaypointId) saveWaypointBtn.textContent = 'RECORD WAYPOINT';
    }
});

// Initial boot
loadCampaignDropdown();