/**
 * generate.js — Material generation for the learn-english module.
 *
 * Storage-agnostic: this module ONLY produces content and reads/writes the
 * generated JSON file (`auto.json`). It does NOT touch Postgres — the learn
 * feature is fully file-backed so it works even when Postgres is down.
 *
 * Conventions:
 *   - Picks a theme by the current hour (mixed rotation).
 *   - Generates ONE themed flashcard deck (~10 cards) + ONE short reading
 *     passage reusing those words (learn-then-read reinforcement).
 *   - Generation prefers DashScope (qwen-flash) when DASHSCOPE_API_KEY is set;
 *     otherwise falls back to a built-in curated theme bank.
 *   - Idempotent: slug keyed by local `YYYYMMDDHH`; re-running the same hour
 *     is a no-op.
 *
 * Generated content is stored with `auto-` slug prefixes so it never collides
 * with the seed decks/passages and a future `learn:migrate` (if ever run) won't
 * wipe it.
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || "";
const LLM_ENDPOINT =
  process.env.DASHSCOPE_LLM_ENDPOINT ||
  "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const LLM_MODEL = process.env.DASHSCOPE_LLM_MODEL || "qwen-flash";
const LLM_TIMEOUT_MS = 20000;

/** Set to a positive number to prune older auto-* content; 0 = accumulate. */
export const PRUNE_KEEP = 0;

export const AUTO_PATH = join(__dirname, "..", "..", "data", "learn", "auto.json");

// ── Themes (mixed rotation) ───────────────────────────────────────────────
export const THEMES = [
  { key: "daily-life", label: "日常生活" },
  { key: "workplace", label: "职场沟通" },
  { key: "tech", label: "科技前沿" },
  { key: "travel", label: "旅行出游" },
  { key: "food", label: "美食料理" },
  { key: "health", label: "健康运动" },
  { key: "nature", label: "自然户外" },
  { key: "shopping", label: "购物消费" },
];

