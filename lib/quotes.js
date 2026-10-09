// Delayed stock quotes from Yahoo Finance's (unofficial) chart API.
'use strict';

const { fetchJSON, mapLimit } = require('./http');

const QUOTE_TTL_MS = 60 * 1000;
const MAX_SYMBOLS = 80;
const FETCH_CONCURRENCY = 6;
const SYMBOL_RE = /^[A-Za-z0-9.\-^=]{1,20}$/;
const YAHOO_HOSTS = ['query2.finance.yahoo.com', 'query1.finance.yahoo.com'];

// symbol -> { at, data }
const quoteCache = new Map();

// Daily bars for `range` ("1mo", "1y", …): { meta, points: [[ms, close], …] } oldest first.
async function fetchChart(symbol, range) {
  let json;
  let lastErr;
  for (const host of YAHOO_HOSTS) {
    try {
      json = await fetchJSON(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`);
      break;
    } catch (err) {
      lastErr = err;
    }
  }
  if (!json) throw lastErr;

  const result = json && json.chart && json.chart.result && json.chart.result[0];
  if (!result) {
    const reason = json && json.chart && json.chart.error && json.chart.error.description;
    throw new Error(reason || 'no data');
  }

  const timestamps = result.timestamp || [];
  const rawCloses = (result.indicators && result.indicators.quote && result.indicators.quote[0].close) || [];
  const points = [];
  timestamps.forEach((t, i) => {
    if (typeof rawCloses[i] === 'number') points.push([t * 1000, rawCloses[i]]);
  });
  return { meta: result.meta || {}, points };
}

async function fetchQuote(symbol) {
  const cached = quoteCache.get(symbol);
  if (cached && Date.now() - cached.at < QUOTE_TTL_MS) return cached.data;

  const { meta, points } = await fetchChart(symbol, '1mo');
  const closes = points.map(([, close]) => close);
  const price = typeof meta.regularMarketPrice === 'number' ? meta.regularMarketPrice : closes[closes.length - 1];
  // The last daily bar is the latest session, so the bar before it is the previous close.
  const prevClose = closes.length >= 2 ? closes[closes.length - 2] : meta.chartPreviousClose;

  const data = {
    symbol,
    price,
    prevClose,
    change: price - prevClose,
    changePct: prevClose ? ((price - prevClose) / prevClose) * 100 : null,
    currency: meta.currency || null,
    exchange: meta.fullExchangeName || meta.exchangeName || null,
    marketTime: meta.regularMarketTime ? meta.regularMarketTime * 1000 : null,
    closes: closes.map((v) => Math.round(v * 100) / 100),
  };
  quoteCache.set(symbol, { at: Date.now(), data });
  return data;
}

async function getQuotes(rawSymbols) {
  const symbols = [...new Set(rawSymbols.map((s) => s.trim()))].filter((s) => SYMBOL_RE.test(s)).slice(0, MAX_SYMBOLS);
  const results = await mapLimit(symbols, FETCH_CONCURRENCY, async (symbol) => {
    try {
      return [symbol, await fetchQuote(symbol)];
    } catch (err) {
      return [symbol, { symbol, error: err.message }];
    }
  });
  return Object.fromEntries(results);
}

module.exports = { getQuotes, fetchChart };
