const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
    const authHeader = req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            message: 'Access denied. Missing or malformed authorization token.'
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'holdfast_tactical_command_secret_2026_key');
        req.user = decoded; 
        next();
    } catch (err) {
        return res.status(401).json({
            success: false,
            message: 'Session expired or token invalid. Please log in again.'
        });
    }
};