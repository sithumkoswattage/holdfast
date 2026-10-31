// Initialize Leaflet Map
const map = L.map('map-canvas', {
    zoomControl: false // Cleans up the canvas for our custom HUD
}).setView([51.505, -0.09], 5);

// Re-position zoom controls to top-right
L.control.zoom({ position: 'topright' }).addTo(map);

L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri'
}).addTo(map);

// State Management
const API_BASE_URL = 'http://localhost:5000/api/maps';
let currentCampaign = null;
let currentStageIndex = 0;
let markerLayerGroup = L.layerGroup().addTo(map);
let playbackInterval = null;

// DOM Target References
const campaignSelect = document.getElementById('campaign-select');
const loadCampaignBtn = document.getElementById('load-campaign-btn');
const locationInput = document.getElementById('location-input');
const searchBtn = document.getElementById('search-btn');

const timelineSlider = document.getElementById('timeline-slider');
const deckStageName = document.getElementById('deck-stage-name');
const stageTitle = document.getElementById('stage-title');
const stageSummary = document.getElementById('stage-summary');
const countAttacker = document.getElementById('count-attacker');
const countDefender = document.getElementById('count-defender');
const countNeutral = document.getElementById('count-neutral');
const opStateBanner = document.getElementById('op-state-banner');

const prevBtn = document.getElementById('prev-btn');
const playBtn = document.getElementById('play-btn');
const nextBtn = document.getElementById('next-btn');
const speedSelect = document.getElementById('playback-speed');

// 1. Geocoding
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

