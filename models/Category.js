const mongoose = require('mongoose');
const softDelete = require('./plugins/softDelete');

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String

});

categorySchema.plugin(softDelete);

module.exports = mongoose.model('Category', categorySchema);