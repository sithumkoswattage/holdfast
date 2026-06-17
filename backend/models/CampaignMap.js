const mongoose = require('mongoose');

const MarkerSchema = new mongoose.Schema({
    label: {
        type: String,
        required: true,
        trim: true
    },
    // GeoJSON stuff goes here
    
    location: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
        },
        coordinates: {
            type: [Number],
            required: true
        }
    },

    faction: {
        type: String,
        enum: ['Attacker', 'Defender', 'Neutral'],
        default: 'Neutral'
    },
    troopStrength: {
        type: Number,
        min: 0,
        default: 0
    },
    ammoStatus: {
        type: String,
        enum: ['Full', 'Operational', 'Critical', 'Depleted'],
        default: 'Full'
    },
    description: {
        type: String,
        trim: true
    }
});

MarkerSchema.index({ location: '2dsphere' });

const StageSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Stage title is required'],
        trim: true
    },
    order: {
        type: Number,
        required: true
    },
    historicalSummary: {
        type: String,
        required: true,
        trim: true
    },
    troopMarkers: [MarkerSchema]
});

const CampaignMapSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Campaign title is required'],
        trim: true,
        unique: true
    },
    description: {
        type: String,
        required: true
    },
    centerLongitude: {
        type: Number,
        required: true
    },
    centerLatitude: {
        type: Number,
        required: true
    },
    defaultZoomLevel: {
        type: Number,
        default: 10
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    stages: [StageSchema]
}, { timestamps: true });

module.exports = mongoose.model('CampaignMap', CampaignMapSchema);