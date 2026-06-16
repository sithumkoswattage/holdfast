const mongoose = require('mongoose');

// Define the blueprint configurations for a User document
const UserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: [true, 'Username is explicitly required'],
        unique: true,        
        trim: true,   
        minlength: [3, 'Username must be at least 3 characters long']
    },
    email: {
        type: String,
        required: [true, 'Email address is required'],
        unique: true,
        trim: true,
        lowercase: true,       
        match: [/.+\@.+\..+/, 'Please fill a valid email address'] 
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters for security']
    }
}, {
    timestamps: true 
});


module.exports = mongoose.model('User', UserSchema);