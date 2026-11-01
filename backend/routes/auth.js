const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const signToken = (user) => {
    return jwt.sign(
        { id: user._id, username: user.username },
        process.env.JWT_SECRET || 'holdfast_tactical_command_secret_2026_key',
        { expiresIn: '7d' }
    );
};

router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ success: false, message: 'All fields are required.' });
        }

        const existing = await User.findOne({ $or: [{ email: email.toLowerCase() }, { username }] });
        if (existing) {
            return res.status(400).json({ success: false, message: 'Username or email already registered.' });
        }

        const user = new User({ username, email, password });
        await user.save();

        const token = signToken(user);
        res.status(201).json({
            success: true,
            token,
            user: { id: user._id, username: user.username, email: user.email }
        });
    } catch (err) {
        console.error('[AUTH REGISTER ERROR]:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { identifier, password } = req.body;

        if (!identifier || !password) {
            return res.status(400).json({ success: false, message: 'Provide both username/email and password.' });
        }

        const user = await User.findOne({
            $or: [{ email: identifier.toLowerCase() }, { username: identifier }]
        });

        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid credentials.' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials.' });
        }

        const token = signToken(user);
        res.status(200).json({
            success: true,
            token,
            user: { id: user._id, username: user.username, email: user.email }
        });
    } catch (err) {
        console.error('[AUTH LOGIN ERROR]:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;