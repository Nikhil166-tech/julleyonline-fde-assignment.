import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

export function signToken(payload, expiresIn = '7d') {
  return jwt.sign(payload, config.jwtSecret, { expiresIn });
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}
