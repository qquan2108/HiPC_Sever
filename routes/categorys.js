const express = require("express");
const router = express.Router();
const Category = require("../models/Category");

// GET all categories
router.get("/", async (req, res) => {
  try {
    const items = await Category.find();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/all", async (req, res) => {
  try {
    const page  = parseInt(req.query.page);
    const limit = parseInt(req.query.limit);

    if (!page || !limit) {
      const items = await Category.find().sort({ createdAt: -1 }).lean();
      return res.json({ categories: items, hasMore: false });
    }

    const safePage  = Math.max(1, page);
    const safeLimit = Math.max(1, limit);
    const skip      = (safePage - 1) * safeLimit;

    const [categories, total] = await Promise.all([
      Category.find()
              .sort({ createdAt: -1 })
              .skip(skip)
              .limit(safeLimit)
              .lean(),
      Category.countDocuments()
    ]);

    return res.json({
      categories,
      hasMore: skip + categories.length < total
    });

  } catch (err) {
    console.error("[getCategories]", err);
    return res.status(500).json({ error: err.message });
  }
});

// GET category by id
router.get("/:id", async (req, res) => {
  try {
    const item = await Category.findById(req.params.id);
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(item);
  } catch (err) {
    res.status(404).json({ error: "Not found" });
  }
});

// POST create category
router.post("/", async (req, res) => {
  try {
    const newItem = new Category(req.body);
    await newItem.save();
    res.status(201).json(newItem);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update category
router.put("/:id", async (req, res) => {
  try {
    const updatedItem = await Category.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json(updatedItem);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE category
router.delete("/:id", async (req, res) => {
  try {
    await Category.findByIdAndDelete(req.params.id);
    res.json({ message: "Category deleted" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});



module.exports = router;
