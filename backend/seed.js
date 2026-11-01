require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// 1. In-line Schemas to guarantee clean execution regardless of external model state
const WaypointSchema = new mongoose.Schema({
    timestamp: { type: Date, required: true },
    location: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], required: true }
    },
    notes: { type: String, default: '' },
    troopStrength: { type: Number, default: 0 },
    ammoStatus: { type: String, default: 'Operational' }
}, { _id: true });

const UnitSchema = new mongoose.Schema({
    name: { type: String, required: true },
    faction: { type: String, default: 'Neutral' },
    unitType: { type: String, default: 'Infantry' },
    waypoints: [WaypointSchema]
}, { _id: true });

const CampaignMapSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    centerLongitude: { type: Number, required: true },
    centerLatitude: { type: Number, required: true },
    defaultZoomLevel: { type: Number, default: 8 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    units: [UnitSchema]
}, { timestamps: true });

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true },
    email: { type: String, required: true },
    password: { type: String, required: true }
}, { timestamps: true });

const CampaignMap = mongoose.models.CampaignMap || mongoose.model('CampaignMap', CampaignMapSchema);
const User = mongoose.models.User || mongoose.model('User', UserSchema);

// 2. Comprehensive Historical Battles Data
const rawHistoricalCampaigns = [
    {
        title: "Operation Market Garden (1944)",
        description: "Field Marshal Montgomery's bold airborne-armored offensive to cross the lower Rhine and encircle the Ruhr industrial basin.",
        centerLongitude: 5.65,
        centerLatitude: 51.65,
        defaultZoomLevel: 9,
        units: [
            {
                name: "101st Airborne Div",
                faction: "Attacker",
                unitType: "Airborne",
                waypoints: [
                    {
                        timestamp: "1944-09-17T13:15:00.000Z",
                        location: { type: "Point", coordinates: [5.48, 51.51] },
                        notes: "Drop zones secured north of Eindhoven; Son bridge blown by defenders.",
                        troopStrength: 6700,
                        ammoStatus: "Full"
                    },
                    {
                        timestamp: "1944-09-19T06:45:00.000Z",
                        location: { type: "Point", coordinates: [5.47, 51.44] },
                        notes: "Linked up with British Guards Armoured Division entering Eindhoven.",
                        troopStrength: 6400,
                        ammoStatus: "Operational"
                    },
                    {
                        timestamp: "1944-09-22T14:30:00.000Z",
                        location: { type: "Point", coordinates: [5.54, 51.61] },
                        notes: "Repelled intense German counterattacks on Highway 69 corridor.",
                        troopStrength: 5900,
                        ammoStatus: "Critical"
                    }
                ]
            },
            {
                name: "82nd Airborne Div",
                faction: "Attacker",
                unitType: "Airborne",
                waypoints: [
                    {
                        timestamp: "1944-09-17T13:30:00.000Z",
                        location: { type: "Point", coordinates: [5.74, 51.76] },
                        notes: "Parachute drops secure Grave Bridge intact; Groesbeek Heights seized.",
                        troopStrength: 7200,
                        ammoStatus: "Full"
                    },
                    {
                        timestamp: "1944-09-20T15:00:00.000Z",
                        location: { type: "Point", coordinates: [5.86, 51.84] },
                        notes: "Historic combat crossing of the Waal River in canvas boats under artillery fire.",
                        troopStrength: 6600,
                        ammoStatus: "Critical"
                    },
                    {
                        timestamp: "1944-09-21T17:00:00.000Z",
                        location: { type: "Point", coordinates: [5.87, 51.85] },
                        notes: "Nijmegen road bridge captured intact alongside British tanks.",
                        troopStrength: 6300,
                        ammoStatus: "Operational"
                    }
                ]
            },
            {
                name: "1st Airborne Div (UK)",
                faction: "Attacker",
                unitType: "Airborne",
                waypoints: [
                    {
                        timestamp: "1944-09-17T13:45:00.000Z",
                        location: { type: "Point", coordinates: [5.75, 51.99] },
                        notes: "Landed west of Arnhem; radio transmitters failing across all frequencies.",
                        troopStrength: 8900,
                        ammoStatus: "Full"
                    },
                    {
                        timestamp: "1944-09-18T20:00:00.000Z",
                        location: { type: "Point", coordinates: [5.91, 51.98] },
                        notes: "Col. Frost's 2nd Battalion fortifies buildings at the north end of Arnhem bridge.",
                        troopStrength: 7500,
                        ammoStatus: "Operational"
                    },
                    {
                        timestamp: "1944-09-21T11:00:00.000Z",
                        location: { type: "Point", coordinates: [5.83, 51.97] },
                        notes: "Pocketed remnants consolidate defensive perimeter at Oosterbeek.",
                        troopStrength: 3600,
                        ammoStatus: "Critical"
                    },
                    {
                        timestamp: "1944-09-25T22:00:00.000Z",
                        location: { type: "Point", coordinates: [5.82, 51.96] },
                        notes: "Operation Berlin: Night withdrawal across the Lower Rhine under cover of dark.",
                        troopStrength: 2100,
                        ammoStatus: "Depleted"
                    }
                ]
            },
            {
                name: "9th SS Panzer Div",
                faction: "Defender",
                unitType: "Armor",
                waypoints: [
                    {
                        timestamp: "1944-09-17T14:30:00.000Z",
                        location: { type: "Point", coordinates: [6.05, 52.02] },
                        notes: "Alerted to airborne drops; tasked with screening Arnhem and cutting road access.",
                        troopStrength: 4500,
                        ammoStatus: "Operational"
                    },
                    {
                        timestamp: "1944-09-19T09:00:00.000Z",
                        location: { type: "Point", coordinates: [5.91, 51.99] },
                        notes: "Armored counterattack traps British airborne forces at north ramp.",
                        troopStrength: 4200,
                        ammoStatus: "Full"
                    },
                    {
                        timestamp: "1944-09-23T08:00:00.000Z",
                        location: { type: "Point", coordinates: [5.85, 51.98] },
                        notes: "Tightening ring around Allied airborne perimeter with continuous mortar fire.",
                        troopStrength: 3900,
                        ammoStatus: "Operational"
                    }
                ]
            }
        ]
    },
    {
        title: "Battle of the Bulge: Ardennes (1944)",
        description: "The German winter counteroffensive through the dense Ardennes forest aiming to split Allied armies and reach Antwerp.",
        centerLongitude: 5.75,
        centerLatitude: 50.25,
        defaultZoomLevel: 9,
        units: [
            {
                name: "101st Airborne Div",
                faction: "Defender",
                unitType: "Airborne",
                waypoints: [
                    {
                        timestamp: "1944-12-19T08:00:00.000Z",
                        location: { type: "Point", coordinates: [5.72, 50.00] },
                        notes: "Dispatched from Mourmelon via open-bed trucks to defend key Bastogne road hub.",
                        troopStrength: 11000,
                        ammoStatus: "Operational"
                    },
                    {
                        timestamp: "1944-12-21T18:00:00.000Z",
                        location: { type: "Point", coordinates: [5.71, 50.01] },
                        notes: "German forces complete encirclement. 101st isolated in subzero snow.",
                        troopStrength: 10400,
                        ammoStatus: "Critical"
                    },
                    {
                        timestamp: "1944-12-22T11:30:00.000Z",
                        location: { type: "Point", coordinates: [5.72, 50.00] },
                        notes: "Brig. Gen. Anthony McAuliffe replies to German surrender demand: 'NUTS!'.",
                        troopStrength: 9800,
                        ammoStatus: "Critical"
                    },
                    {
                        timestamp: "1944-12-26T16:50:00.000Z",
                        location: { type: "Point", coordinates: [5.69, 49.98] },
                        notes: "Patton's 4th Armored Division breaks encirclement from the south at Assenois.",
                        troopStrength: 9200,
                        ammoStatus: "Operational"
                    }
                ]
            },
            {
                name: "Kampfgruppe Peiper",
                faction: "Attacker",
                unitType: "Armor",
                waypoints: [
                    {
                        timestamp: "1944-12-16T06:00:00.000Z",
                        location: { type: "Point", coordinates: [6.38, 50.41] },
                        notes: "Spearhead attack through Losheim Gap behind massive preliminary bombardment.",
                        troopStrength: 4800,
                        ammoStatus: "Full"
                    },
                    {
                        timestamp: "1944-12-18T12:00:00.000Z",
                        location: { type: "Point", coordinates: [5.93, 50.39] },
                        notes: "Seized Stavelot bridge over the Amblève River; running critically low on fuel.",
                        troopStrength: 4300,
                        ammoStatus: "Operational"
                    },
                    {
                        timestamp: "1944-12-21T15:00:00.000Z",
                        location: { type: "Point", coordinates: [5.84, 50.41] },
                        notes: "Cut off in La Gleize pocket; unable to receive resupply drops.",
                        troopStrength: 2800,
                        ammoStatus: "Depleted"
                    },
                    {
                        timestamp: "1944-12-24T02:00:00.000Z",
                        location: { type: "Point", coordinates: [5.90, 50.38] },
                        notes: "Abandoned all armored vehicles; 800 surviving soldiers retreat east on foot.",
                        troopStrength: 800,
                        ammoStatus: "Depleted"
                    }
                ]
            },
            {
                name: "4th Armored Div (US)",
                faction: "Defender",
                unitType: "Armor",
                waypoints: [
                    {
                        timestamp: "1944-12-22T06:00:00.000Z",
                        location: { type: "Point", coordinates: [5.81, 49.68] },
                        notes: "Third Army executes 90-degree tactical turn northward to relieve Bastogne.",
                        troopStrength: 10500,
                        ammoStatus: "Full"
                    },
                    {
                        timestamp: "1944-12-24T10:00:00.000Z",
                        location: { type: "Point", coordinates: [5.73, 49.86] },
                        notes: "Armored clash through snowdrifts clearing the highway at Martelange.",
                        troopStrength: 9900,
                        ammoStatus: "Operational"
                    },
                    {
                        timestamp: "1944-12-26T16:50:00.000Z",
                        location: { type: "Point", coordinates: [5.69, 49.98] },
                        notes: "Lead Sherman 'Cobra King' links up with 326th Airborne Engineers in Bastogne.",
                        troopStrength: 9400,
                        ammoStatus: "Operational"
                    }
                ]
            }
        ]
    }
];

