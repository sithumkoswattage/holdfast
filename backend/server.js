const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

app.use(cors());       
app.use(express.json()); 

app.get('/', (req, res) => {
    res.json({ message: "Welcome to Holdfast Backend Engine. Standing fast!" });
});


const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`[SERVER RUNNING]: Holdfast engine listening securely on port ${PORT}`);
});