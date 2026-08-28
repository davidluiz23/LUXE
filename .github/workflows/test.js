const cloudinary = require('cloudinary').v2;
require("dotenv").config();

// 1. Initialize with your config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// 2. Perform a test API call
async function verifyCloudinary() {
  try {
    const result = await cloudinary.api.ping();
    console.log("✅ Cloudinary credentials are valid!", result);
  } catch (error) {
    console.error("❌ Cloudinary connection failed:", error.message);
  }
}

verifyCloudinary();
