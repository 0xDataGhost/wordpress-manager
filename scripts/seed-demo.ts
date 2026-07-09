#!/usr/bin/env tsx
/**
 * Demo data seeder — populates the test store with realistic production-like data.
 * Run: cd apps/api && npx tsx ../../scripts/seed-demo.ts
 */

import { createCipheriv, createHmac, randomBytes, randomUUID } from "node:crypto";
import pkg from "pg";

const { Pool } = pkg;

// ──────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────
const DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/saas_dashboard";
const ENC_KEY = Buffer.from(
  "c533f17e4fd9752f1d384ad440f9d5668596e44e4f319a8ba4a3b70134532a5a",
  "hex",
);
const HASH_KEY =
  "27b68dc3ac19880e8fb28b3628b91d6b409301c10b8c4b2a558f11b633a52f46e3e3e577ba89bb4e3fd014fe94b12add";

const STORE_ID = "111d8920-5a55-4b16-93fb-add6711bfde7";
const OWNER_ID = "9ce7c24a-8838-404c-a928-8790a162b8ff";

const TODAY = new Date("2026-06-28T12:00:00Z");

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
const uid = () => randomUUID();
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const rndInt = (lo: number, hi: number) => Math.floor(Math.random() * (hi - lo + 1)) + lo;
const rndFloat = (lo: number, hi: number, dp = 2) =>
  parseFloat((Math.random() * (hi - lo) + lo).toFixed(dp));
const daysAgo = (n: number): Date => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - n);
  return d;
};

function encryptCode(raw: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const enc = Buffer.concat([c.update(raw.trim(), "utf8"), c.final()]);
  return {
    cipher: enc.toString("base64"),
    iv: iv.toString("base64"),
    tag: c.getAuthTag().toString("base64"),
  };
}
const hashCode = (raw: string) =>
  createHmac("sha256", HASH_KEY).update(raw.trim(), "utf8").digest("hex");
const preview = (raw: string): string => {
  const s = raw.trim();
  if (s.length <= 4) return "••••";
  const v = s.length > 8 ? 4 : 2;
  return `${s.slice(0, v)}••••${s.slice(s.length - v)}`;
};

const rndAlnum = (len: number) => {
  const chars = "ABCDEFGHIJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: len }, () => chars[rndInt(0, chars.length - 1)]).join("");
};

function genCode(category: string, seq: number): string {
  const s = String(seq).padStart(6, "0");
  switch (category) {
    case "netflix":      return `NFLX-${rndAlnum(4)}-${rndAlnum(4)}-${rndAlnum(4)}-${s}`;
    case "shahid":       return `SHID-${rndAlnum(5)}-${rndAlnum(5)}-${s}`;
    case "chatgpt":      return `cgpt_${rndAlnum(8)}${rndAlnum(8)}${s}`;
    case "spotify":      return `SP-${rndAlnum(4)}-${rndAlnum(4)}-${rndAlnum(4)}-${s}`;
    case "youtube":      return `YTP-${rndAlnum(6)}-${rndAlnum(6)}-${s}`;
    case "xbox":         return `${rndAlnum(5)}-${rndAlnum(5)}-${rndAlnum(5)}-${rndAlnum(5)}-${s}`;
    case "playstation":  return `${rndAlnum(5)}-${rndAlnum(5)}-${rndAlnum(5)}-${rndAlnum(5)}-${s}`;
    case "office":
    case "windows":      return `${rndAlnum(5)}-${rndAlnum(5)}-${rndAlnum(5)}-${rndAlnum(5)}-${s}`;
    case "steam":        return `${rndAlnum(5)}-${rndAlnum(5)}-${rndAlnum(5)}-${s}`;
    case "googleplay":   return `${rndAlnum(4)}-${rndAlnum(4)}-${rndAlnum(4)}-${rndAlnum(4)}-${s}`;
    case "apple":        return `${rndAlnum(4)}-${rndAlnum(4)}-${rndAlnum(4)}-${rndAlnum(4)}-${s}`;
    case "adobe":        return `${rndAlnum(4)}-${rndAlnum(4)}-${rndAlnum(4)}-${rndAlnum(4)}-${rndAlnum(4)}-${s}`;
    default:             return `CODE-${rndAlnum(8)}-${s}`;
  }
}

async function bulkInsert(
  client: pkg.PoolClient,
  table: string,
  cols: string[],
  rows: unknown[][],
) {
  if (rows.length === 0) return;
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const placeholders = chunk
      .map((_, ri) => `(${cols.map((__, ci) => `$${ri * cols.length + ci + 1}`).join(",")})`)
      .join(",");
    await client.query(
      `INSERT INTO ${table} (${cols.join(",")}) VALUES ${placeholders}`,
      chunk.flat(),
    );
  }
}

// ──────────────────────────────────────────────
// Static data
// ──────────────────────────────────────────────

const supplierData = [
  { name: "DigitalWorld KSA", contact: "خالد الشمري", email: "khalid@digitalworld-ksa.com", phone: "+966512345670", website: "https://digitalworld-ksa.com", country: "SA", currency: "SAR", notes: "موردنا الرئيسي والمفضل. تسليم فوري ونسبة استبدال 1.2%.", status: "active", preferred: true },
  { name: "TechVault Arabia", contact: "محمد العنزي", email: "m.alanazi@techvault-arabia.com", phone: "+966501234567", website: "https://techvault-arabia.com", country: "SA", currency: "SAR", notes: "مورد موثوق. نسبة استبدال 2.8%.", status: "active", preferred: false },
  { name: "DigiKeys Pro", contact: "Ahmed Al-Mansouri", email: "ahmed@digikeys-pro.ae", phone: "+97155987654", website: "https://digikeys-pro.ae", country: "AE", currency: "USD", notes: "مورد إماراتي. متخصص في الألعاب والاشتراكات الدولية.", status: "active", preferred: false },
  { name: "GulfSoft Supplies", contact: "Fahad Al-Sabah", email: "fahad@gulfsoft.kw", phone: "+96598765432", website: "https://gulfsoft.kw", country: "KW", currency: "KWD", notes: "جودة عالية. متوسط وقت التوصيل 2-3 أيام عمل.", status: "active", preferred: false },
  { name: "MediaStream Direct", contact: "Karim Hassan", email: "karim@mediastream.eg", phone: "+201012345678", website: "https://mediastream.eg", country: "EG", currency: "USD", notes: "أسعار تنافسية لكن نسبة استبدال مرتفعة 9.4%. يحتاج متابعة.", status: "active", preferred: false },
  { name: "SnapCodes International", contact: "John Williams", email: "j.williams@snapcodes.us", phone: "+12025551234", website: "https://snapcodes.us", country: "US", currency: "USD", notes: "مصدر ممتاز للرموز الأمريكية والأوروبية.", status: "active", preferred: false },
  { name: "StreamKeys Egypt", contact: "Omar Mahmoud", email: "omar@streamkeys.eg", phone: "+201234567890", website: "https://streamkeys.eg", country: "EG", currency: "EGP", notes: "توقف مؤقت. نسبة رموز غير صالحة 12%. قيد المراجعة.", status: "paused", preferred: false },
  { name: "ActivationHub EU", contact: "Klaus Müller", email: "k.mueller@activationhub.de", phone: "+4930123456", website: "https://activationhub.de", country: "DE", currency: "EUR", notes: "مورد أوروبي موثوق لمنتجات Adobe وMicrosoft.", status: "active", preferred: false },
  { name: "QatarDigital", contact: "Yousef Al-Thani", email: "y.althani@qatardigital.qa", phone: "+97433456789", website: "https://qatardigital.qa", country: "QA", currency: "QAR", notes: "شريك موثوق في السوق القطري.", status: "active", preferred: false },
  { name: "PrimeCodes KSA", contact: "فهد الغامدي", email: "fahad@primecodes.sa", phone: "+966566789012", website: "https://primecodes.sa", country: "SA", currency: "SAR", notes: "تم إيقافه. ثلاث شحنات متتالية بها رموز مكررة.", status: "archived", preferred: false },
];

