const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static('public')); // serve index.html

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

// Lead schema
const leadSchema = new mongoose.Schema({
  name: String,
  email: String,
  verified: { type: Boolean, default: false },
  token: String,
  createdAt: { type: Date, default: Date.now }
});

const Lead = mongoose.model('Lead', leadSchema);

// Nodemailer setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

// Sign-up endpoint
app.post('/signup', async (req, res) => {
  const { name, email } = req.body;

  // Check if user exists
  let lead = await Lead.findOne({ email });
  if (lead) return res.json({ message: 'Email already signed up!' });

  // Generate verification token
  const token = crypto.randomBytes(20).toString('hex');

  lead = await Lead.create({ name, email, token });

  // Send verification email
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Verify Your Email',
    html: `<p>Hello ${name}, click <a href="http://${req.headers.host}/verify/${token}">here</a> to verify your email.</p>`
  };

  transporter.sendMail(mailOptions, (err) => {
    if (err) return res.json({ message: 'Error sending email.' });
    res.json({ message: 'Verification email sent! Check your inbox.' });
  });
});

// Email verification endpoint
app.get('/verify/:token', async (req, res) => {
  const lead = await Lead.findOne({ token: req.params.token });
  if (!lead) return res.send('Invalid token.');

  lead.verified = true;
  lead.token = '';
  await lead.save();
  res.send('Email verified! Thank you.');
});

// Start server
app.listen(3000, () => console.log('Server running on http://localhost:3000'));
