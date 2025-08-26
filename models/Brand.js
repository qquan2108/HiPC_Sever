const mongoose = require('mongoose');
const softDelete = require('./plugins/softDelete');

const brandSchema = new mongoose.Schema({
  name: { type: String, required: true },
  logo: String,
  isDeleted: { type: Boolean, default: false }
});

brandSchema.plugin(softDelete);

module.exports = mongoose.model('Brand', brandSchema);