const mongoose = require('mongoose');
const dns = require('dns');

// On some Windows machines, Node's own DNS resolver (c-ares) ignores the
// system's working DNS settings and picks up a broken/unreachable server
// from another network adapter (VPN, Docker Desktop, Hyper-V, etc.), which
// makes the mongodb+srv:// lookup fail with "querySrv ECONNREFUSED" even
// though `nslookup` works fine at the OS level. Pointing Node explicitly at
// public DNS resolvers works around it.
dns.setServers(['8.8.8.8', '1.1.1.1']);

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set. Copy .env.example to .env and configure it.');
    process.exit(1);
  }
  try {
    await mongoose.connect(uri);
    console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