// 3. Main Seeder Routine
async function runSeeder() {
    try {
        console.log('[SEEDER]: Initiating connection to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('[SEEDER]: Connected successfully.');

        // Drop unique indexes that cause title collisions across multiple accounts
        try {
            await CampaignMap.collection.dropIndex('title_1');
            console.log('[SEEDER]: Dropped global unique index on campaign title.');
        } catch (e) {
            // Index might not exist yet, safe to proceed
        }

        // Fetch or create operators
        let users = await User.find();
        if (users.length === 0) {
            console.log('[SEEDER]: No users detected in database. Generating default account...');
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash('airborne1944', salt);
            const defaultUser = new User({
                username: 'commander101',
                email: 'commander@holdfast.local',
                password: hashedPassword
            });
            await defaultUser.save();
            users = [defaultUser];
            console.log('[SEEDER]: Default operator "commander101" created.');
        }

        console.log(`[SEEDER]: Identified ${users.length} operator account(s):`);
        users.forEach(u => console.log(`  - Username: "${u.username}" | ID: ${u._id}`));

        // Wipe old campaign records
        const delResult = await CampaignMap.deleteMany({});
        console.log(`[SEEDER]: Purged ${delResult.deletedCount} prior campaign document(s).`);

        // Insert fresh campaigns for every user
        let totalInserted = 0;
        for (const user of users) {
            for (const baseCamp of rawHistoricalCampaigns) {
                const doc = new CampaignMap({
                    title: baseCamp.title,
                    description: baseCamp.description,
                    centerLongitude: baseCamp.centerLongitude,
                    centerLatitude: baseCamp.centerLatitude,
                    defaultZoomLevel: baseCamp.defaultZoomLevel,
                    createdBy: user._id,
                    units: baseCamp.units
                });

                await doc.save();
                totalInserted++;
            }
            console.log(`[SEEDER]: Loaded ${rawHistoricalCampaigns.length} campaigns for operator: "${user.username}".`);
        }

        const finalCount = await CampaignMap.countDocuments();
        console.log(`====================================================`);
        console.log(`[SUCCESS]: ${totalInserted} campaigns seeded. Total in DB: ${finalCount}`);
        console.log(`[OPERATOR KEY]: Log in with any of the usernames listed above.`);
        console.log(`====================================================`);

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('[SEEDER CRASH]:', err);
        process.exit(1);
    }
}

runSeeder();