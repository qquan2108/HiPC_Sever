const Product = require('../models/Product');
const Category = require('../models/Category');
const mongoose = require('mongoose');
const { searchSchema, idSchema, regexEscape } = require('../utils/sanitize');

// Tell Gemini what tools exist and what args they take
const functionDeclarations = [
  {
    name: 'searchProducts',
    description: 'Search products by filters and return a short list.',
    parameters: {
      type: 'OBJECT',
      properties: {
        q: { type: 'STRING' },
        category: { type: 'STRING' },
        priceMin: { type: 'NUMBER' },
        priceMax: { type: 'NUMBER' },
        inStock: { type: 'BOOLEAN' },
        limit: { type: 'INTEGER', minimum: 1, maximum: 20 },
        page: { type: 'INTEGER', minimum: 1 },
        sort: { type: 'STRING', enum: ['relevance', 'price_asc', 'price_desc', 'updated_desc'] },
      },
    },
  },
  {
    name: 'getProductById',
    description: 'Get a single product by ID.',
    parameters: {
      type: 'OBJECT',
      properties: { id: { type: 'STRING' } },
      required: ['id'],
    },
  },
];

function buildSort(sort) {
  switch (sort) {
    case 'price_asc':
      return { price: 1 };
    case 'price_desc':
      return { price: -1 };
    case 'updated_desc':
      return { updatedAt: -1 };
    default:
      return undefined; // relevance handled when Atlas Search is used
  }
}

async function run_searchProducts(rawArgs) {
  const args = searchSchema.parse(rawArgs || {});
  const query = {};

  if (args.category) {
    if (mongoose.Types.ObjectId.isValid(args.category)) {
      query.category_id = args.category;
    } else {
      const cat = await Category.findOne({ name: args.category }).select('_id').lean();
      if (cat) {
        query.category_id = cat._id;
      } else {
        return { ok: true, data: [] };
      }
    }
  }

  if (args.inStock === true) query.stock = { $gt: 0 };
  if (args.priceMin != null || args.priceMax != null) {
    query.price = {};
    if (args.priceMin != null) query.price.$gte = args.priceMin;
    if (args.priceMax != null) query.price.$lte = args.priceMax;
  }

  if (args.q) {
    const safe = regexEscape(args.q);
    query.$or = [
      { name: new RegExp(safe, 'i') },
      { description: new RegExp(safe, 'i') },
    ];
  }

  const docs = await Product.find(query)
    .select('_id name price stock category_id updatedAt')
    .sort(buildSort(args.sort) ?? { updatedAt: -1 })
    .skip((args.page - 1) * args.limit)
    .limit(args.limit)
    .lean();

  const mapped = docs.map((d) => ({
    _id: String(d._id),
    name: d.name,
    price: d.price,
    stock: d.stock,
    category_id: d.category_id,
    updatedAt: d.updatedAt,
  }));

  return { ok: true, data: mapped };
}

async function run_getProductById(rawArgs) {
  const { id } = idSchema.parse(rawArgs || {});
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { ok: false, error: 'NOT_FOUND' };
  }
  const doc = await Product.findById(id)
    .select('_id name category_id price stock specifications description updatedAt')
    .lean();
  if (!doc) return { ok: false, error: 'NOT_FOUND' };

  return {
    ok: true,
    data: {
      _id: String(doc._id),
      name: doc.name,
      category_id: doc.category_id,
      price: doc.price,
      stock: doc.stock,
      specifications: doc.specifications,
      description: doc.description,
      updatedAt: doc.updatedAt,
    },
  };
}

async function dispatchTool(name, args) {
  if (name === 'searchProducts') return run_searchProducts(args);
  if (name === 'getProductById') return run_getProductById(args);
  return { ok: false, error: 'Unknown tool' };
}

const SYSTEM_PROMPT = `Bạn là trợ lý bán hàng cho cửa hàng điện thoại/phụ kiện.
- Khi câu hỏi cần giá/tồn kho/chi tiết sản phẩm → gọi tool tương ứng.
- Không tiết lộ dữ liệu nội bộ (PII, giá nhập, biên lợi nhuận).
  - Trả lời ngắn gọn bằng tiếng Việt, ghi giá VND, kèm ID sản phẩm khi trích từ DB.`;

module.exports = { functionDeclarations, dispatchTool, SYSTEM_PROMPT };

