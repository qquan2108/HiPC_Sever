const mongoose = require('mongoose');
const softDelete = require('./plugins/softDelete');

const brandSchema = new mongoose.Schema({
  name: { type: String, required: true },
  logo: String

});

brandSchema.plugin(softDelete);

module.exports = mongoose.model('Brand', brandSchema);