// Per-company news from Google News RSS search.
'use strict';

const { fetchText } = require('./http');
const { getCompanies } = require('./companies');

const NEWS_TTL_MS = 10 * 60 * 1000;
const NEWS_CANDIDATES = 30; // most relevant results considered before sorting by date
const NEWS_LIMIT = 10;
const NEWS_MIN_RECENT = 3; // fewer recent hits than this → retry without the date window
const NEWS_LOCALES = {
  ko: { hl: 'ko', gl: 'KR', ceid: 'KR:ko' },
  en: { hl: 'en-US', gl: 'US', ceid: 'US:en' },
};
// Big tech and chip makers make plenty of non-AI news; narrow them to AI coverage.
const AI_SCOPED_CATEGORIES = new Set(['bigtech', 'infra']);

// id:lang -> { at, version, data }
const newsCache = new Map();

function newsQuery(c, lang) {
  if (c.news && c.news[lang]) return c.news[lang];
  const name = (lang === 'ko' ? c.nameKo : `"${c.name}"`).replace(/\s*\(.*?\)/g, '');
  return AI_SCOPED_CATEGORIES.has(c.category) ? `${name} AI` : name;
}

const compact = (s) => s.replace(/\s+/g, '');
// Ticker pages ("Baidu, Inc. (BIDU) Stock Price, News, Quote & History") aren't news.
const JUNK_TITLE = /stock price,? news,? quote/i;

// Google matches loosely (body text, related terms), which lets spam and off-topic stories in.
// Keep only headlines naming the company: for each OR-alternative of the query, its quoted
// phrase or else its first word that isn't "AI". Multi-word capitalized phrases match
// case-sensitively so "Scale AI" doesn't match "to scale AI-guided …".
function headlineMatcher(query) {
  const terms = query.split(/\s+OR\s+/).map((alt) => {
    const quoted = alt.match(/"([^"]+)"/);
    const text = quoted ? quoted[1] : alt.split(/\s+/).find((w) => w.toUpperCase() !== 'AI') || alt;
    const caseSensitive = Boolean(quoted) && /\s/.test(text) && /[A-Z]/.test(text);
    return caseSensitive ? { text: compact(text), caseSensitive } : { text: compact(text).toLowerCase(), caseSensitive };
  });
  return (title) => {
    if (JUNK_TITLE.test(title)) return false;
    const exact = compact(title);
    const lower = exact.toLowerCase();
    return terms.some((t) => (t.caseSensitive ? exact : lower).includes(t.text));
  };
}

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&(lt|gt|quot|apos|nbsp);/g, (_, n) => ({ lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[n])
    .replace(/&amp;/g, '&');
}

function parseRss(xml) {
  const items = [];
  for (const [, block] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const tag = (name) => {
      const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
      return m ? decodeEntities(m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '')).trim() : '';
    };
    const source = tag('source');
    const sourceUrl = (block.match(/<source url="([^"]*)"/) || [])[1] || '';
    let title = tag('title');
    // Google News appends " - <source>" to every headline, and some publishers already put their
    // own name there too ("… - 머니투데이 - mt.co.kr"); drop both.
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    title = title.replace(/ - [^\s-]{1,12}$/, '');
    const url = tag('link');
    if (!title || !/^https:\/\//.test(url)) continue;
    items.push({ title, url, source, sourceUrl: decodeEntities(sourceUrl), publishedAt: Date.parse(tag('pubDate')) || null });
  }
  return items;
}

// Character-bigram Jaccard similarity; catches the same story syndicated by several outlets.
function bigrams(title) {
  const s = title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const set = new Set();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

function similarity(a, b) {
  let shared = 0;
  for (const g of a) if (b.has(g)) shared++;
  return shared / (a.size + b.size - shared || 1);
}

function pickNews(items) {
  const kept = [];
  for (const item of items.slice(0, NEWS_CANDIDATES)) {
    const grams = bigrams(item.title);
    if (kept.some((k) => similarity(k.grams, grams) > 0.45)) continue;
    kept.push({ ...item, grams });
  }
  return kept
    .sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0))
    .slice(0, NEWS_LIMIT)
    .map(({ grams, ...item }) => item);
}

function googleNewsUrl(kind, query, lang) {
  const { hl, gl, ceid } = NEWS_LOCALES[lang];
  const base = kind === 'rss' ? 'https://news.google.com/rss/search' : 'https://news.google.com/search';
  return `${base}?q=${encodeURIComponent(query)}&hl=${hl}&gl=${gl}&ceid=${ceid}`;
}

async function fetchNews(c, lang) {
  const { version } = getCompanies();
  const key = `${c.id}:${lang}`;
  const cached = newsCache.get(key);
  if (cached && cached.version === version && Date.now() - cached.at < NEWS_TTL_MS) return cached.data;

  const query = newsQuery(c, lang);
  const namesCompany = headlineMatcher(query);
  const search = async (q) => {
    const url = googleNewsUrl('rss', q, lang);
    let xml;
    try {
      xml = await fetchText(url, 'application/rss+xml');
    } catch {
      // Google News occasionally drops a request (503/timeout); one retry covers most of it.
      await new Promise((r) => setTimeout(r, 600));
      xml = await fetchText(url, 'application/rss+xml');
    }
    return parseRss(xml).filter((item) => namesCompany(item.title));
  };

  let items = await search(`${query} when:30d`);
  let windowDays = 30;
  if (items.length < NEWS_MIN_RECENT) {
    items = await search(query);
    windowDays = null;
  }

  const data = { id: c.id, lang, query, windowDays, items: pickNews(items), moreUrl: googleNewsUrl('web', query, lang) };
  newsCache.set(key, { at: Date.now(), version, data });
  return data;
}

module.exports = { fetchNews, NEWS_LOCALES };
