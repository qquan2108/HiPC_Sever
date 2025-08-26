require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const VariantProduct = require('../models/Variantproduct');

const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/hipc';

async function run() {
  await mongoose.connect(uri);
  const models = [Product, Category, Brand, VariantProduct];
  for (const model of models) {
    await model.updateMany(
      { isDeleted: { $exists: false } },
      { $set: { isDeleted: false, deletedAt: null, deletedBy: null } }
    );
  }
  console.log('Soft delete migration completed');
  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