const productData = [
  { name: "Netflix Basic — اشتراك شهر واحد", price: "35.00", cat: "netflix", ft: "subscription_code", cost: 22, stockLevel: "medium", status: "active", desc: "اشتراك Netflix Basic لمدة شهر واحد. مشاهدة بجهاز واحد بدقة SD." },
  { name: "Netflix Standard — اشتراك شهر", price: "55.00", cat: "netflix", ft: "subscription_code", cost: 34, stockLevel: "high", status: "active", desc: "اشتراك Netflix Standard. بدقة Full HD وجهازين." },
  { name: "Netflix Premium 4K — شهر", price: "75.00", cat: "netflix", ft: "subscription_code", cost: 47, stockLevel: "medium", status: "active", desc: "اشتراك Netflix Premium بدقة 4K. 4 أجهزة في آنٍ واحد." },
  { name: "Netflix Premium 4K — 3 أشهر", price: "199.00", cat: "netflix", ft: "subscription_code", cost: 131, stockLevel: "low", status: "active", desc: "اشتراك Netflix Premium لمدة 3 أشهر بدقة 4K HDR." },
  { name: "شاهد VIP — اشتراك شهر", price: "25.00", cat: "shahid", ft: "subscription_code", cost: 15, stockLevel: "high", status: "active", desc: "اشتراك شاهد VIP لمدة شهر. أفلام ومسلسلات عربية." },
  { name: "شاهد VIP — اشتراك 3 أشهر", price: "65.00", cat: "shahid", ft: "subscription_code", cost: 40, stockLevel: "medium", status: "active", desc: "اشتراك شاهد VIP لمدة 3 أشهر بخصم خاص." },
  { name: "شاهد VIP — اشتراك سنة كاملة", price: "149.00", cat: "shahid", ft: "subscription_code", cost: 95, stockLevel: "low", status: "active", desc: "اشتراك شاهد VIP سنوي. أفضل قيمة." },
  { name: "MBC شاهد — اشتراك شهر", price: "22.00", cat: "shahid", ft: "subscription_code", cost: 13, stockLevel: "medium", status: "active", desc: "مشاهدة قنوات MBC بث مباشر وحلقات حصرية." },
  { name: "ChatGPT Plus — اشتراك شهر", price: "79.00", cat: "chatgpt", ft: "subscription_code", cost: 57, stockLevel: "low", status: "active", desc: "اشتراك ChatGPT Plus الشهري. GPT-4 بدون انقطاع." },
  { name: "Spotify Individual — شهر", price: "22.00", cat: "spotify", ft: "subscription_code", cost: 13, stockLevel: "high", status: "active", desc: "اشتراك Spotify Individual لمدة شهر. استماع بلا إعلانات." },
  { name: "Spotify Individual — 3 أشهر", price: "59.00", cat: "spotify", ft: "subscription_code", cost: 36, stockLevel: "medium", status: "active", desc: "اشتراك Spotify 3 أشهر." },
  { name: "Spotify Family — شهر", price: "35.00", cat: "spotify", ft: "subscription_code", cost: 21, stockLevel: "medium", status: "active", desc: "Spotify Family حتى 6 أعضاء." },
  { name: "YouTube Premium — شهر", price: "25.00", cat: "youtube", ft: "subscription_code", cost: 15, stockLevel: "high", status: "active", desc: "يوتيوب بريميوم. مشاهدة بلا إعلانات وتحميل الفيديوهات." },
  { name: "YouTube Premium Family — شهر", price: "40.00", cat: "youtube", ft: "subscription_code", cost: 25, stockLevel: "medium", status: "active", desc: "YouTube Premium Family لكل أفراد العائلة." },
  { name: "Xbox Game Pass Ultimate — شهر", price: "55.00", cat: "xbox", ft: "subscription_code", cost: 36, stockLevel: "medium", status: "active", desc: "Xbox Game Pass Ultimate شهر. أكثر من 100 لعبة + Xbox Live Gold." },
  { name: "Xbox Game Pass Ultimate — 3 أشهر", price: "149.00", cat: "xbox", ft: "subscription_code", cost: 98, stockLevel: "medium", status: "active", desc: "Xbox Game Pass Ultimate 3 أشهر بسعر مميز." },
  { name: "Xbox Game Pass PC — شهر", price: "32.00", cat: "xbox", ft: "subscription_code", cost: 20, stockLevel: "low", status: "active", desc: "Game Pass للحاسب الشخصي. ألعاب EA Play مضمّنة." },
  { name: "PlayStation Plus Essential — شهر", price: "55.00", cat: "playstation", ft: "subscription_code", cost: 36, stockLevel: "medium", status: "active", desc: "PS Plus Essential. ألعاب مجانية شهرية ولعب أونلاين." },
  { name: "PlayStation Plus Extra — 3 أشهر", price: "159.00", cat: "playstation", ft: "subscription_code", cost: 104, stockLevel: "medium", status: "active", desc: "PS Plus Extra 3 أشهر. مكتبة ضخمة من الألعاب." },
  { name: "PlayStation Plus Premium — شهر", price: "75.00", cat: "playstation", ft: "subscription_code", cost: 50, stockLevel: "low", status: "active", desc: "PS Plus Premium. تجربة سحابية + كلاسيكيات PlayStation." },
  { name: "Microsoft 365 Personal — سنة", price: "199.00", cat: "office", ft: "license_key", cost: 138, stockLevel: "high", status: "active", desc: "Microsoft 365 Personal لمدة سنة. جهاز واحد." },
  { name: "Microsoft 365 Family — سنة", price: "329.00", cat: "office", ft: "license_key", cost: 228, stockLevel: "medium", status: "active", desc: "Microsoft 365 Family. حتى 6 مستخدمين." },
  { name: "Microsoft 365 Business — شهر", price: "55.00", cat: "office", ft: "license_key", cost: 38, stockLevel: "low", status: "active", desc: "Microsoft 365 Business Basic شهري." },
  { name: "Windows 11 Home", price: "199.00", cat: "windows", ft: "license_key", cost: 138, stockLevel: "high", status: "active", desc: "مفتاح تنشيط Windows 11 Home. ترخيص دائم." },
  { name: "Windows 11 Pro", price: "299.00", cat: "windows", ft: "license_key", cost: 208, stockLevel: "medium", status: "active", desc: "مفتاح تنشيط Windows 11 Pro. للمهنيين والشركات." },
  { name: "Windows 10 Pro", price: "249.00", cat: "windows", ft: "license_key", cost: 172, stockLevel: "zero", status: "active", desc: "مفتاح تنشيط Windows 10 Pro. نفد المخزون." },
  { name: "Steam Wallet — $5", price: "20.00", cat: "steam", ft: "gift_card_code", cost: 19, stockLevel: "high", status: "active", desc: "بطاقة Steam Wallet بقيمة 5 دولار." },
  { name: "Steam Wallet — $10", price: "38.00", cat: "steam", ft: "gift_card_code", cost: 36, stockLevel: "high", status: "active", desc: "بطاقة Steam Wallet بقيمة 10 دولار." },
  { name: "Steam Wallet — $20", price: "75.00", cat: "steam", ft: "gift_card_code", cost: 71, stockLevel: "high", status: "active", desc: "بطاقة Steam Wallet بقيمة 20 دولار." },
  { name: "Steam Wallet — $50", price: "188.00", cat: "steam", ft: "gift_card_code", cost: 178, stockLevel: "medium", status: "active", desc: "بطاقة Steam Wallet بقيمة 50 دولار." },
  { name: "Steam Wallet — $100", price: "375.00", cat: "steam", ft: "gift_card_code", cost: 356, stockLevel: "low", status: "active", desc: "بطاقة Steam Wallet بقيمة 100 دولار." },
  { name: "Google Play — 25 ريال", price: "27.00", cat: "googleplay", ft: "gift_card_code", cost: 26, stockLevel: "high", status: "active", desc: "بطاقة Google Play بقيمة 25 ريال سعودي." },
  { name: "Google Play — 50 ريال", price: "53.00", cat: "googleplay", ft: "gift_card_code", cost: 51, stockLevel: "high", status: "active", desc: "بطاقة Google Play بقيمة 50 ريال سعودي." },
  { name: "Google Play — 100 ريال", price: "105.00", cat: "googleplay", ft: "gift_card_code", cost: 101, stockLevel: "medium", status: "active", desc: "بطاقة Google Play بقيمة 100 ريال سعودي." },
  { name: "Apple Gift Card — 25 ريال", price: "27.00", cat: "apple", ft: "gift_card_code", cost: 26, stockLevel: "high", status: "active", desc: "بطاقة هدايا Apple بقيمة 25 ريال. للتطبيقات والألعاب." },
  { name: "Apple Gift Card — 50 ريال", price: "55.00", cat: "apple", ft: "gift_card_code", cost: 53, stockLevel: "high", status: "active", desc: "بطاقة هدايا Apple بقيمة 50 ريال." },
  { name: "Apple Gift Card — 100 ريال", price: "108.00", cat: "apple", ft: "gift_card_code", cost: 104, stockLevel: "medium", status: "active", desc: "بطاقة هدايا Apple بقيمة 100 ريال." },
  { name: "Apple Gift Card — 200 ريال", price: "215.00", cat: "apple", ft: "gift_card_code", cost: 207, stockLevel: "low", status: "active", desc: "بطاقة هدايا Apple بقيمة 200 ريال." },
  { name: "Adobe Creative Cloud — سنة كاملة", price: "449.00", cat: "adobe", ft: "license_key", cost: 330, stockLevel: "low", status: "active", desc: "Adobe Creative Cloud كامل. جميع التطبيقات لمدة سنة." },
  { name: "Adobe Photoshop — سنة", price: "299.00", cat: "adobe", ft: "license_key", cost: 220, stockLevel: "archived", status: "archived", desc: "Adobe Photoshop فقط لمدة سنة." },
  { name: "Shahid Plus — شهر (قديم)", price: "19.00", cat: "shahid", ft: "subscription_code", cost: 11, stockLevel: "archived", status: "archived", desc: "منتج قديم. تم استبداله بشاهد VIP." },
  { name: "Xbox Live Gold — شهر (متوقف)", price: "28.00", cat: "xbox", ft: "subscription_code", cost: 18, stockLevel: "archived", status: "archived", desc: "Xbox Live Gold متوقف. تم دمجه مع Game Pass Ultimate." },
];

