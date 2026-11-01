const express = require('express');
const router = express.Router();
const CampaignMap = require('../models/CampaignMap');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
    try {
        const campaigns = await CampaignMap.find(
            { createdBy: req.user.id },
            'title description centerLatitude centerLongitude defaultZoomLevel createdAt'
        );
        res.status(200).json(campaigns);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/:id', auth, async (req, res) => {
    try {
        const campaign = await CampaignMap.findById(req.params.id);
        if (!campaign) {
            return res.status(404).json({ success: false, message: 'Campaign not found' });
        }
        res.status(200).json(campaign);
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

router.post('/', auth, async (req, res) => {
    try {
        req.body.createdBy = req.user.id;
        const newMap = new CampaignMap(req.body);
        const savedMap = await newMap.save();
        res.status(201).json(savedMap);
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

router.post('/:id/units', auth, async (req, res) => {});
router.post('/:id/units/:unitId/waypoints', auth, async (req, res) => {});
router.put('/:id/units/:unitId/waypoints/:waypointId', auth, async (req, res) => {});

module.exports = router;