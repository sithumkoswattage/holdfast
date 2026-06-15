const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config();

const app = express();

app.use(cors());       
app.use(express.json()); 

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log('[DATABASE CONNECTED]: Connected to Holdfast cloud database successfully!'))
.catch((err) => {
    console.error('[DATABASE ERROR]: Connection sequence failed!');
    console.error(err);
});

app.get('/', (req, res) => {
    res.json({ message: "Welcome to Holdfast Backend Engine. Standing fast!" });
});


const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`[SERVER RUNNING]: Holdfast engine listening securely on port ${PORT}`);
});