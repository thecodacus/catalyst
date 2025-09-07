import { MongoClient, Db } from 'mongodb';
import mongoose from 'mongoose';

const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://localhost:27017/qwen-code';
const MONGODB_DB = process.env.MONGODB_DB || 'catalyst';

// For native MongoDB client
let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

export async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(MONGODB_DB);

  cachedClient = client;
  cachedDb = db;

  return { client, db };
}

// For Mongoose
let isConnected = false;

export async function connectMongoose() {
  if (isConnected) {
    return;
  }

  try {
    await mongoose.connect(MONGODB_URI);
    isConnected = true;
    console.log('MongoDB connected with Mongoose');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

// Graceful shutdown
if (process.env.NODE_ENV === 'production') {
  process.on('SIGINT', async () => {
    if (cachedClient) {
      await cachedClient.close();
    }
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
    process.exit(0);
  });
}
