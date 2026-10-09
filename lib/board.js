// Comparison board: one-year daily closes, period returns, market cap (USD) and valuation for
// every company with its own listing.
'use strict';

const { getCompanies } = require('./companies');
const { fetchChart } = require('./quotes');
const { mapLimit } = require('./http');

const BOARD_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const USER_AGENT = 'Mozilla/5.0';
// Yahoo FX symbols quote units of the currency per 1 USD (KRW=X ≈ 1380).
const FX_SYMBOLS = { KRW: 'KRW=X', HKD: 'HKD=X', JPY: 'JPY=X', TWD: 'TWD=X', EUR: 'EUR=X', CNY: 'CNY=X' };

let cache = null; // { at, data }
let inflight = null;
let session = null; // { at, cookie, crumb }

// Yahoo's quote endpoint (market cap, P/E) needs a session cookie plus a matching "crumb".
async function yahooSession() {
  if (session && Date.now() - session.at < SESSION_TTL_MS) return session;
  const res = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': USER_AGENT }, redirect: 'manual' });
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', { headers: { 'User-Agent': USER_AGENT, Cookie: cookie } });
  const crumb = await crumbRes.text();
  if (!crumbRes.ok || !crumb || crumb.includes('<')) throw new Error(`crumb HTTP ${crumbRes.status}`);
  session = { at: Date.now(), cookie, crumb };
  return session;
}

async function fetchQuoteDetails(symbols) {
  const { cookie, crumb } = await yahooSession();
  const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(','))}&crumb=${encodeURIComponent(crumb)}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Cookie: cookie } });
  if (res.status === 401) session = null; // stale crumb; next board refresh gets a new one
  if (!res.ok) throw new Error(`quote HTTP ${res.status}`);
  const json = await res.json();
  return new Map(((json.quoteResponse && json.quoteResponse.result) || []).map((q) => [q.symbol, q]));
}

// Last close on or before `ms`, or null if the series starts later (e.g. listed since then).
function closeAsOf(points, ms) {
  let close = null;
  for (const [t, c] of points) {
    if (t > ms) break;
    close = c;
  }
  return close;
}

function periodReturns(points, price) {
  const lastT = points[points.length - 1][0];
  const pct = (base) => (base ? (price / base - 1) * 100 : null);
  const yearStart = Date.UTC(new Date(lastT).getUTCFullYear(), 0, 1);
  // Yahoo's 1y range starts a few days short of 365 days back; allow a week of slack.
  const oneYearBase = points[0][0] <= lastT - 358 * DAY_MS ? points[0][1] : null;
  return {
    '1d': pct(points.length >= 2 ? points[points.length - 2][1] : null),
    '1m': pct(closeAsOf(points, lastT - 30 * DAY_MS)),
    '3m': pct(closeAsOf(points, lastT - 91 * DAY_MS)),
    ytd: pct(closeAsOf(points, yearStart - 1)),
    '1y': pct(oneYearBase),
  };
}

const round = (v, digits = 2) => (typeof v === 'number' && isFinite(v) ? Number(v.toFixed(digits)) : null);

async function buildBoard() {
  const listed = getCompanies().list.filter((c) => c.listings.length && !c.parent);
  const symbols = listed.map((c) => c.listings[0].symbol);

  const [charts, details] = await Promise.all([
    mapLimit(symbols, 6, (s) => fetchChart(s, '1y').catch((err) => ({ error: err.message }))),
    fetchQuoteDetails([...symbols, ...Object.values(FX_SYMBOLS)]).catch((err) => {
      console.warn(`[board] quote details unavailable: ${err.message}`);
      return new Map();
    }),
  ]);

  // Yahoo sometimes renames FX symbols in the response (KRW=X comes back as USDKRW=X), so match
  // currency quotes by their quote currency rather than by the symbol we asked for.
  const fx = { USD: 1 };
  for (const q of details.values()) {
    if (q.quoteType === 'CURRENCY' && q.currency && q.regularMarketPrice) fx[q.currency] = q.regularMarketPrice;
  }
  const needed = [...new Set(charts.filter((ch) => !ch.error).map((ch) => ch.meta.currency))].filter((ccy) => ccy && !fx[ccy] && FX_SYMBOLS[ccy]);
  await Promise.all(
    needed.map(async (ccy) => {
      try {
        const { meta } = await fetchChart(FX_SYMBOLS[ccy], '5d');
        if (meta.regularMarketPrice) fx[ccy] = meta.regularMarketPrice;
      } catch (err) {
        console.warn(`[board] fx ${ccy}: ${err.message}`);
      }
    })
  );

  const rows = [];
  const errors = [];
  listed.forEach((c, i) => {
    const listing = c.listings[0];
    const chart = charts[i];
    if (chart.error || !chart.points.length) {
      errors.push({ id: c.id, symbol: listing.symbol, error: chart.error || 'no data' });
      return;
    }
    const q = details.get(listing.symbol) || {};
    const currency = chart.meta.currency || q.currency || 'USD';
    const price = typeof chart.meta.regularMarketPrice === 'number' ? chart.meta.regularMarketPrice : chart.points[chart.points.length - 1][1];
    const marketCap = typeof q.marketCap === 'number' ? q.marketCap : null;
    rows.push({
      id: c.id,
      symbol: listing.symbol,
      ticker: listing.ticker,
      exchange: listing.exchange,
      currency,
      price,
      marketTime: chart.meta.regularMarketTime ? chart.meta.regularMarketTime * 1000 : null,
      marketCap,
      marketCapUsd: marketCap && fx[currency] ? Math.round(marketCap / fx[currency]) : null,
      pe: round(q.trailingPE, 1),
      forwardPe: round(q.forwardPE, 1),
      high52: chart.meta.fiftyTwoWeekHigh ?? q.fiftyTwoWeekHigh ?? null,
      low52: chart.meta.fiftyTwoWeekLow ?? q.fiftyTwoWeekLow ?? null,
      returns: Object.fromEntries(Object.entries(periodReturns(chart.points, price)).map(([k, v]) => [k, round(v)])),
      // [day number (UTC days since epoch), close] — compact enough to ship a year for every company.
      points: chart.points.map(([t, close]) => [Math.floor(t / DAY_MS), round(close, close < 10 ? 4 : 2)]),
    });
  });

  return { generatedAt: Date.now(), fx, hasMarketCap: rows.some((r) => r.marketCapUsd), rows, errors };
}

async function getBoard() {
  if (cache && Date.now() - cache.at < BOARD_TTL_MS) return cache.data;
  if (!inflight) {
    inflight = buildBoard()
      .then((data) => {
        cache = { at: Date.now(), data };
        return data;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

module.exports = { getBoard };