const firstNamesM = ["محمد","أحمد","عبدالله","عمر","خالد","سعد","فيصل","علي","ناصر","سلطان","إبراهيم","يوسف","تركي","بندر","زياد","وليد","هاني","طارق","ماجد","رامي","عبدالعزيز","صالح","نايف","مشعل","عبدالرحمن","حمد","راشد","جاسم","شافي","حسام"];
const firstNamesF = ["فاطمة","نورة","سارة","ريم","لينا","هنا","رنا","دانة","أريج","شيماء","مريم","هيا","أمل","لمى","وفاء","هدى","رهف","غدير","بدور","رغد"];
const lastNames = ["العنزي","الحارثي","الزهراني","القحطاني","السهيمي","الدوسري","المطيري","الشمري","الرشيدي","الغامدي","الربيعي","السلمي","الحربي","الملكي","البلوي","الرحيلي","الصاعدي","العسيري","الأسمري","الشهري","العمري","الفيفي","البقمي","الغنام","الدخيل","المرشدي","آل سعود","العجلاني","الحذيفي","الزياني"];
const emailDomains = ["gmail.com","hotmail.com","yahoo.com","outlook.com","icloud.com"];
const countryCodes: [string, string][] = [
  ["SA","+96650"],["SA","+96655"],["SA","+96656"],["SA","+96659"],
  ["AE","+97150"],["AE","+97155"],
  ["KW","+96590"],["KW","+96565"],
  ["QA","+97433"],["QA","+97455"],
  ["BH","+97336"],["OM","+96892"],
];

