require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const authRoutes = require('./routes/auth');
const mapRoutes = require('./routes/maps');

app.get('/', (req, res) => {
    res.json({ message: "Welcome to Holdfast Backend Engine. Standing fast!" });
});

app.use('/api/auth', authRoutes);
app.use('/api/maps', mapRoutes);

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('[DATABASE CONNECTED]: Connected to Holdfast cloud database successfully!');
        app.listen(PORT, () => {
            console.log(`[SERVER ACTIVE]: Command node listening securely on port ${PORT}`);
        });
    })
    .catch((err) => {
        console.error('[DATABASE ERROR]: Connection refused:', err.message);
        process.exit(1);
    });