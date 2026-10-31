const express = require('express');
const router = express.Router();
const CampaignMap = require('../models/CampaignMap');

// GET Summary list for Dropdown
router.get('/', async (req, res) => {
    try {
        const campaigns = await CampaignMap.find({}, 'title description centerLatitude centerLongitude defaultZoomLevel createdAt');
        res.status(200).json(campaigns);
    } catch (error) {
        console.error('[API ERROR]: Failed to fetch campaigns:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET Full operational matrix
router.get('/:id', async (req, res) => {
    try {
        const campaign = await CampaignMap.findById(req.params.id);
        if (!campaign) {
            return res.status(404).json({ success: false, message: 'Campaign not found' });
        }
        res.status(200).json(campaign);
    } catch (error) {
        console.error('[API ERROR]: Failed to retrieve campaign:', error.message);
        res.status(400).json({ success: false, error: error.message });
    }
});

// POST Create new campaign with units and waypoints
router.post('/', async (req, res) => {
    try {
        const newMap = new CampaignMap(req.body);
        const savedMap = await newMap.save();
        res.status(201).json(savedMap);
    } catch (error) {
        console.error('[API ERROR]: Database validation failed:', error.message);
        res.status(400).json({ 
            success: false, 
            message: 'Database validation rejected this campaign layout.',
            error: error.message 
        });
    }
});

// POST Add a single waypoint to existing unit
router.post('/:id/units/:unitId/waypoints', async (req, res) => {
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
        
        // waypoint sorting
        unit.waypoints.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        await campaign.save();
        res.status(201).json(unit);
    } catch (error) {
        console.error('[API ERROR]: Failed to append waypoint:', error.message);
        res.status(400).json({ success: false, error: error.message });
    }
});

module.exports = router;