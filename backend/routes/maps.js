const express = require('express');
const router = express.Router();
const CampaignMap = require('../models/CampaignMap');

/**
 * @route   POST /api/maps
 * @desc    Create and save a new historical global campaign map
 */
router.post('/', async (req, res) => {
    try {
        const newMap = new CampaignMap(req.body);
        const savedMap = await newMap.save();
        res.status(201).json(savedMap);
    } catch (error) {
        console.error('[API ERROR]: Failed to save campaign map layout:', error.message);
        res.status(400).json({ 
            success: false, 
            message: 'Database validation rejected this map layout.',
            error: error.message 
        });
    }
});

/**
 * @route   GET /api/maps
 * @desc    Fetch all campaign summaries (lightweight projection for dashboards)
 */
router.get('/', async (req, res) => {
    try {
        // Exclude the heavy nested stages array so the main menu loads instantly
        const maps = await CampaignMap.find().select('-stages');
        res.status(200).json(maps);
    } catch (error) {
        console.error('[API ERROR]: Failed to fetch campaign maps:', error.message);
        res.status(500).json({ 
            success: false, 
            message: 'Server error while attempting to retrieve map records.' 
        });
    }
});

/**
 * @route   GET /api/maps/:id
 * @desc    Retrieve a single detailed campaign map including its full nested timelines
 */
router.get('/:id', async (req, res) => {
    try {
        const map = await CampaignMap.findById(req.params.id);
        if (!map) {
            return res.status(404).json({ success: false, message: 'Historical map layout not found.' });
        }
        res.status(200).json(map);
    } catch (error) {
        console.error(`[API ERROR]: Failed to fetch map ID ${req.params.id}:`, error.message);
        if (error.kind === 'ObjectId') {
            return res.status(400).json({ success: false, message: 'Malformed Campaign ID format.' });
        }
        res.status(500).json({ success: false, message: 'Server error retrieving map data.' });
    }
});

module.exports = router;