import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://adminUser:admin123@cluster0.f0cebtz.mongodb.net/extrahand?retryWrites=true&w=majority';
const MONGODB_DB = process.env.MONGODB_DB || 'extrahand';

async function check() {
  try {
    console.log('Connecting to Mongo:', MONGODB_URI);
    await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB });
    console.log('Connected!');

    const taskId = '6a61e0927d6136bb41c1b0bd';
    const taskDoc = await mongoose.connection
      .collection('tasks')
      .findOne(
        { _id: new mongoose.Types.ObjectId(taskId) },
        { projection: { bookingSource: 1, requesterUid: 1, assigneeUid: 1, title: 1 } }
      );

    console.log('Task Doc:', taskDoc);

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
  }
}

check();
