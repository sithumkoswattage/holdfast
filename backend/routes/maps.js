const express = require('express');
const router = express.Router();
const CampaignMap = require('../models/CampaignMap');
const auth = require('../middleware/auth');

// GET /api/maps - Return all campaigns belonging to the authenticated user
router.get('/', auth, async (req, res) => {
    try {
        const campaigns = await CampaignMap.find(
            { createdBy: req.user.id },
            'title description centerLatitude centerLongitude defaultZoomLevel createdAt'
        );
        return res.status(200).json(campaigns);
    } catch (error) {
        console.error('[API ERROR]: Failed to fetch campaigns:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/maps/:id - Retrieve full campaign matrix by ID
router.get('/:id', auth, async (req, res) => {
    try {
        const campaign = await CampaignMap.findById(req.params.id);
        if (!campaign) {
            return res.status(404).json({ success: false, message: 'Campaign not found' });
        }
        return res.status(200).json(campaign);
    } catch (error) {
        console.error('[API ERROR]: Failed to retrieve campaign:', error.message);
        return res.status(400).json({ success: false, error: error.message });
    }
});

// POST /api/maps - Create new campaign bound to authenticated user
router.post('/', auth, async (req, res) => {
    try {
        req.body.createdBy = req.user.id;
        const newMap = new CampaignMap(req.body);
        const savedMap = await newMap.save();
        return res.status(201).json(savedMap);
    } catch (error) {
        console.error('[API ERROR]: Database validation failed:', error.message);
        return res.status(400).json({ 
            success: false, 
            message: 'Database validation rejected this campaign layout.',
            error: error.message 
        });
    }
});

// POST /api/maps/:id/units - Register a new unit with initial waypoint
router.post('/:id/units', auth, async (req, res) => {
    try {
        const campaign = await CampaignMap.findById(req.params.id);
        if (!campaign) {
            return res.status(404).json({ success: false, message: 'Campaign not found' });
        }

        campaign.units.push(req.body);
        await campaign.save();

        const createdUnit = campaign.units[campaign.units.length - 1];
        return res.status(201).json(createdUnit);
    } catch (error) {
        console.error('[API ERROR]: Failed to register unit:', error.message);
        return res.status(400).json({ success: false, error: error.message });
    }
});

// POST /api/maps/:id/units/:unitId/waypoints - Append a waypoint to an existing unit
router.post('/:id/units/:unitId/waypoints', auth, async (req, res) => {
    try {
        const campaign = await CampaignMap.findById(req.params.id);
        if (!campaign) {
            return res.status(404).json({ success: false, message: 'Campaign not found' });
        }

        const unit = campaign.units.id(req.params.unitId);
        if (!unit) {
            return res.status(404).json({ success: false, message: 'Unit not found in this campaign' });
        }

        unit.waypoints.push(req.body);
        unit.waypoints.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        await campaign.save();
        return res.status(201).json(unit);
    } catch (error) {
        console.error('[API ERROR]: Failed to append waypoint:', error.message);
        return res.status(400).json({ success: false, error: error.message });
    }
});

// PUT /api/maps/:id/units/:unitId/waypoints/:waypointId - Update existing keyframe
router.put('/:id/units/:unitId/waypoints/:waypointId', auth, async (req, res) => {
    try {
        const campaign = await CampaignMap.findById(req.params.id);
        if (!campaign) {
            return res.status(404).json({ success: false, message: 'Campaign not found' });
        }

        const unit = campaign.units.id(req.params.unitId);
        if (!unit) {
            return res.status(404).json({ success: false, message: 'Unit not found' });
        }

        const waypoint = unit.waypoints.id(req.params.waypointId);
        if (!waypoint) {
            return res.status(404).json({ success: false, message: 'Waypoint not found' });
        }

        if (req.body.timestamp) waypoint.timestamp = new Date(req.body.timestamp);
        if (req.body.location) waypoint.location = req.body.location;
        if (req.body.notes !== undefined) waypoint.notes = req.body.notes;
        if (req.body.troopStrength !== undefined) waypoint.troopStrength = req.body.troopStrength;
        if (req.body.ammoStatus) waypoint.ammoStatus = req.body.ammoStatus;

        unit.waypoints.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        await campaign.save();
        return res.status(200).json({ success: true, unit });
    } catch (error) {
        console.error('[API ERROR]: Failed to update waypoint:', error.message);
        return res.status(400).json({ success: false, error: error.message });
    }
});

module.exports = router;