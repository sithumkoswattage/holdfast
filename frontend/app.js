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

// Initialize
loadCampaignDropdown();