// ── Curated offline fallback (one entry per theme key above) ──────────────
export const FALLBACK = {
  "daily-life": {
    title: "日常生活 · 8 词闪卡",
    description: "晨间惯例、家务与邻里之间的高频表达。",
    cards: [
      { en: "commute", zh: "通勤", hint: "daily travel to work" },
      { en: "routine", zh: "日常惯例", hint: "a regular habit" },
      { en: "laundry", zh: "待洗的衣服", hint: "clothes to wash" },
      { en: "grocery", zh: "食品杂货", hint: "food shopping" },
      { en: "recipe", zh: "食谱", hint: "cooking steps" },
      { en: "chore", zh: "家务杂事", hint: "a small task at home" },
      { en: "neighbor", zh: "邻居", hint: "person next door" },
      { en: "balcony", zh: "阳台", hint: "small outdoor ledge" },
    ],
    passage: {
      title: "A Calm Saturday Morning",
      level: "B1",
      body:
        "On Saturday I break my weekday routine and take my time. After a short commute from the bedroom to the kitchen, I make coffee and read the recipe I saved for pancakes.\n\nLater I do the laundry and buy groceries for the week. My neighbor waves from her balcony while I finish a small chore. These quiet moments make the day feel calm and mine.",
      words: [
        { lemma: "commute", phonetic: "/kəˈmjuːt/", zh: "通勤", pos: "n./v.", example: "My commute is only ten minutes." },
        { lemma: "routine", phonetic: "/ruːˈtiːn/", zh: "日常惯例", pos: "n.", example: "He follows the same morning routine." },
        { lemma: "laundry", phonetic: "/ˈlɔːndri/", zh: "待洗的衣服", pos: "n.", example: "I folded the laundry yesterday." },
        { lemma: "grocery", phonetic: "/ˈɡroʊsəri/", zh: "食品杂货", pos: "n.", example: "We need groceries for dinner." },
        { lemma: "recipe", phonetic: "/ˈresəpi/", zh: "食谱", pos: "n.", example: "This recipe is easy to follow." },
        { lemma: "chore", phonetic: "/tʃɔːr/", zh: "家务杂事", pos: "n.", example: "Washing dishes is a daily chore." },
        { lemma: "neighbor", phonetic: "/ˈneɪbər/", zh: "邻居", pos: "n.", example: "Our neighbor grows tomatoes." },
        { lemma: "balcony", phonetic: "/ˈbælkəni/", zh: "阳台", pos: "n.", example: "She reads on the balcony." },
      ],
    },
  },
  workplace: {
    title: "职场沟通 · 8 词闪卡",
    description: "会议、邮件与协作里最常说的词。",
    cards: [
      { en: "deadline", zh: "截止日期", hint: "time limit for work" },
      { en: "feedback", zh: "反馈", hint: "response to your work" },
      { en: "agenda", zh: "议程", hint: "list of items to discuss" },
      { en: "prioritize", zh: "排定优先级", hint: "decide what comes first" },
      { en: "colleague", zh: "同事", hint: "person you work with" },
      { en: "milestone", zh: "里程碑", hint: "key project checkpoint" },
      { en: "delegate", zh: "委派", hint: "assign a task to someone" },
      { en: "follow-up", zh: "后续跟进", hint: "handled in a later step" },
    ],
    passage: {
      title: "The Monday Sync",
      level: "B1",
      body:
        "Our team meeting started with a clear agenda. The project milestone is close, so we had to prioritize the most urgent tasks before the Friday deadline.\n\nMy colleague offered helpful feedback on the draft, and I agreed to delegate the smaller items. A short follow-up email will keep everyone aligned.",
      words: [
        { lemma: "deadline", phonetic: "/ˈdedlaɪn/", zh: "截止日期", pos: "n.", example: "We missed the deadline." },
        { lemma: "feedback", phonetic: "/ˈfiːdbæk/", zh: "反馈", pos: "n.", example: "Thanks for your feedback." },
        { lemma: "agenda", phonetic: "/əˈdʒendə/", zh: "议程", pos: "n.", example: "What is on the agenda?" },
        { lemma: "prioritize", phonetic: "/praɪˈɔːrətaɪz/", zh: "排定优先级", pos: "v.", example: "We must prioritize safety." },
        { lemma: "colleague", phonetic: "/ˈkɒliːɡ/", zh: "同事", pos: "n.", example: "She is a trusted colleague." },
        { lemma: "milestone", phonetic: "/ˈmaɪlstəʊn/", zh: "里程碑", pos: "n.", example: "We hit a major milestone." },
        { lemma: "delegate", phonetic: "/ˈdelɪɡeɪt/", zh: "委派", pos: "v.", example: "He will delegate the task." },
        { lemma: "follow-up", phonetic: "/ˈfɒləʊ ʌp/", zh: "后续跟进", pos: "n.", example: "Send a follow-up tomorrow." },
      ],
    },
  },
  tech: {
    title: "科技前沿 · 8 词闪卡",
    description: "聊 AI、产品与上线时常用的词。",
    cards: [
      { en: "deploy", zh: "部署；发布", hint: "put code on a server" },
      { en: "model", zh: "模型", hint: "a trained AI system" },
      { en: "dataset", zh: "数据集", hint: "collection of training data" },
      { en: "latency", zh: "延迟", hint: "time before a response" },
      { en: "feature", zh: "功能；特征", hint: "a product capability" },
      { en: "bug", zh: "漏洞；缺陷", hint: "a software error" },
      { en: "scale", zh: "扩展", hint: "grow to handle more load" },
      { en: "pipeline", zh: "流水线", hint: "automated build steps" },
    ],
    passage: {
      title: "Shipping a New Feature",
      level: "B2",
      body:
        "We trained a small model on a clean dataset and turned it into a new feature. Before we deploy it, we measure latency so the response stays fast.\n\nEvery pipeline run catches bugs early, and the system can scale to more users without breaking. Shipping feels calm when the basics are solid.",
      words: [
        { lemma: "deploy", phonetic: "/dɪˈplɔɪ/", zh: "部署；发布", pos: "v.", example: "We will deploy on Friday." },
        { lemma: "model", phonetic: "/ˈmɒdl/", zh: "模型", pos: "n.", example: "The model predicts well." },
        { lemma: "dataset", phonetic: "/ˈdeɪtəset/", zh: "数据集", pos: "n.", example: "The dataset is large." },
        { lemma: "latency", phonetic: "/ˈleɪtənsi/", zh: "延迟", pos: "n.", example: "Latency dropped to 80ms." },
        { lemma: "feature", phonetic: "/ˈfiːtʃər/", zh: "功能；特征", pos: "n.", example: "This is a useful feature." },
        { lemma: "bug", phonetic: "/bʌɡ/", zh: "漏洞；缺陷", pos: "n.", example: "We fixed a critical bug." },
        { lemma: "scale", phonetic: "/skeɪl/", zh: "扩展", pos: "v.", example: "The service can scale." },
        { lemma: "pipeline", phonetic: "/ˈpaɪplaɪn/", zh: "流水线", pos: "n.", example: "The pipeline runs nightly." },
      ],
    },
  },
  travel: {
    title: "旅行出游 · 8 词闪卡",
    description: "订票、问路与酒店场景的词。",
    cards: [
      { en: "itinerary", zh: "行程表", hint: "planned travel route" },
      { en: "boarding", zh: "登机；登船", hint: "getting on transport" },
      { en: "reservation", zh: "预订", hint: "booking a room or seat" },
      { en: "luggage", zh: "行李", hint: "bags you travel with" },
      { en: "souvenir", zh: "纪念品", hint: "a keepsake from a trip" },
      { en: "destination", zh: "目的地", hint: "place you travel to" },
      { en: "currency", zh: "货币", hint: "money of a country" },
      { en: "delay", zh: "延误", hint: "late arrival or departure" },
    ],
    passage: {
      title: "A Smooth Trip",
      level: "B1",
      body:
        "I checked my itinerary the night before. At the airport, boarding was quick and my luggage was light. The hotel reservation was ready when I arrived at the destination.\n\nI exchanged some currency and bought a small souvenir. The only delay was a short rain shower, which did not spoil the day.",
      words: [
        { lemma: "itinerary", phonetic: "/aɪˈtɪnərəri/", zh: "行程表", pos: "n.", example: "Our itinerary is full." },
        { lemma: "boarding", phonetic: "/ˈbɔːdɪŋ/", zh: "登机；登船", pos: "n.", example: "Boarding starts at 9." },
        { lemma: "reservation", phonetic: "/ˌrezərˈveɪʃn/", zh: "预订", pos: "n.", example: "I have a reservation." },
        { lemma: "luggage", phonetic: "/ˈlʌɡɪdʒ/", zh: "行李", pos: "n.", example: "Where is my luggage?" },
        { lemma: "souvenir", phonetic: "/ˌsuːvəˈnɪr/", zh: "纪念品", pos: "n.", example: "She bought a souvenir." },
        { lemma: "destination", phonetic: "/ˌdestɪˈneɪʃn/", zh: "目的地", pos: "n.", example: "Paris was our destination." },
        { lemma: "currency", phonetic: "/ˈkʌrənsi/", zh: "货币", pos: "n.", example: "The local currency is yen." },
        { lemma: "delay", phonetic: "/dɪˈleɪ/", zh: "延误", pos: "n.", example: "The flight had a delay." },
      ],
    },
  },
  food: {
    title: "美食料理 · 8 词闪卡",
    description: "点餐、烹饪与口味描述。",
    cards: [
      { en: "ingredient", zh: "原料；配料", hint: "a food component" },
      { en: "flavor", zh: "风味；味道", hint: "how food tastes" },
      { en: "roast", zh: "烤；烘烤", hint: "cook in dry heat" },
      { en: "spicy", zh: "辛辣的", hint: "with strong chili heat" },
      { en: "portion", zh: "一份；分量", hint: "a served amount" },
      { en: "fresh", zh: "新鲜的", hint: "recently made or picked" },
      { en: "menu", zh: "菜单", hint: "list of dishes" },
      { en: "tender", zh: "嫩的", hint: "soft to chew" },
    ],
    passage: {
      title: "Cooking for Friends",
      level: "B1",
      body:
        "I read the menu and chose a dish with simple ingredients. The chicken was roasted until tender, and the fresh herbs gave it a bright flavor.\n\nIt was a little spicy, but everyone finished their portion. Cooking for friends is my favorite kind of evening.",
      words: [
        { lemma: "ingredient", phonetic: "/ɪnˈɡriːdiənt/", zh: "原料；配料", pos: "n.", example: "List the ingredients." },
        { lemma: "flavor", phonetic: "/ˈfleɪvər/", zh: "风味；味道", pos: "n.", example: "The flavor is rich." },
        { lemma: "roast", phonetic: "/rəʊst/", zh: "烤；烘烤", pos: "v./adj.", example: "We roast the vegetables." },
        { lemma: "spicy", phonetic: "/ˈspaɪsi/", zh: "辛辣的", pos: "adj.", example: "This soup is spicy." },
        { lemma: "portion", phonetic: "/ˈpɔːʃn/", zh: "一份；分量", pos: "n.", example: "A small portion is enough." },
        { lemma: "fresh", phonetic: "/freʃ/", zh: "新鲜的", pos: "adj.", example: "The bread is fresh." },
        { lemma: "menu", phonetic: "/ˈmenjuː/", zh: "菜单", pos: "n.", example: "Open the menu, please." },
        { lemma: "tender", phonetic: "/ˈtendər/", zh: "嫩的", pos: "adj.", example: "The meat is tender." },
      ],
    },
  },
  health: {
    title: "健康运动 · 8 词闪卡",
    description: "锻炼、睡眠与身体状态。",
    cards: [
      { en: "workout", zh: "锻炼；训练", hint: "a session of exercise" },
      { en: "stamina", zh: "耐力", hint: "ability to keep going" },
      { en: "recover", zh: "恢复", hint: "get back to normal" },
      { en: "posture", zh: "姿势", hint: "how you hold your body" },
      { en: "hydrate", zh: "补水", hint: "drink enough water" },
      { en: "restful", zh: "安稳的", hint: "deep and calm sleep" },
      { en: "stretch", zh: "拉伸", hint: "lengthen muscles" },
      { en: "balanced", zh: "均衡的", hint: "in the right proportion" },
    ],
    passage: {
      title: "A Healthy Evening",
      level: "B1",
      body:
        "After a short workout I like to stretch so my body can recover. Good posture during the day protects my back, and I try to hydrate before sleep.\n\nA balanced dinner and a restful night give me the stamina to enjoy tomorrow. Small habits add up.",
      words: [
        { lemma: "workout", phonetic: "/ˈwɜːkaʊt/", zh: "锻炼；训练", pos: "n.", example: "That was a hard workout." },
        { lemma: "stamina", phonetic: "/ˈstæmɪnə/", zh: "耐力", pos: "n.", example: "Running builds stamina." },
        { lemma: "recover", phonetic: "/rɪˈkʌvər/", zh: "恢复", pos: "v.", example: "He needs time to recover." },
        { lemma: "posture", phonetic: "/ˈpɒstʃər/", zh: "姿势", pos: "n.", example: "Sit with good posture." },
        { lemma: "hydrate", phonetic: "/ˈhaɪdreɪt/", zh: "补水", pos: "v.", example: "Remember to hydrate." },
        { lemma: "restful", phonetic: "/ˈrestfl/", zh: "安稳的", pos: "adj.", example: "I had a restful sleep." },
        { lemma: "stretch", phonetic: "/stretʃ/", zh: "拉伸", pos: "v.", example: "Stretch before running." },
        { lemma: "balanced", phonetic: "/ˈbælənst/", zh: "均衡的", pos: "adj.", example: "Eat a balanced diet." },
      ],
    },
  },
  nature: {
    title: "自然户外 · 8 词闪卡",
    description: "徒步、天气与风景。",
    cards: [
      { en: "trail", zh: "小径；步道", hint: "a path through nature" },
      { en: "summit", zh: "山顶", hint: "the top of a mountain" },
      { en: "breeze", zh: "微风", hint: "a gentle wind" },
      { en: "wildlife", zh: "野生动植物", hint: "animals in nature" },
      { en: "scenery", zh: "风景", hint: "natural views" },
      { en: "forecast", zh: "天气预报", hint: "predicted weather" },
      { en: "valley", zh: "山谷", hint: "low land between hills" },
      { en: "sunrise", zh: "日出", hint: "sun appearing at dawn" },
    ],
    passage: {
      title: "Up the Mountain Trail",
      level: "B1",
      body:
        "We followed the trail before sunrise and reached the summit as the breeze cooled the air. The scenery below was a green valley waking up.\n\nThe weather forecast was right: clear skies and calm wildlife. Moments like this make the early start worth it.",
      words: [
        { lemma: "trail", phonetic: "/treɪl/", zh: "小径；步道", pos: "n.", example: "The trail is steep." },
        { lemma: "summit", phonetic: "/ˈsʌmɪt/", zh: "山顶", pos: "n.", example: "We stood on the summit." },
        { lemma: "breeze", phonetic: "/briːz/", zh: "微风", pos: "n.", example: "A soft breeze blew." },
        { lemma: "wildlife", phonetic: "/ˈwaɪldlaɪf/", zh: "野生动植物", pos: "n.", example: "We saw local wildlife." },
        { lemma: "scenery", phonetic: "/ˈsiːnəri/", zh: "风景", pos: "n.", example: "The scenery is stunning." },
        { lemma: "forecast", phonetic: "/ˈfɔːkɑːst/", zh: "天气预报", pos: "n.", example: "The forecast is sunny." },
        { lemma: "valley", phonetic: "/ˈvæli/", zh: "山谷", pos: "n.", example: "The river crosses the valley." },
        { lemma: "sunrise", phonetic: "/ˈsʌnraɪz/", zh: "日出", pos: "n.", example: "We watched the sunrise." },
      ],
    },
  },
  shopping: {
    title: "购物消费 · 8 词闪卡",
    description: "比价、退换与促销。",
    cards: [
      { en: "discount", zh: "折扣", hint: "price reduction" },
      { en: "receipt", zh: "收据", hint: "proof of purchase" },
      { en: "refund", zh: "退款", hint: "money given back" },
      { en: "bargain", zh: "便宜货；议价", hint: "a good deal" },
      { en: "coupon", zh: "优惠券", hint: "a discount voucher" },
      { en: "budget", zh: "预算", hint: "money plan" },
      { en: "brand", zh: "品牌", hint: "a product maker" },
      { en: "cart", zh: "购物车", hint: "where items are held" },
    ],
    passage: {
      title: "Smart Shopping",
      level: "B1",
      body:
        "I set a budget before shopping and added items to my cart. A coupon gave me a discount, and the brand I like was on sale.\n\nI kept the receipt in case I need a refund. Finding a real bargain feels better than buying without a plan.",
      words: [
        { lemma: "discount", phonetic: "/ˈdɪskaʊnt/", zh: "折扣", pos: "n.", example: "There is a ten percent discount." },
        { lemma: "receipt", phonetic: "/rɪˈsiːt/", zh: "收据", pos: "n.", example: "Keep your receipt." },
        { lemma: "refund", phonetic: "/ˈriːfʌnd/", zh: "退款", pos: "n.", example: "Ask for a refund." },
        { lemma: "bargain", phonetic: "/ˈbɑːɡɪn/", zh: "便宜货；议价", pos: "n.", example: "That was a bargain." },
        { lemma: "coupon", phonetic: "/ˈkuːpɒn/", zh: "优惠券", pos: "n.", example: "I used a coupon." },
        { lemma: "budget", phonetic: "/ˈbʌdʒɪt/", zh: "预算", pos: "n.", example: "Stay within your budget." },
        { lemma: "brand", phonetic: "/brænd/", zh: "品牌", pos: "n.", example: "It is a trusted brand." },
        { lemma: "cart", phonetic: "/kɑːt/", zh: "购物车", pos: "n.", example: "The cart is full." },
      ],
    },
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────
export function localHourKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}`;
}
export function humanHour(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:00`;
}
export function pickTheme(d = new Date()) {
  return THEMES[d.getHours() % THEMES.length];
}

