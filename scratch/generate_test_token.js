import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const COOKIE_SECRET = process.env.COOKIE_SECRET || 'super-secret-key-12345';

function generateToken(payload, expiryMs = 24 * 60 * 60 * 1000) {
  const data = JSON.stringify({ ...payload, exp: Date.now() + expiryMs });
  const hmac = crypto.createHmac('sha256', COOKIE_SECRET).update(data).digest('hex');
  return Buffer.from(data).toString('base64') + '.' + hmac;
}

const token = generateToken({ email: 'hyod9866@gmail.com', role: 'admin' });
console.log("Token:", token);
