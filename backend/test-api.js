import jwt from 'jsonwebtoken';
import { config } from './config/environment.js';

const token = jwt.sign({ id: '65f123456789012345678901', role: 'administrator' }, config.jwtSecret, { expiresIn: '1h' });
console.log(token);
