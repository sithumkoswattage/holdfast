const mongoose = require('mongoose');

const WaypointSchema = new mongoose.Schema({
    timestamp: {
        type: Date,
        required: [true, 'A historical timestamp is required for each waypoint']
    },
    location: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
        },
        coordinates: {
            type: [Number], //[longitude, latitude] GeoJSON
            required: true
        }
    },
    notes: {
        type: String,
        trim: true,
        default: ''
    },
    troopStrength: {
        type: Number,
        min: 0,
        default: 0
    },
    ammoStatus: {
        type: String,
        enum: ['Full', 'Operational', 'Critical', 'Depleted'],
        default: 'Operational'
    }
}, { _id: true });

const UnitSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Unit designation is required (e.g., 101st Airborne)'],
        trim: true
    },
    faction: {
        type: String,
        enum: ['Attacker', 'Defender', 'Neutral'],
        default: 'Neutral'
    },
    unitType: {
        type: String,
        enum: ['Infantry', 'Armor', 'Airborne', 'Artillery', 'Naval', 'Headquarters'],
        default: 'Infantry'
    },
    waypoints: [WaypointSchema]
}, { _id: true });

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
        required: [true, "Campaign must be initialized by an authorized user"]
    },
    units: [UnitSchema]
}, { timestamps: true });

// Indexing for geospatial queries
CampaignMapSchema.index({ "units.waypoints.location": "2dsphere" });

module.exports = mongoose.model('CampaignMap', CampaignMapSchema);