export function extractJson(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < 0) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Normalize + validate LLM output; return null if unusable. */
export function normalizeLlm(obj, theme) {
  if (!obj || typeof obj !== "object") return null;
  const deck = obj.deck;
  const passage = obj.passage;
  if (!deck || !Array.isArray(deck.cards) || deck.cards.length < 5) return null;
  if (!passage || !passage.body || !Array.isArray(passage.words)) return null;

  const cards = [];
  const seen = new Set();
  for (const c of deck.cards) {
    const en = String(c?.en || "").trim().toLowerCase();
    const zh = String(c?.zh || "").trim();
    if (!en || !zh || seen.has(en)) continue;
    seen.add(en);
    cards.push({ en, zh, hint: String(c?.hint || "").trim() || null });
    if (cards.length >= 12) break;
  }
  if (cards.length < 5) return null;

  const words = [];
  const wseen = new Set();
  for (const w of passage.words) {
    const lemma = String(w?.lemma || "").trim().toLowerCase().replace(/[^a-z'-]/g, "");
    if (!lemma || wseen.has(lemma)) continue;
    wseen.add(lemma);
    words.push({
      lemma,
      phonetic: String(w?.phonetic || "").trim() || null,
      zh: String(w?.zh || "").trim() || lemma,
      pos: String(w?.pos || "").trim() || null,
      example: String(w?.example || "").trim() || null,
    });
  }

  return {
    deck: {
      title: String(deck.title || `${theme.label} · 词卡`).trim(),
      description: String(deck.description || "").trim(),
      cards,
    },
    passage: {
      title: String(passage.title || theme.label).trim(),
      level: String(passage.level || "B1").trim(),
      body: String(passage.body).trim(),
      words,
    },
  };
}

export function fallbackContent(theme) {
  const fb = FALLBACK[theme.key];
  if (!fb) return null;
  const cards = fb.cards.map((c, i) => ({ ...c, en: c.en.toLowerCase(), sort_order: i + 1 }));
  const words = fb.passage.words.map((w) => ({ ...w, lemma: w.lemma.toLowerCase() }));
  return {
    source: "fallback",
    deck: { title: fb.title, description: fb.description, cards },
    passage: { title: fb.passage.title, level: fb.passage.level, body: fb.passage.body, words },
  };
}

export async function generateWithLlm(theme) {
  if (!DASHSCOPE_API_KEY) return null;
  const system =
    "You are an English teaching assistant for Chinese-speaking learners (CEFR B1–B2). " +
    "You write clear, natural material and always reply with valid JSON only.";
  const user = `主题：「${theme.label}」
请为英语学习者生成一份「单词闪卡组」和一篇「短文」，二者共用同一批核心词汇，方便学完即读。

严格只输出一个 JSON 对象（不要解释、不要代码块、不要 Markdown），结构如下：
{
  "deck": {
    "title": "主题名 · 10 词闪卡",
    "description": "一句话说明这套词卡适合什么场景",
    "cards": [
      {"en":"英文单词或短语","zh":"中文释义","hint":"英文记忆提示(6-10词)"}
    ]
  },
  "passage": {
    "title": "短文标题",
    "level": "B1",
    "body": "2-3 段英文短文，120-180 词，尽量使用 deck.cards 里的词（至少 7 个），用词自然、有连贯情节；段落间用空行分隔。",
    "words": [
      {"lemma":"英文原形(小写)","phonetic":"/音标/","zh":"中文释义","pos":"词性如 n./v./adj.","example":"含该词的英文例句"}
    ]
  }
}
要求：
- deck.cards 正好 10 个，en 不重复，难度贴合主题。
- passage.words 覆盖短文中出现的主要生词（包含 deck 里的词），每个都要有 phonetic/zh/pos/example。
- phonetic 用国际音标并带斜杠，如 /kəˈmjuːt/。
- 全部字段为 JSON 字符串，中文 UTF-8。`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LLM_TIMEOUT_MS);
  try {
    const res = await fetch(LLM_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        temperature: 0.85,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.error(`[learn:generate] LLM HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || "";
    const parsed = extractJson(text);
    const norm = normalizeLlm(parsed, theme);
    if (!norm) {
      console.error("[learn:generate] LLM output failed validation");
      return null;
    }
    return { source: "llm", ...norm };
  } catch (err) {
    console.error("[learn:generate] LLM call failed:", err?.message || err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Produce one cycle of content (deck + passage) for the given theme/hour.
 * Pure w.r.t. storage — the caller persists it.
 * @returns {Promise<{hourKey:string,hour:string,theme:string,source:string,deck:object,passage:object}>}
 */
export async function buildContent(theme, now = new Date()) {
  let content = await generateWithLlm(theme);
  if (!content) content = fallbackContent(theme);
  if (!content) throw new Error("no content generated");
  return {
    hourKey: localHourKey(now),
    hour: humanHour(now),
    theme: theme.label,
    source: content.source,
    deck: content.deck,
    passage: content.passage,
  };
}

// ── auto.json persistence (file-backed, no Postgres) ───────────────────────
export function emptyAuto() {
  return { decks: [], passages: [] };
}

export function loadAuto(autoPath = AUTO_PATH) {
  try {
    const raw = readFileSync(autoPath, "utf8");
    const data = JSON.parse(raw);
    return {
      decks: Array.isArray(data.decks) ? data.decks : [],
      passages: Array.isArray(data.passages) ? data.passages : [],
    };
  } catch {
    return emptyAuto();
  }
}

export function saveAuto(auto, autoPath = AUTO_PATH) {
  const dir = dirname(autoPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${autoPath}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(auto, null, 2), "utf8");
  renameSync(tmp, autoPath);
}

/**
 * Idempotently append one cycle's content to the in-memory `auto` object.
 * @returns {{skipped:boolean, deckSlug:string, passageSlug:string, deckTitle?:string, cardCount?:number, passageTitle?:string, wordCount?:number}}
 */
export function applyToAuto(auto, hourKey, content) {
  const deckSlug = `auto-deck-${hourKey}`;
  const passageSlug = `auto-reading-${hourKey}`;

  const deckExists = auto.decks.some((d) => d.slug === deckSlug);
  const passageExists = auto.passages.some((p) => p.slug === passageSlug);
  if (deckExists && passageExists) {
    return { skipped: true, deckSlug, passageSlug };
  }

  const deck = {
    slug: deckSlug,
    title: content.deck.title,
    description: content.deck.description || "",
    cards: content.deck.cards.map((c, i) => ({
      en: c.en,
      zh: c.zh,
      hint: c.hint ?? null,
      sort_order: i + 1,
    })),
  };
  const passage = {
    slug: passageSlug,
    title: content.passage.title,
    body: content.passage.body,
    level: content.passage.level ?? null,
    words: content.passage.words.map((w) => ({
      lemma: w.lemma,
      phonetic: w.phonetic ?? null,
      zh: w.zh,
      pos: w.pos ?? null,
      example: w.example ?? null,
    })),
  };

  // Replace if a same-hour entry somehow exists partially.
  auto.decks = auto.decks.filter((d) => d.slug !== deckSlug);
  auto.passages = auto.passages.filter((p) => p.slug !== passageSlug);
  auto.decks.push(deck);
  auto.passages.push(passage);

  if (PRUNE_KEEP > 0) pruneAuto(auto, PRUNE_KEEP);

  return {
    skipped: false,
    deckSlug,
    passageSlug,
    deckTitle: deck.title,
    cardCount: deck.cards.length,
    passageTitle: passage.title,
    wordCount: passage.words.length,
  };
}

function pruneAuto(auto, keep) {
  if (auto.decks.length > keep) auto.decks = auto.decks.slice(-keep);
  if (auto.passages.length > keep) auto.passages = auto.passages.slice(-keep);
}
