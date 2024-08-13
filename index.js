const express = require('express');
const app = express();
const otpGenerator = require('otp-generator');
const redis = require('redis');
const nodemailer = require('nodemailer');
require('dotenv').config()

app.use(express.json())

const client = redis.createClient({
    host: process.env.REDDISH_HOST, // Replace with the actual Redis server host
    port: process.env.REDDISH_PORT // Replace with the actual Redis server port
});

const sharedSecret = process.env.SECRET;

app.get('/', (req, res) => {
    res.send('Hi, I am the Form Server');
});


async function generateAndStoreOTP(userId) {
    const otp = otpGenerator.generate(6, {
        secret: sharedSecret,
        algorithm: 'SHA-256',
        epoch: Date.now(),
        digits: true,
        lowerCaseAlphabets: false,
        upperCaseAlphabets: false,
        specialChars: false,
    });


    try {

        const expiryInSeconds = process.env.EXPIRY_SECOND;

        await client.connect();
        // await client.set(userId.toString(), otp.toString(), 'EX', expiryInSeconds);
        await client.set(userId.toString(), otp.toString(), { EX: expiryInSeconds });
        await client.disconnect();
        return otp;
    } catch (err) {
        console.error('Error storing OTP:', err);
        throw err;
    }
}


async function getOTP(userId) {
    try {
        await client.connect();
        const otp = await client.get(userId.toString());
        await client.disconnect();
        return otp ? parseInt(otp) : null;
    } catch (err) {
        console.error('Error retrieving OTP:', err);
        throw err;
    }
}

async function sendOTPViaEmail(email, otp) {

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.NODE_EMAIL_USER,
            pass: process.env.NODE_PASSWORD,
        },
        tls: {
            rejectUnauthorized: false
        }
    })

    const mailOptions = {
        from: process.env.NODE_EMAIL_USER,
        to: email,
        subject: 'OTP for Authentication',
        text: `Your OTP is: ${otp}`,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('OTP sent via email');
    } catch (err) {
        console.error('Error sending OTP via email:', err);
        throw err;
    }
}

app.post('/generate-otp', async (req, res) => {
    try {
        const userId = 2; // Replace with the actual user ID from the request
        const otp = await generateAndStoreOTP(userId);
        await sendOTPViaEmail(process.env.NODE_USER_EMAIL, otp); // Replace with the actual user email
        res.status(200).json({ otp });
    } catch (err) {
        console.log("err", err);
        res.status(500).json({ error: 'Error generating and sending OTP' });
    }
});


app.post('/verify-otp', async (req, res) => {
    try {
        const userId = 2;
        const { otp } = req.body;
        const storedOTP = await getOTP(userId);
        if (storedOTP === otp) {
            res.status(200).json({ message: 'OTP verified' });
        } else {
            res.status(401).json({ error: 'Invalid OTP' });
        }
    } catch (err) {
        console.log("err in verify otp", err);
        res.status(500).json({ error: 'Error verifying OTP' });
    }
});


const port = process.env.PORT || 8000

app.listen(port, () => {
    console.log(`Server running on port http://localhost:${port}`);
});