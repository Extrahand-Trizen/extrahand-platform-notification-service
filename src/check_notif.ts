import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

import mongoose from 'mongoose';

const MONGODB_URI = 'mongodb+srv://adminUser:admin123@cluster0.f0cebtz.mongodb.net/extrahand?retryWrites=true&w=majority';
const MONGODB_DB = 'extrahand';

async function check() {
  try {
    console.log('Connecting to Mongo...');
    await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB });
    console.log('Connected!');

    const notifId = '6a61e0f6e8d7a825ffda38a9';
    const notif = await mongoose.connection.collection('inappnotifications').findOne({ _id: new mongoose.Types.ObjectId(notifId) });
    console.log('Notification:', notif);

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
  }
}

check();
