// src/config.mjs
import dotenv from 'dotenv';

dotenv.config();

export const config = {
  apiUrl: process.env.API_URL || 'http://localhost:3010',
  socketUrl: process.env.SOCKET_URL || 'http://localhost:3010',
  apiKey: process.env.API_KEY || '',
};