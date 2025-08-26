const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const Category = require("../models/Category");
const Image = require("../models/Image");

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, "../uploads/categories");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniq = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniq + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Upload category image
router.post("/upload", upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  const url = `/uploads/categories/${req.file.filename}`;
  res.json({ url });
});

// GET all categories
router.get("/", async (req, res) => {
  try {
    const categories = await Category.find().lean();
    const ids = categories.map(c => c._id);
    const images = await Image.find({ category_id: { $in: ids } }).lean();
    const imageMap = {};
    images.forEach(img => {
      if (!imageMap[img.category_id]) imageMap[img.category_id] = img.url;
    });
    const result = categories.map(c => ({
      ...c,
      image: imageMap[c._id] || null
    }));
    res.json(result);
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
      const ids = items.map(c => c._id);
      const images = await Image.find({ category_id: { $in: ids } }).lean();
      const imageMap = {};
      images.forEach(img => {
        if (!imageMap[img.category_id]) imageMap[img.category_id] = img.url;
      });
      const categoriesWithImage = items.map(c => ({
        ...c,
        image: imageMap[c._id] || null
      }));
      return res.json({ categories: categoriesWithImage, hasMore: false });
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

    const ids = categories.map(c => c._id);
    const images = await Image.find({ category_id: { $in: ids } }).lean();
    const imageMap = {};
    images.forEach(img => {
      if (!imageMap[img.category_id]) imageMap[img.category_id] = img.url;
    });
    const categoriesWithImage = categories.map(c => ({
      ...c,
      image: imageMap[c._id] || null
    }));

    return res.json({
      categories: categoriesWithImage,
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
    const item = await Category.findById(req.params.id).lean();
    if (!item) return res.status(404).json({ error: "Not found" });
    const img = await Image.findOne({ category_id: item._id }).lean();
    res.json({
      ...item,
      image: img ? img.url : null
    });
  } catch (err) {
    res.status(404).json({ error: "Not found" });
  }
});

// POST create category
router.post("/", async (req, res) => {
  try {
    const { image, ...data } = req.body;
    const newItem = new Category(data);
    await newItem.save();
    if (image) {
      await Image.findOneAndUpdate(
        { category_id: newItem._id },
        { url: image, category_id: newItem._id },
        { upsert: true, new: true }
      );
    }
    res.status(201).json({ ...newItem.toObject(), image: image || null });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update category
router.put("/:id", async (req, res) => {
  try {
    const { image, ...data } = req.body;
    const updatedItem = await Category.findByIdAndUpdate(
      req.params.id,
      data,
      { new: true }
    );
    if (image) {
      await Image.findOneAndUpdate(
        { category_id: req.params.id },
        { url: image, category_id: req.params.id },
        { upsert: true, new: true }
      );
    }
    res.json({ ...updatedItem.toObject(), image: image || null });
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