const orderStatuses = [
  ...Array(42).fill("completed"),
  ...Array(12).fill("processing"),
  ...Array(11).fill("cancelled"),
  ...Array(8).fill("refunded"),
  ...Array(4).fill("failed"),
  ...Array(2).fill("on-hold"),
  ...Array(1).fill("pending"),
];

const paymentMethods = ["بطاقة ائتمانية","تحويل بنكي","Apple Pay","مدى","SADAD","PayPal","Visa","Mastercard"];

// ──────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────
async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();

  try {
    console.log("🌱 Starting demo data seed…");
    await client.query("BEGIN");

    // ── 1. SUPPLIERS ──────────────────────────
    console.log("  → Inserting suppliers…");
    const supplierIds: Record<string, string> = {};
    const supplierRows: unknown[][] = [];
    for (const s of supplierData) {
      const id = uid();
      supplierIds[s.name] = id;
      const createdAt = daysAgo(rndInt(120, 365));
      supplierRows.push([id, STORE_ID, s.name, s.contact, s.email, s.phone, s.website, s.country, s.currency, s.notes, s.status, s.preferred, createdAt, createdAt]);
    }
    await bulkInsert(client, "suppliers", ["id","store_id","name","contact_name","email","phone","website","country","currency","notes","status","is_preferred","created_at","updated_at"], supplierRows);

    // ── 2. PRODUCTS ───────────────────────────
    console.log("  → Inserting products…");
    const productIds: string[] = [];
    const productRows: unknown[][] = [];
    const productMeta: { id: string; cat: string; ft: string; cost: number; stockLevel: string; price: string }[] = [];
    const stockQuantityMap: Record<string, number> = {};

    for (let i = 0; i < productData.length; i++) {
      const p = productData[i];
      const id = uid();
      productIds.push(id);
      const stockQty = p.stockLevel === "high" ? rndInt(150, 280) : p.stockLevel === "medium" ? rndInt(40, 100) : p.stockLevel === "low" ? rndInt(3, 8) : 0;
      stockQuantityMap[id] = stockQty;
      const createdAt = daysAgo(rndInt(180, 400));
      productRows.push([id, STORE_ID, null, p.name, p.desc, p.desc.slice(0, 80), p.price, stockQty, p.status, null, null, createdAt, createdAt]);
      productMeta.push({ id, cat: p.cat, ft: p.ft, cost: p.cost, stockLevel: p.stockLevel, price: p.price });
    }
    await bulkInsert(client, "products", ["id","store_id","wp_product_id","name","description","short_description","price","stock_quantity","status","image_url","last_synced_at","created_at","updated_at"], productRows);

    // ── 3. DIGITAL PRODUCT SETTINGS ───────────
    console.log("  → Inserting digital product settings…");
    const settingsRows: unknown[][] = [];
    for (const m of productMeta) {
      const createdAt = daysAgo(rndInt(150, 380));
      const isEnabled = m.stockLevel !== "archived";
      const threshold = m.stockLevel === "low" ? 5 : m.stockLevel === "medium" ? 15 : 20;
      const instructions = m.ft === "license_key" ? "قم بتنشيط المفتاح من خلال الموقع الرسمي للمنتج." : m.ft === "subscription_code" ? "استخدم الرمز في صفحة الاشتراك الرسمية." : "استخدم الرمز في المتجر الرسمي.";
      settingsRows.push([uid(), STORE_ID, m.id, m.ft, isEnabled, true, "automatic", "fifo", ["processing","completed"], ["processing","completed"], true, true, threshold, 10, instructions, createdAt, createdAt]);
    }
    await bulkInsert(client, "digital_product_settings", ["id","store_id","product_id","fulfillment_type","is_enabled","auto_delivery_enabled","delivery_mode","code_pool_strategy","reserve_on_statuses","deliver_on_statuses","allow_manual_assignment","allow_replacement","low_stock_threshold","max_codes_per_order_item","instructions_template","created_at","updated_at"], settingsRows);

    // ── 4. SUPPLIER PRODUCTS ──────────────────
    console.log("  → Linking supplier products…");
    const activeSupplierIds = Object.entries(supplierIds).filter(([k]) => !k.includes("Egypt") && !k.includes("PrimeCodes")).map(([, v]) => v);
    const allSupplierIds = Object.values(supplierIds);
    const spRows: unknown[][] = [];
    for (const m of productMeta) {
      if (m.stockLevel === "archived") continue;
      const numSuppliers = rndInt(1, 3);
      const picked = [...activeSupplierIds].sort(() => Math.random() - 0.5).slice(0, numSuppliers);
      for (const sid of picked) {
        const costVar = m.cost * (1 + rndFloat(0.02, 0.12));
        const createdAt = daysAgo(rndInt(90, 360));
        spRows.push([uid(), STORE_ID, sid, m.id, `SKU-${rndAlnum(6)}`, costVar.toFixed(4), "SAR", rndInt(10, 200), rndInt(1, 5), null, createdAt, createdAt]);
      }
    }
    await bulkInsert(client, "supplier_products", ["id","store_id","supplier_id","product_id","supplier_sku","cost_price","currency","min_order_quantity","lead_time_days","notes","created_at","updated_at"], spRows);

    // ── 5. CUSTOMERS ──────────────────────────
    console.log("  → Inserting 200 customers…");
    const customerIds: string[] = [];
    const customerRows: unknown[][] = [];
    for (let i = 0; i < 200; i++) {
      const isFemale = Math.random() < 0.3;
      const firstName = isFemale ? pick(firstNamesF) : pick(firstNamesM);
      const lastName = pick(lastNames);
      const [country, phonePrefix] = pick(countryCodes);
      const phone = `${phonePrefix}${rndInt(1000000, 9999999)}`;
      const email = `${firstName.replace(/\s/g, "")}${rndInt(10, 999)}@${pick(emailDomains)}`;
      const isVip = i < 20;
      const ordersCount = isVip ? rndInt(15, 60) : (i < 80 ? rndInt(3, 15) : rndInt(0, 5));
      const totalSpent = (ordersCount * rndFloat(40, 250)).toFixed(2);
      const createdAt = daysAgo(rndInt(30, 380));
      const lastOrderAt = ordersCount > 0 ? daysAgo(rndInt(1, 90)) : null;
      const internalNotes = isVip ? "عميل VIP. يشتري بانتظام وقيمة عالية." : (Math.random() < 0.05 ? "تحذير: استرداد متعدد سابق." : null);
      const cid = uid();
      customerIds.push(cid);
      customerRows.push([cid, STORE_ID, 1001 + i, `${firstName} ${lastName}`, email, phone, totalSpent, ordersCount, lastOrderAt, internalNotes, new Date(createdAt), createdAt, createdAt]);
    }
    await bulkInsert(client, "customers", ["id","store_id","wp_customer_id","name","email","phone","total_spent","orders_count","last_order_at","internal_notes","last_synced_at","created_at","updated_at"], customerRows);

    // ── 6. ORDERS + ORDER ITEMS ───────────────
    console.log("  → Inserting ~750 orders…");
    const activeProductMeta = productMeta.filter(m => m.stockLevel !== "archived");
    const orderIds: string[] = [];
    const orderRows: unknown[][] = [];
    const orderItemRows: unknown[][] = [];
    type OIMeta = { id: string; orderId: string; pm: typeof productMeta[0]; status: string; customerId: string; placedAt: Date; qty: number };
    const orderItemMeta: OIMeta[] = [];

    for (let oi = 0; oi < 750; oi++) {
      const status = pick(orderStatuses);
      const customerId = pick(customerIds);
      const daysBack = Math.floor(Math.pow(Math.random(), 0.7) * 365);
      const placedAt = daysAgo(daysBack);
      const numItems = Math.random() < 0.3 ? 2 : (Math.random() < 0.05 ? 3 : 1);
      const items: { pm: typeof productMeta[0]; qty: number }[] = [];
      for (let k = 0; k < numItems; k++) items.push({ pm: pick(activeProductMeta), qty: 1 });
      const total = items.reduce((s, it) => s + parseFloat(it.pm.price) * it.qty, 0);
      const digitalStatus = status === "completed" ? "completed" : status === "processing" ? (Math.random() < 0.5 ? "pending" : "partial") : status === "cancelled" ? "cancelled" : status === "refunded" ? "refunded" : status === "failed" ? "failed" : "not_required";
      const completedAt = digitalStatus === "completed" ? new Date(placedAt.getTime() + rndInt(60000, 7200000)) : null;
      const oid = uid();
      orderIds.push(oid);
      orderRows.push([oid, STORE_ID, 5001 + oi, customerId, `ORD-${5001 + oi}`, status, total.toFixed(2), "SAR", pick(paymentMethods), null, digitalStatus, true, completedAt, placedAt, new Date(placedAt.getTime() + rndInt(1000, 5000)), placedAt, placedAt]);
      for (const it of items) {
        const iid = uid();
        const itemTotal = (parseFloat(it.pm.price) * it.qty).toFixed(2);
        orderItemRows.push([iid, STORE_ID, oid, it.pm.id, null, `DIGI-${rndAlnum(8)}`, productData[productMeta.indexOf(it.pm)].name, it.qty, it.pm.price, itemTotal, placedAt]);
        orderItemMeta.push({ id: iid, orderId: oid, pm: it.pm, status, customerId, placedAt, qty: it.qty });
      }
    }
    await bulkInsert(client, "orders", ["id","store_id","wp_order_id","customer_id","order_number","status","total","currency","payment_method","internal_notes","digital_delivery_status","digital_delivery_required","digital_delivery_completed_at","placed_at","last_synced_at","created_at","updated_at"], orderRows);
    await bulkInsert(client, "order_items", ["id","store_id","order_id","product_id","wp_product_id","sku","name","quantity","price","total","created_at"], orderItemRows);

    // ── 7. CODE BATCHES + DIGITAL CODES ──────
    console.log("  → Creating code batches and digital codes…");
    const deliveredItems = orderItemMeta.filter(m => m.status === "completed");
    const processingItems = orderItemMeta.filter(m => m.status === "processing");
    const cancelledItems = orderItemMeta.filter(m => ["cancelled","refunded","failed"].includes(m.status));

    const productCodePlan: Record<string, { available: number; assigned: number; delivered: number; cancelled: number; invalid: number; expired: number; batchIds: string[]; supplierId: string }> = {};
    for (const m of activeProductMeta) {
      productCodePlan[m.id] = {
        available: stockQuantityMap[m.id] ?? 0,
        assigned: processingItems.filter(i => i.pm.id === m.id).length,
        delivered: deliveredItems.filter(i => i.pm.id === m.id).length,
        cancelled: Math.min(cancelledItems.filter(i => i.pm.id === m.id).length, rndInt(1, 5)),
        invalid: rndInt(1, 4),
        expired: m.stockLevel === "low" ? rndInt(1, 3) : 0,
        batchIds: [],
        supplierId: pick(allSupplierIds),
      };
    }

    const batchRows: unknown[][] = [];
    const codeRows: unknown[][] = [];
    const codeIdsByProduct: Record<string, string[]> = {};
    let globalCodeSeq = 1;

    for (const m of activeProductMeta) {
      const plan = productCodePlan[m.id];
      const totalCodes = plan.available + plan.assigned + plan.delivered + plan.cancelled + plan.invalid + plan.expired;
      if (totalCodes === 0) continue;
      const numBatches = totalCodes > 200 ? 3 : (totalCodes > 80 ? 2 : 1);
      const batchCodesTarget = Math.ceil(totalCodes / numBatches);
      codeIdsByProduct[m.id] = [];
      let codeOffset = 0;
      for (let bi = 0; bi < numBatches; bi++) {
        const batchId = uid();
        plan.batchIds.push(batchId);
        const batchCount = bi === numBatches - 1 ? totalCodes - codeOffset : Math.min(batchCodesTarget, totalCodes - codeOffset);
        const costPerCode = (m.cost * rndFloat(0.95, 1.05)).toFixed(4);
        const costTotal = (parseFloat(costPerCode) * batchCount).toFixed(2);
        const importedDaysAgo = rndInt(30, 300);
        const createdAt = daysAgo(importedDaysAgo);
        const batchName = `${productData[productMeta.indexOf(m)].name} — دفعة ${bi + 1}`;
        const cur = m.cat === "googleplay" || m.cat === "apple" || m.cat === "shahid" ? "SAR" : pick(["SAR","USD","EUR"]);
        batchRows.push([batchId, STORE_ID, m.id, plan.supplierId, batchName, "manual_import", null, batchCount, bi === 0 ? plan.available : 0, 0, bi === 0 ? plan.delivered : 0, bi === 0 ? plan.delivered : 0, bi === 0 ? plan.invalid : 0, costTotal, costPerCode, cur, null, null, "active", OWNER_ID, createdAt, createdAt]);
        for (let ci = 0; ci < batchCount; ci++) {
          const rawCode = genCode(m.cat, globalCodeSeq++);
          const enc = encryptCode(rawCode);
          const codeId = uid();
          const codeCreatedAt = daysAgo(importedDaysAgo - rndInt(0, 3));
          codeIdsByProduct[m.id].push(codeId);
          codeRows.push([codeId, STORE_ID, m.id, batchId, plan.supplierId, enc.cipher, enc.iv, enc.tag, hashCode(rawCode), preview(rawCode), "available", null, null, null, null, null, null, null, costPerCode, cur, OWNER_ID, codeCreatedAt, codeCreatedAt]);
        }
        codeOffset += batchCount;
      }
    }

    await bulkInsert(client, "code_batches", ["id","store_id","product_id","supplier_id","batch_name","source","import_file_name","quantity_total","quantity_available","quantity_reserved","quantity_sold","quantity_delivered","quantity_invalid","cost_total","cost_per_code","currency","expires_at","notes","status","created_by","created_at","updated_at"], batchRows);
    await bulkInsert(client, "digital_codes", ["id","store_id","product_id","batch_id","supplier_id","code_cipher","code_iv","code_tag","code_hash","code_preview","status","reserved_until","assigned_order_id","assigned_order_item_id","assigned_customer_id","sold_at","delivered_at","expires_at","cost_price","currency","created_by","created_at","updated_at"], codeRows);

    // ── 8. CODE ASSIGNMENTS ───────────────────
    console.log("  → Creating code assignments…");
    const availablePool: Record<string, string[]> = {};
    for (const [pid, codes] of Object.entries(codeIdsByProduct)) availablePool[pid] = [...codes];
    const popCode = (pid: string): string | null => availablePool[pid]?.pop() ?? null;

    type AssignmentMeta = { id: string; codeId: string; orderId: string; customerId: string; status: string; deliveredAt: Date | null; placedAt: Date };
    const assignmentMeta: AssignmentMeta[] = [];
    const assignmentRows: unknown[][] = [];

    for (const item of deliveredItems) {
      const codeId = popCode(item.pm.id);
      if (!codeId) continue;
      const aid = uid();
      const delivAt = new Date(item.placedAt.getTime() + rndInt(5000, 300000));
      assignmentRows.push([aid, STORE_ID, codeId, item.pm.id, item.orderId, item.id, item.customerId, "sale", "delivered", OWNER_ID, item.placedAt, delivAt, null, null, item.placedAt, item.placedAt]);
      assignmentMeta.push({ id: aid, codeId, orderId: item.orderId, customerId: item.customerId, status: "delivered", deliveredAt: delivAt, placedAt: item.placedAt });
    }
    for (const item of processingItems) {
      const codeId = popCode(item.pm.id);
      if (!codeId) continue;
      const aid = uid();
      assignmentRows.push([aid, STORE_ID, codeId, item.pm.id, item.orderId, item.id, item.customerId, "sale", "assigned", OWNER_ID, item.placedAt, null, null, null, item.placedAt, item.placedAt]);
      assignmentMeta.push({ id: aid, codeId, orderId: item.orderId, customerId: item.customerId, status: "assigned", deliveredAt: null, placedAt: item.placedAt });
    }
    for (const item of cancelledItems.slice(0, 80)) {
      const codeId = popCode(item.pm.id);
      if (!codeId) continue;
      const assignStatus = item.status === "refunded" ? "refunded" : "cancelled";
      assignmentRows.push([uid(), STORE_ID, codeId, item.pm.id, item.orderId, item.id, item.customerId, "sale", assignStatus, OWNER_ID, item.placedAt, null, null, null, item.placedAt, item.placedAt]);
    }

    await bulkInsert(client, "code_assignments", ["id","store_id","code_id","product_id","order_id","order_item_id","customer_id","assignment_type","status","assigned_by","assigned_at","delivered_at","replaced_by_assignment_id","notes","created_at","updated_at"], assignmentRows);

    // Update code statuses
    console.log("  → Updating code statuses…");
    for (const dp of assignmentMeta.filter(a => a.status === "delivered")) {
      await client.query(`UPDATE digital_codes SET status='delivered', assigned_order_id=$1, assigned_customer_id=$2, sold_at=$3, delivered_at=$4, updated_at=$4 WHERE id=$5`, [dp.orderId, dp.customerId, dp.placedAt, dp.deliveredAt, dp.codeId]);
    }
    for (const ap of assignmentMeta.filter(a => a.status === "assigned")) {
      await client.query(`UPDATE digital_codes SET status='sold', assigned_order_id=$1, assigned_customer_id=$2, sold_at=$3, updated_at=$3 WHERE id=$4`, [ap.orderId, ap.customerId, ap.placedAt, ap.codeId]);
    }
    for (const m of activeProductMeta) {
      const pool3 = availablePool[m.id] ?? [];
      const plan = productCodePlan[m.id];
      if (!plan) continue;
      const invIds = pool3.splice(0, plan.invalid);
      const expIds = pool3.splice(0, plan.expired);
      for (const cid of invIds) await client.query(`UPDATE digital_codes SET status='invalid', updated_at=NOW() WHERE id=$1`, [cid]);
      for (const cid of expIds) await client.query(`UPDATE digital_codes SET status='expired', expires_at=NOW() - INTERVAL '1 day', updated_at=NOW() WHERE id=$1`, [cid]);
    }

    // ── 9. DIGITAL DELIVERIES + ATTEMPTS ─────
    console.log("  → Creating digital deliveries…");
    const deliveryRows: unknown[][] = [];
    const attemptRows: unknown[][] = [];
    const completedOrders = orderItemMeta.filter(i => i.status === "completed").reduce((acc, i) => { acc.set(i.orderId, i); return acc; }, new Map<string, OIMeta>());
    for (const [oid, item] of completedOrders) {
      const did = uid();
      const channel = pick(["dashboard","email","woocommerce_note","manual"]);
      const completedAt = new Date(item.placedAt.getTime() + rndInt(60000, 600000));
      deliveryRows.push([did, STORE_ID, oid, item.customerId, "completed", channel, null, null, "تم تسليم رموزك الرقمية", "تم تسليم الرموز بنجاح ✓", 1, completedAt, completedAt, null, OWNER_ID, item.placedAt, item.placedAt]);
      attemptRows.push([uid(), STORE_ID, did, oid, channel, "sent", "system", null, null, null, {}, item.placedAt]);
      if (Math.random() < 0.1) {
        attemptRows.push([uid(), STORE_ID, did, oid, channel, "failed", "system", null, "DELIVERY_ERROR", "فشل الإرسال الأول. تمت إعادة المحاولة بنجاح.", {}, new Date(item.placedAt.getTime() - rndInt(60000, 300000))]);
      }
    }
    const failedDelivItems = processingItems.slice(0, 40);
    for (const item of failedDelivItems) {
      const did = uid();
      deliveryRows.push([did, STORE_ID, item.orderId, item.customerId, "failed", "dashboard", null, null, "تسليم رموزك الرقمية", "فشل في التسليم. قيد المراجعة.", 2, daysAgo(1), null, "خطأ في التحقق من صحة الطلب.", OWNER_ID, item.placedAt, item.placedAt]);
      attemptRows.push([uid(), STORE_ID, did, item.orderId, "dashboard", "failed", "system", null, "VALIDATION_ERROR", "فشل التحقق من البيانات.", {}, item.placedAt]);
    }
    await bulkInsert(client, "digital_deliveries", ["id","store_id","order_id","customer_id","status","channel","recipient_email","recipient_phone","subject","message_preview","attempt_count","last_attempt_at","completed_at","failed_reason","created_by","created_at","updated_at"], deliveryRows);
    await bulkInsert(client, "delivery_attempts", ["id","store_id","delivery_id","order_id","channel","status","provider","provider_message_id","error_code","error_message","metadata","created_at"], attemptRows);

    // ── 10. CUSTOMER ACCESS TOKENS ────────────
    console.log("  → Creating customer access tokens…");
    const catRows: unknown[][] = [];
    const completedItemsList = Array.from(completedOrders.values());
    for (let ci = 0; ci < Math.min(80, completedItemsList.length); ci++) {
      const item = completedItemsList[ci];
      const rawTok = `cat_${rndAlnum(32)}`;
      const tokHash = createHmac("sha256", "57dc109c4c7d2f93ffd762528d1fbfda72e3c682b25b140b3e63a18776c5ebf17068622bfcb14efd04c572fc679e6801").update(rawTok, "utf8").digest("hex");
      const createdAt = new Date(item.placedAt.getTime() + rndInt(300000, 1200000));
      const expiresAt = new Date(createdAt.getTime() + 7 * 24 * 3600 * 1000);
      const isRevoked = Math.random() < 0.15;
      const revokedAt = isRevoked ? new Date(createdAt.getTime() + rndInt(3600000, 86400000)) : null;
      catRows.push([uid(), STORE_ID, item.orderId, item.customerId, tokHash, expiresAt, Math.random() < 0.3 ? 5 : null, isRevoked ? 0 : rndInt(1, 5), revokedAt, OWNER_ID, createdAt, createdAt]);
    }
    await bulkInsert(client, "customer_access_tokens", ["id","store_id","order_id","customer_id","token_hash","expires_at","max_uses","used_count","revoked_at","created_by","created_at","updated_at"], catRows);

    // ── 11. AUTOMATIONS ───────────────────────
    console.log("  → Creating automations…");
    const automationTypes = [
      { type: "low_stock_alert", enabled: true, config: { threshold: 10 } },
      { type: "daily_sales_report", enabled: true, config: { time: "08:00" } },
      { type: "whatsapp_order_message", enabled: false, config: { message_template: "شكراً لطلبك {{order_number}}" } },
      { type: "digital_low_stock_alert", enabled: true, config: { threshold: 5 } },
      { type: "digital_out_of_stock_alert", enabled: true, config: {} },
      { type: "digital_failed_delivery_alert", enabled: true, config: {} },
      { type: "digital_replacement_rate_alert", enabled: true, config: { threshold: 0.05 } },
      { type: "auto_assign_codes_on_paid_order", enabled: true, config: {} },
      { type: "auto_deliver_codes_on_paid_order", enabled: true, config: {} },
    ];
    const automationIdMap: Record<string, string> = {};
    const automationRows: unknown[][] = [];
    for (const a of automationTypes) {
      const aid = uid();
      automationIdMap[a.type] = aid;
      const createdAt = daysAgo(rndInt(100, 300));
      automationRows.push([aid, STORE_ID, a.type, a.enabled, a.config, createdAt, createdAt]);
    }
    await bulkInsert(client, "automations", ["id","store_id","type","enabled","config","created_at","updated_at"], automationRows);

    // ── 12. AUTOMATION LOGS ───────────────────
    console.log("  → Creating automation logs…");
    const logStatuses = ["success","success","success","success","skipped","failed"] as const;
    const automationLogRows: unknown[][] = [];
    for (const [type, aid] of Object.entries(automationIdMap)) {
      for (let li = 0; li < rndInt(40, 70); li++) {
        const status = pick([...logStatuses]);
        const createdAt = daysAgo(rndInt(0, 360));
        const message = status === "success" ? `تم تنفيذ ${type} بنجاح.` : status === "skipped" ? `تخطّي: لا توجد بيانات لمعالجتها.` : `فشل تنفيذ ${type}: خطأ في الاتصال.`;
        automationLogRows.push([uid(), STORE_ID, aid, type, status, message, { count: rndInt(1, 20) }, createdAt]);
      }
    }
    await bulkInsert(client, "automation_logs", ["id","store_id","automation_id","type","status","message","metadata","created_at"], automationLogRows);

    // ── 13. NOTIFICATIONS ─────────────────────
    console.log("  → Creating notifications…");
    const notifTemplates = [
      { type: "new_order", severity: "info", title: "طلب جديد", message: "تم استلام طلب جديد #ORD-N بقيمة AMT ريال." },
      { type: "low_stock", severity: "warning", title: "مخزون منخفض", message: "مخزون منتج PROD وصل إلى CNT رموز فقط." },
      { type: "digital_out_of_stock", severity: "error", title: "نفاد المخزون", message: "نفد مخزون رموز PROD تماماً. يرجى إعادة التخزين." },
      { type: "digital_low_stock", severity: "warning", title: "تنبيه مخزون رقمي", message: "مخزون PROD الرقمي منخفض. تبقّى CNT رموز." },
      { type: "digital_delivery_failed", severity: "error", title: "فشل تسليم رقمي", message: "فشل تسليم الرمز للطلب #ORD-N. يحتاج مراجعة يدوية." },
      { type: "digital_replacement_rate", severity: "warning", title: "معدل استبدال مرتفع", message: "معدل استبدال PROD وصل RATE%. راجع مزود الرموز." },
      { type: "daily_report", severity: "success", title: "تقرير يومي", message: "مبيعات اليوم: AMT ريال. ORD طلب مكتمل." },
      { type: "failed_sync", severity: "error", title: "فشل مزامنة", message: "فشلت مزامنة WooCommerce. سيتم إعادة المحاولة تلقائياً." },
      { type: "digital_inventory", severity: "info", title: "استيراد رموز", message: "تم استيراد CNT رموز جديدة لمنتج PROD بنجاح." },
    ];
    const notifRows: unknown[][] = [];
    for (let ni = 0; ni < 200; ni++) {
      const tmpl = pick(notifTemplates);
      const createdAt = daysAgo(rndInt(0, 60));
      const isRead = Math.random() < 0.65;
      const readAt = isRead ? new Date(createdAt.getTime() + rndInt(60000, 86400000)) : null;
      const prodName = productData[rndInt(0, productData.length - 4)].name;
      const msg = tmpl.message.replace("N", String(5001 + rndInt(0, 749))).replace("AMT", String(rndInt(50, 500))).replace("PROD", prodName).replace("CNT", String(rndInt(2, 8))).replace("RATE", String(rndFloat(5, 15, 1))).replace("ORD", String(rndInt(3, 25)));
      notifRows.push([uid(), STORE_ID, tmpl.type, tmpl.title, msg, tmpl.severity, readAt, { generated: true }, createdAt, createdAt]);
    }
    await bulkInsert(client, "notifications", ["id","store_id","type","title","message","severity","read_at","metadata","created_at","updated_at"], notifRows);

    // ── 14. AUDIT LOGS ────────────────────────
    console.log("  → Creating audit logs…");
    const auditEntries = [
      { action: "auth.login", entity: "user", msg: "تسجيل دخول ناجح." },
      { action: "product.created", entity: "product", msg: "تم إنشاء منتج جديد." },
      { action: "product.updated", entity: "product", msg: "تم تحديث بيانات المنتج." },
      { action: "digital_codes_imported", entity: "digital_batch", msg: "تم استيراد دفعة رموز رقمية." },
      { action: "digital_code_revealed", entity: "digital_code", msg: "تم كشف رمز رقمي." },
      { action: "digital_codes_assigned", entity: "digital_code", msg: "تم تعيين رموز رقمية للطلب." },
      { action: "digital_codes_delivered", entity: "digital_delivery", msg: "تم تسليم الرموز الرقمية." },
      { action: "digital_customer_link_created", entity: "digital_delivery", msg: "تم إنشاء رابط وصول للعميل." },
      { action: "supplier_created", entity: "supplier", msg: "تم إضافة مورد جديد." },
      { action: "supplier_updated", entity: "supplier", msg: "تم تحديث بيانات المورد." },
      { action: "automation.enabled", entity: "automation", msg: "تم تفعيل الأتمتة." },
      { action: "automation.config_updated", entity: "automation", msg: "تم تحديث إعدادات الأتمتة." },
      { action: "order.notes_updated", entity: "order", msg: "تم تحديث ملاحظات الطلب." },
      { action: "customer.notes_updated", entity: "customer", msg: "تم تحديث ملاحظات العميل." },
      { action: "settings.updated", entity: "settings", msg: "تم تحديث إعدادات المتجر." },
      { action: "digital_code_replaced", entity: "digital_code", msg: "تم استبدال الرمز بسبب مشكلة في التنشيط." },
      { action: "digital_assignment_refunded", entity: "digital_code", msg: "تم استرداد الرمز الرقمي." },
    ];
    const auditRows: unknown[][] = [];
    for (let ai = 0; ai < 500; ai++) {
      const a = pick(auditEntries);
      const createdAt = daysAgo(rndInt(0, 365));
      auditRows.push([uid(), STORE_ID, OWNER_ID, a.action, a.entity, uid(), a.msg, { automated: Math.random() < 0.3 }, `192.168.${rndInt(1, 255)}.${rndInt(1, 255)}`, "Mozilla/5.0 (Macintosh) AppleWebKit/537.36", createdAt]);
    }
    await bulkInsert(client, "audit_logs", ["id","store_id","user_id","action","entity_type","entity_id","message","metadata","ip_address","user_agent","created_at"], auditRows);

    await client.query("COMMIT");

    // ── Summary ───────────────────────────────
    const [p, cu, su, o, dc, cb, dd, n, al, aul, ca, oi] = await Promise.all([
      client.query(`SELECT COUNT(*) FROM products WHERE store_id='${STORE_ID}'`),
      client.query(`SELECT COUNT(*) FROM customers WHERE store_id='${STORE_ID}'`),
      client.query(`SELECT COUNT(*) FROM suppliers WHERE store_id='${STORE_ID}'`),
      client.query(`SELECT COUNT(*) FROM orders WHERE store_id='${STORE_ID}'`),
      client.query(`SELECT COUNT(*) FROM digital_codes WHERE store_id='${STORE_ID}'`),
      client.query(`SELECT COUNT(*) FROM code_batches WHERE store_id='${STORE_ID}'`),
      client.query(`SELECT COUNT(*) FROM digital_deliveries WHERE store_id='${STORE_ID}'`),
      client.query(`SELECT COUNT(*) FROM notifications WHERE store_id='${STORE_ID}'`),
      client.query(`SELECT COUNT(*) FROM audit_logs WHERE store_id='${STORE_ID}'`),
      client.query(`SELECT COUNT(*) FROM automation_logs WHERE store_id='${STORE_ID}'`),
      client.query(`SELECT COUNT(*) FROM code_assignments WHERE store_id='${STORE_ID}'`),
      client.query(`SELECT COUNT(*) FROM order_items WHERE store_id='${STORE_ID}'`),
    ]);
    console.log("\n✅  Demo data seeding complete!\n");
    console.log("─────────────────────────────────────");
    console.log(`  Products:        ${p.rows[0].count}`);
    console.log(`  Suppliers:       ${su.rows[0].count}`);
    console.log(`  Customers:       ${cu.rows[0].count}`);
    console.log(`  Orders:          ${o.rows[0].count}`);
    console.log(`  Order Items:     ${oi.rows[0].count}`);
    console.log(`  Code Batches:    ${cb.rows[0].count}`);
    console.log(`  Digital Codes:   ${dc.rows[0].count}`);
    console.log(`  Assignments:     ${ca.rows[0].count}`);
    console.log(`  Deliveries:      ${dd.rows[0].count}`);
    console.log(`  Notifications:   ${n.rows[0].count}`);
    console.log(`  Audit Logs:      ${al.rows[0].count}`);
    console.log(`  Automation Logs: ${aul.rows[0].count}`);
    console.log("─────────────────────────────────────");

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Seed failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
