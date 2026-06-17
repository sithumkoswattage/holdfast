// Initialize the Leaflet map element targeting our explicit #map-canvas container
// [Latitude, Longitude], Zoom Level (51.505, -0.09 is just a safe European tactical baseline default)
const map = L.map('map-canvas').setView([51.505, -0.09], 5);

// Load and inject the OpenStreetMap cartographic tile configuration layout
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

console.log('[FRONTEND CANVAS]: Leaflet global map projection initialized successfully.');

// Target DOM nodes for operation hookups
const searchBtn = document.getElementById('search-btn');
const locationInput = document.getElementById('location-input');

// Event listener for our global geocoding command string hookup
searchBtn.addEventListener('click', async () => {
    const query = locationInput.value.trim();
    if (!query) return;

    console.log(`[GEO TARGETING]: Resolving coordinates string for: "${query}"`);
    
    try {
        // Core workflow step 2: Free open-source geocoding using the Nominatim OpenStreetMap API engine
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
        const data = await response.json();

        if (data && data.length > 0) {
            const topResult = data[0];
            // Extract decimal floats out of the string elements returned by Nominatim
            const targetLat = parseFloat(topResult.lat);
            const targetLon = parseFloat(topResult.lon);

            console.log(`[GEO TARGET KEY]: Found match! Coordinates: Lat ${targetLat}, Lon ${targetLon}`);
            
            // Fly the map camera view over to our resolved geographical target frame instantly
            map.flyTo([targetLat, targetLon], 12, {
                animate: true,
                duration: 1.5 // Execution camera slide time tracking window in seconds
            });

            // Drop an immediate marker beacon placeholder to confirm target center anchor point
            L.marker([targetLat, targetLon])
                .addTo(map)
                .bindPopup(`<b>Target Frame Anchor</b><br>${topResult.display_name}`)
                .openPopup();
        } else {
            alert('[GEO TARGET ERROR]: No global coordinates matched that string query format.');
        }
    } catch (err) {
        console.error('[GEO NETWORK ERROR]: Failed to reach public Geocoding pipeline cluster:', err);
    }
});

// Configuration: Point this to your local backend engine instance
const API_BASE_URL = 'http://localhost:5000/api/maps';

// Target the new DOM elements
const campaignSelect = document.getElementById('campaign-select');
const loadCampaignBtn = document.getElementById('load-campaign-btn');

/**
 * PHASE 1: Fetch all campaign summaries to populate the dropdown menu on page boot
 */
async function loadCampaignDropdown() {
    try {
        console.log('[API FETCH]: Querying available campaigns list...');
        const response = await fetch(API_BASE_URL);
        const campaigns = await response.json();

        // Populate the select element options using our lightweight database payload
        campaigns.forEach(campaign => {
            const option = document.createElement('option');
            option.value = campaign._id; // Use the MongoDB ObjectId string as the value reference
            option.textContent = campaign.title;
            campaignSelect.appendChild(option);
        });
        
        console.log(`[API SUCCESS]: Loaded ${campaigns.length} campaigns into selection inventory.`);
    } catch (err) {
        console.error('[FETCH ERROR]: Failed to pull campaign dashboard records:', err);
    }
}

/**
 * PHASE 2: Fetch full deep-nested data for a selected campaign layout and focus map view
 */
loadCampaignBtn.addEventListener('click', async () => {
    const selectedId = campaignSelect.value;
    if (!selectedId) {
        alert('Please select an active operation theater from the menu.');
        return;
    }

    console.log(`[API FETCH]: Pulling full strategic layouts for Campaign ID: ${selectedId}`);

    try {
        // Execute a precise individual ID lookup on our backend router
        const response = await fetch(`${API_BASE_URL}/${selectedId}`);
        const campaign = await response.json();

        if (campaign) {
            console.log('[FETCH SUCCESS]: Ingested full tactical matrix:', campaign);

            // Fly the map canvas view over to the operational theater anchor point specified in DB
            map.flyTo([campaign.centerLatitude, campaign.centerLongitude], campaign.defaultZoomLevel || 10, {
                animate: true,
                duration: 2.0
            });

            // Update Timeline Section text container to indicate loading was successful
            const timelineControls = document.getElementById('timeline-controls');
            timelineControls.innerHTML = `
                <h3>TIMELINE CHRONOLOGY</h3>
                <h4 style="color: #4a5d4e; margin-top: 5px;">${campaign.title}</h4>
                <p style="font-size: 12px; margin-top: 5px; color: #aaa;">${campaign.description}</p>
                <p style="font-size: 11px; margin-top: 10px; color: #888;">Stages detected: ${campaign.stages ? campaign.stages.length : 0}</p>
            `;
        }
    } catch (err) {
        console.error('[FETCH ERROR]: Operational tactical loading sequence failed:', err);
    }
});

// Fire off the dropdown population instantly when the script initializes
loadCampaignDropdown();