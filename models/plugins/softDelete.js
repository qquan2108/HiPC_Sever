const { Schema } = require('mongoose');

module.exports = function softDelete(schema) {
  schema.add({
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
  });

  // query helpers
  schema.query.notDeleted = function () {
    this.setOptions({ withDeleted: false });
    return this.where({ isDeleted: { $ne: true } });
  };
  schema.query.onlyDeleted = function () {
    this.setOptions({ withDeleted: true });
    return this.where({ isDeleted: true });
  };
  schema.query.withDeleted = function () {
    this.setOptions({ withDeleted: true });
    return this;
  };

  function addFilter(next) {
    if (this.options.withDeleted) return next();
    const filter = this.getFilter();
    if (filter.isDeleted === undefined) {
      this.where({ isDeleted: { $ne: true } });
    }
    next();
  }

  schema.pre('find', addFilter);
  schema.pre('findOne', addFilter);
  schema.pre('count', addFilter);
  schema.pre('countDocuments', addFilter);
  schema.pre('findOneAndUpdate', addFilter);
  schema.pre('updateMany', addFilter);

  schema.pre('aggregate', function (next) {
    if (this.options && this.options.withDeleted) return next();
    const first = this.pipeline()[0];
    if (!first || !first.$match || first.$match.isDeleted === undefined) {
      this.pipeline().unshift({ $match: { isDeleted: { $ne: true } } });
    }
    next();
  });

  // instance methods
  schema.methods.softDelete = function (userId) {
    this.isDeleted = true;
    this.deletedAt = new Date();
    this.deletedBy = userId || null;
    return this.save();
  };

  schema.methods.restore = function () {
    this.isDeleted = false;
    this.deletedAt = null;
    this.deletedBy = null;
    return this.save();
  };
};