// 2. Load Campaigns into Dropdown
async function loadCampaignDropdown() {
    try {
        const res = await fetch(API_BASE_URL);
        const campaigns = await res.json();
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

// 3. Load Selected Campaign Map & Stages
loadCampaignBtn.addEventListener('click', async () => {
    const id = campaignSelect.value;
    if (!id) return;

    stopPlayback();

    try {
        const res = await fetch(`${API_BASE_URL}/${id}`);
        currentCampaign = await res.json();

        opStateBanner.textContent = `THEATER: ${currentCampaign.title.toUpperCase()}`;

        // Move camera to center defined in campaign document
        map.flyTo(
            [currentCampaign.centerLatitude, currentCampaign.centerLongitude],
            currentCampaign.defaultZoomLevel || 10,
            { animate: true, duration: 1.8 }
        );

        // Configure Timeline Slider
        const stagesCount = currentCampaign.stages ? currentCampaign.stages.length : 0;
        if (stagesCount > 0) {
            timelineSlider.min = 0;
            timelineSlider.max = stagesCount - 1;
            timelineSlider.value = 0;
            timelineSlider.disabled = false;
            currentStageIndex = 0;
            renderStage(0);
        } else {
            timelineSlider.disabled = true;
            deckStageName.textContent = 'NO STAGES AVAILABLE';
        }
    } catch (err) {
        console.error('[LOAD ERROR]:', err);
    }
});

// 4. Render Stage onto Leaflet Canvas
function renderStage(index) {
    if (!currentCampaign || !currentCampaign.stages || !currentCampaign.stages[index]) return;

    const stage = currentCampaign.stages[index];
    currentStageIndex = index;
    timelineSlider.value = index;

    // Update Sidebar & Deck Text
    stageTitle.textContent = stage.title;
    stageSummary.textContent = stage.historicalSummary;
    deckStageName.textContent = `[${index + 1}/${currentCampaign.stages.length}] ${stage.title}`;

    // Clear previous stage markers
    markerLayerGroup.clearLayers();

    let counts = { Attacker: 0, Defender: 0, Neutral: 0 };

    // Paint Simultaneous Markers
    if (stage.troopMarkers && stage.troopMarkers.length > 0) {
        stage.troopMarkers.forEach(unit => {
            counts[unit.faction] = (counts[unit.faction] || 0) + 1;

            // Note: MongoDB GeoJSON coordinates format is [longitude, latitude]
            const [lng, lat] = unit.location.coordinates;

            const factionClass = unit.faction ? unit.faction.toLowerCase() : 'neutral';

            // Custom Leaflet DivIcon matching tactical HUD style
            const tacticalIcon = L.divIcon({
                className: `tactical-marker ${factionClass}`,
                html: `<span>${unit.label.substring(0, 3).toUpperCase()}</span>`,
                iconSize: [32, 24],
                iconAnchor: [16, 12]
            });

            const marker = L.marker([lat, lng], { icon: tacticalIcon });
            
            marker.bindPopup(`
                <div style="font-family: monospace; font-size: 11px;">
                    <b style="color: #22c55e;">${unit.label}</b><br>
                    <b>Faction:</b> ${unit.faction}<br>
                    <b>Troop Strength:</b> ${unit.troopStrength.toLocaleString()}<br>
                    <b>Ammunition:</b> ${unit.ammoStatus}<br>
                    ${unit.description ? `<p style="margin-top: 4px; color: #555;">${unit.description}</p>` : ''}
                </div>
            `);

            markerLayerGroup.addLayer(marker);
        });
    }

    countAttacker.textContent = counts.Attacker;
    countDefender.textContent = counts.Defender;
    countNeutral.textContent = counts.Neutral;
}

// 5. Timeline Scrubbing & Player Controls
timelineSlider.addEventListener('input', (e) => {
    stopPlayback();
    renderStage(parseInt(e.target.value, 10));
});

prevBtn.addEventListener('click', () => {
    stopPlayback();
    if (currentStageIndex > 0) {
        renderStage(currentStageIndex - 1);
    }
});

nextBtn.addEventListener('click', () => {
    stopPlayback();
    if (currentCampaign && currentStageIndex < currentCampaign.stages.length - 1) {
        renderStage(currentStageIndex + 1);
    }
});

playBtn.addEventListener('click', () => {
    if (playbackInterval) {
        stopPlayback();
    } else {
        startPlayback();
    }
});

function startPlayback() {
    if (!currentCampaign || !currentCampaign.stages || currentCampaign.stages.length <= 1) return;

    playBtn.textContent = '⏸ PAUSE';
    const speed = parseInt(speedSelect.value, 10);

    playbackInterval = setInterval(() => {
        if (currentStageIndex < currentCampaign.stages.length - 1) {
            renderStage(currentStageIndex + 1);
        } else {
            renderStage(0); // Loop back to starting stage
        }
    }, speed);
}

function stopPlayback() {
    if (playbackInterval) {
        clearInterval(playbackInterval);
        playbackInterval = null;
        playBtn.textContent = '▶ PLAY';
    }
}

speedSelect.addEventListener('change', () => {
    if (playbackInterval) {
        stopPlayback();
        startPlayback();
    }
});

// visual editor and transmitter
let isEditorMode = false;
let draftMarkers = [];

const editorToggleBtn = document.getElementById('editor-toggle-btn');
const editorPanel = document.getElementById('editor-panel');
const intelPanel = document.getElementById('intel-panel');

const draftCampTitle = document.getElementById('draft-camp-title');
const draftCampDesc = document.getElementById('draft-camp-desc');
const draftStageTitle = document.getElementById('draft-stage-title');
const draftStageTime = document.getElementById('draft-stage-time');
const draftStageSummary = document.getElementById('draft-stage-summary');
const draftFaction = document.getElementById('draft-faction');
const draftUnitLabel = document.getElementById('draft-unit-label');
const saveDraftBtn = document.getElementById('save-draft-btn');

// Toggle editor mode
editorToggleBtn.addEventListener('click', () => {
    isEditorMode = !isEditorMode;
    
    if (isEditorMode) {
        editorToggleBtn.textContent = 'EXIT EDITOR MODE';
        editorToggleBtn.classList.add('active');
        editorPanel.style.display = 'block';
        intelPanel.style.display = 'none';
        document.getElementById('map-canvas').classList.add('crosshair-active');
        stopPlayback();
    } else {
        editorToggleBtn.textContent = 'ENTER EDITOR MODE';
        editorToggleBtn.classList.remove('active');
        editorPanel.style.display = 'none';
        intelPanel.style.display = 'block';
        document.getElementById('map-canvas').classList.remove('crosshair-active');
        
        draftMarkers.forEach(d => map.removeLayer(d.layer));
        draftMarkers = [];
    }
});

// Drop units
map.on('click', (e) => {
    if (!isEditorMode) return;

    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    const faction = draftFaction.value;
    const label = draftUnitLabel.value.trim() || 'UNIT';
    const factionClass = faction.toLowerCase();

    const tacticalIcon = L.divIcon({
        className: `tactical-marker ${factionClass}`,
        html: `<span>${label.substring(0, 3).toUpperCase()}</span>`,
        iconSize: [32, 24],
        iconAnchor: [16, 12]
    });

    const marker = L.marker([lat, lng], { icon: tacticalIcon }).addTo(map);

    draftMarkers.push({
        layer: marker,
        data: {
            label: label,
            location: { type: 'Point', coordinates: [lng, lat] },
            faction: faction,
            troopStrength: 1000,
            ammoStatus: 'Full'
        }
    });

    console.log(`[FORGE]: Unit ${label} staged at [${lng.toFixed(4)}, ${lat.toFixed(4)}]`);
});

// Transmit campaign
saveDraftBtn.addEventListener('click', async () => {
    const title = draftCampTitle.value.trim();
    const description = draftCampDesc.value.trim() || 'No campaign summary specified.';
    const stageTitleVal = draftStageTitle.value.trim();
    const stageSummaryVal = draftStageSummary.value.trim() || 'Initial troop disposition.';
    const stageTimeVal = draftStageTime.value ? new Date(draftStageTime.value) : new Date();

    if (!title || !stageTitleVal) {
        alert('Please provide both a Campaign Title and a Stage Title.');
        return;
    }

    if (draftMarkers.length === 0) {
        alert('Please click on the map to deploy at least one unit marker before transmitting.');
        return;
    }

    // Auto-detect theater center from map
    const mapCenter = map.getCenter();

    const payload = {
        title: title,
        description: description,
        centerLongitude: parseFloat(mapCenter.lng.toFixed(4)),
        centerLatitude: parseFloat(mapCenter.lat.toFixed(4)),
        defaultZoomLevel: map.getZoom(),
        stages: [
            {
                title: stageTitleVal,
                order: 1,
                timestamp: stageTimeVal,
                historicalSummary: stageSummaryVal,
                troopMarkers: draftMarkers.map(m => m.data)
            }
        ]
    };

    try {
        saveDraftBtn.disabled = true;
        saveDraftBtn.textContent = 'TRANSMITTING...';

        const res = await fetch(API_BASE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (res.ok) {
            alert(`Campaign "${title}" successfully recorded to database!`);

            // Clear draft markers and form
            draftMarkers.forEach(d => map.removeLayer(d.layer));
            draftMarkers = [];
            draftCampTitle.value = '';
            draftCampDesc.value = '';
            draftStageTitle.value = '';
            draftStageSummary.value = '';

            // Exit editor mode
            editorToggleBtn.click();

            // Refresh dropdown
            campaignSelect.innerHTML = '<option value="">-- Select Active Campaign --</option>';
            await loadCampaignDropdown();
        } else {
            alert(`Validation Failed: ${data.error || data.message}`);
        }
    } catch (err) {
        console.error('[TRANSMIT ERROR]:', err);
        alert('Network failure connecting to local server.');
    } finally {
        saveDraftBtn.disabled = false;
        saveDraftBtn.textContent = 'TRANSMIT TO CLOUD';
    }
});

// Initialize
loadCampaignDropdown();