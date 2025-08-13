const Product = require('../models/Product');
const { searchSchema, skuSchema, regexEscape } = require('../utils/sanitize');

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
    name: 'getProductBySku',
    description: 'Get a single product by SKU.',
    parameters: {
      type: 'OBJECT',
      properties: { sku: { type: 'STRING' } },
      required: ['sku'],
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

  if (args.category) query.category_id = args.category;
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
    sku: String(d._id),
    name: d.name,
    price: d.price,
    stock: d.stock,
    category: d.category_id,
    updatedAt: d.updatedAt,
  }));

  return { ok: true, data: mapped };
}

async function run_getProductBySku(rawArgs) {
  const { sku } = skuSchema.parse(rawArgs || {});
  const doc = await Product.findById(sku)
    .select('_id name category_id price stock specifications description updatedAt')
    .lean();
  if (!doc) return { ok: false, error: 'NOT_FOUND' };

  return {
    ok: true,
    data: {
      sku: String(doc._id),
      name: doc.name,
      category: doc.category_id,
      price: doc.price,
      stock: doc.stock,
      specs: doc.specifications,
      description: doc.description,
      updatedAt: doc.updatedAt,
    },
  };
}

async function dispatchTool(name, args) {
  if (name === 'searchProducts') return run_searchProducts(args);
  if (name === 'getProductBySku') return run_getProductBySku(args);
  return { ok: false, error: 'Unknown tool' };
}

const SYSTEM_PROMPT = `Bạn là trợ lý bán hàng cho cửa hàng điện thoại/phụ kiện.
- Khi câu hỏi cần giá/tồn kho/chi tiết sản phẩm → gọi tool tương ứng.
- Không tiết lộ dữ liệu nội bộ (PII, giá nhập, biên lợi nhuận).
- Trả lời ngắn gọn bằng tiếng Việt, ghi giá VND, kèm SKU khi trích từ DB.`;

module.exports = { functionDeclarations, dispatchTool, SYSTEM_PROMPT };

