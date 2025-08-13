const { z } = require('zod');

// Schema for product search filters
const searchSchema = z.object({
  q: z.string().trim().min(0).optional(),
  category: z.string().trim().optional(),
  priceMin: z.coerce.number().optional(),
  priceMax: z.coerce.number().optional(),
  inStock: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(20).default(5),
  page: z.coerce.number().int().min(1).default(1),
  sort: z.enum(["relevance", "price_asc", "price_desc", "updated_desc"]).default("updated_desc"),
});

// Schema for a single product ID lookup
const idSchema = z.object({ id: z.string().trim().min(1) });

// Escape regex special characters
function regexEscape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = { searchSchema, idSchema, regexEscape };

