// Approved data changes, stored apart from the hand-written companies.js, relations.js and
// models.js.
//
// public/data/overrides.js is generated: it carries the data as a JSON literal plus a few lines
// that patch window.AI_COMPANIES and append to window.AI_RELATIONS and window.AI_MODELS, so the
// browser and the server (which evaluates the data files in one sandbox, see companies.js) apply
// exactly the same changes. Pages must load it after the other data files.
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const OVERRIDES_FILE = path.join(__dirname, '..', 'public', 'data', 'overrides.js');
const SYMBOL_RE = /^[A-Za-z0-9.\-^=]{1,20}$/;
const SINCE_RE = /^\d{4}(-(0[1-9]|1[0-2]))?$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/;

const str = (v, max = 120) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Every field a patch may touch, with its validator. Anything else is rejected.
const FIELD_VALIDATORS = {
  leader: (v) => isObj(v) && str(v.name) && str(v.nameKo) && str(v.title, 40),
  note: (v) => v === null || str(v, 300),
  summary: (v) => str(v, 300),
  parent: (v) => v === null || str(v, 60),
  listings: (v) =>
    Array.isArray(v) && v.length <= 3 && v.every((l) => isObj(l) && str(l.exchange, 40) && str(l.ticker, 20) && SYMBOL_RE.test(l.symbol || '')),
  private: (v) =>
    v === null ||
    (isObj(v) &&
      (v.status === undefined || str(v.status, 200)) &&
      (v.investors === undefined || (Array.isArray(v.investors) && v.investors.length <= 10 && v.investors.every((s) => str(s, 60))))),
};

function validatePatch(patch) {
  if (!isObj(patch) || !Object.keys(patch).length) return '변경할 필드가 없어요.';
  for (const [key, value] of Object.entries(patch)) {
    if (!FIELD_VALIDATORS[key]) return `바꿀 수 없는 필드예요: ${key}`;
    if (!FIELD_VALIDATORS[key](value)) return `값이 올바르지 않아요: ${key}`;
  }
  return null;
}

// A relation as relations.js defines one; `companyIds` and `types` come from the live data.
function validateRelation(rel, { companyIds, types }) {
  if (!isObj(rel)) return '관계 정보가 없어요.';
  if (!rel.from || !rel.to) return '두 기업을 모두 골라 주세요.';
  if (!companyIds.has(rel.from) || !companyIds.has(rel.to)) return '목록에 있는 기업끼리만 관계를 추가할 수 있어요.';
  if (rel.from === rel.to) return '서로 다른 두 기업을 골라 주세요.';
  if (typeof rel.type !== 'string' || !Object.hasOwn(types, rel.type)) return '관계 종류가 올바르지 않아요.';
  if (!str(rel.label, 60)) return '한 줄 요약(label)을 적어 주세요. (60자 이내)';
  if (!str(rel.detail, 300)) return '설명(detail)을 적어 주세요. (300자 이내)';
  if (rel.since !== undefined && rel.since !== null && rel.since !== '' && !SINCE_RE.test(rel.since)) return '시기는 2025 또는 2025-10 형식으로 적어 주세요.';
  if (rel.source !== undefined && rel.source !== null && !isSource(rel.source)) return '출처는 https 주소여야 해요.';
  return null;
}

const relationKey = (r) => `${r.from}>${r.to}>${r.type}`;

// "GPT-5.5" and "gpt 5.5" are the same model; the generated file uses the same rule.
const modelKey = (m) => `${m.company}|${String(m.name).toLowerCase().replace(/[\s\-_·]/g, '')}`;

const isSource = (v) => isObj(v) && str(v.title, 300) && /^https:\/\//.test(v.url || '');

// A model as models.js defines one; `companyIds` and `kinds` come from the live data.
function validateModel(m, { companyIds, kinds }) {
  if (!isObj(m)) return '모델 정보가 없어요.';
  if (!m.company) return '기업을 골라 주세요.';
  if (!companyIds.has(m.company)) return '목록에 있는 기업의 모델만 추가할 수 있어요.';
  if (!str(m.name, 60)) return '모델 이름을 적어 주세요. (60자 이내)';
  if (typeof m.date !== 'string' || !DATE_RE.test(m.date)) return '날짜는 2026-10-07 또는 2026-10 형식으로 적어 주세요.';
  if (typeof m.kind !== 'string' || !Object.hasOwn(kinds, m.kind)) return '모델 종류가 올바르지 않아요.';
  if (!str(m.desc, 200)) return '한 줄 설명을 적어 주세요. (200자 이내)';
  if (m.source !== undefined && m.source !== null && !isSource(m.source)) return '출처는 https 주소여야 해요.';
  return null;
}

function readOverrides() {
  let data = null;
  try {
    const sandbox = { window: { AI_COMPANIES: [], AI_RELATIONS: [], AI_MODELS: [] } };
    vm.runInNewContext(fs.readFileSync(OVERRIDES_FILE, 'utf8'), sandbox, { filename: OVERRIDES_FILE });
    data = sandbox.window.AI_OVERRIDES;
  } catch {
    // missing or unreadable → empty
  }
  data = data || { updatedAt: null, companies: {} };
  data.relations = data.relations || [];
  data.models = data.models || [];
  return data;
}

function writeOverrides(data) {
  const js = `// 자동 생성 파일 — /admin.html(데이터 점검)에서 반영한 변경 사항입니다. 직접 고치지 마세요.
// companies.js의 기업 데이터 위에 필드 단위로 덮어쓰고, relations.js·models.js 목록 뒤에 추가한 관계·모델을 붙입니다.
// 되돌리면 손으로 쓴 원래 값으로 돌아갑니다. companies.js·relations.js·models.js 다음에 불러와야 합니다.
(function (data) {
  var byId = {};
  (window.AI_COMPANIES || []).forEach(function (c) { byId[c.id] = c; });
  Object.keys(data.companies).forEach(function (id) {
    if (byId[id]) Object.assign(byId[id], data.companies[id].patch);
  });
  var relations = window.AI_RELATIONS || [];
  var seen = {};
  relations.forEach(function (r) { seen[r.from + '>' + r.to + '>' + r.type] = true; });
  (data.relations || []).forEach(function (r) {
    if (!seen[r.from + '>' + r.to + '>' + r.type]) relations.push(r);
  });
  var models = window.AI_MODELS || [];
  var modelKey = function (m) { return m.company + '|' + String(m.name).toLowerCase().replace(/[\\s\\-_·]/g, ''); };
  var known = {};
  models.forEach(function (m) { known[modelKey(m)] = true; });
  (data.models || []).forEach(function (m) {
    if (!known[modelKey(m)]) models.push(m);
  });
  window.AI_OVERRIDES = data;
  window.AI_DATA_UPDATED_AT = data.updatedAt;
})(${JSON.stringify(data, null, 2)});
`;
  const tmp = `${OVERRIDES_FILE}.tmp`;
  fs.writeFileSync(tmp, js);
  fs.renameSync(tmp, OVERRIDES_FILE); // atomic: readers never see a half-written file
}

function touch(data) {
  data.updatedAt = Object.keys(data.companies).length || data.relations.length || data.models.length ? Date.now() : null;
}

// `original` is the company as companies.js defines it (before overrides), used to record
// what each change replaced.
function applyPatch(companyId, patch, { original, source, label }) {
  const error = validatePatch(patch);
  if (error) throw new Error(error);
  const data = readOverrides();
  const entry = data.companies[companyId] || { patch: {}, history: [] };
  const now = Date.now();
  const before = {};
  for (const key of Object.keys(patch)) before[key] = key in entry.patch ? entry.patch[key] : original[key] ?? null;
  entry.patch = { ...entry.patch, ...patch };
  entry.history.push({ at: now, source, label, fields: Object.keys(patch), before, after: patch });
  data.companies[companyId] = entry;
  touch(data);
  writeOverrides(data);
  return entry;
}

function revertCompany(companyId) {
  const data = readOverrides();
  if (!data.companies[companyId]) throw new Error('되돌릴 변경이 없어요.');
  delete data.companies[companyId];
  touch(data);
  writeOverrides(data);
}

// `existing` is every relation currently in effect (relations.js + already added ones).
function addRelation(rel, { companyIds, types, existing, source, label }) {
  const clean = {
    from: rel.from,
    to: rel.to,
    type: rel.type,
    label: String(rel.label || '').trim(),
    detail: String(rel.detail || '').trim(),
    ...(rel.since ? { since: String(rel.since).trim() } : {}),
    ...(rel.source ? { source: { title: String(rel.source.title).trim(), url: rel.source.url } } : {}),
  };
  const error = validateRelation(clean, { companyIds, types });
  if (error) throw new Error(error);
  const reverse = { ...clean, from: clean.to, to: clean.from };
  const dup = (r) => relationKey(r) === relationKey(clean) || (!types[clean.type].directed && relationKey(r) === relationKey(reverse));
  if (existing.some(dup)) throw new Error('같은 관계가 이미 있어요.');
  const data = readOverrides();
  const id = crypto.createHash('sha1').update(relationKey(clean)).digest('hex').slice(0, 10);
  data.relations.push({ ...clean, id, addedAt: Date.now(), origin: source, originLabel: label });
  touch(data);
  writeOverrides(data);
}

function removeRelation(id) {
  const data = readOverrides();
  const before = data.relations.length;
  data.relations = data.relations.filter((r) => r.id !== id);
  if (data.relations.length === before) throw new Error('지울 관계가 없어요.');
  touch(data);
  writeOverrides(data);
}

// `existing` is every model currently in effect (models.js + already added ones).
function addModel(model, { companyIds, kinds, existing, source, label }) {
  const clean = {
    company: model.company,
    name: String(model.name || '').trim(),
    date: String(model.date || '').trim(),
    kind: model.kind,
    ...(model.open ? { open: true } : {}),
    desc: String(model.desc || '').trim(),
    ...(model.source ? { source: { title: String(model.source.title).trim(), url: model.source.url } } : {}),
  };
  const error = validateModel(clean, { companyIds, kinds });
  if (error) throw new Error(error);
  if (existing.some((m) => modelKey(m) === modelKey(clean))) throw new Error('같은 모델이 이미 타임라인에 있어요.');
  const data = readOverrides();
  const id = crypto.createHash('sha1').update(modelKey(clean)).digest('hex').slice(0, 10);
  data.models.push({ ...clean, id, addedAt: Date.now(), origin: source, originLabel: label });
  touch(data);
  writeOverrides(data);
}

function removeModel(id) {
  const data = readOverrides();
  const before = data.models.length;
  data.models = data.models.filter((m) => m.id !== id);
  if (data.models.length === before) throw new Error('지울 모델이 없어요.');
  touch(data);
  writeOverrides(data);
}

function overridesMtime() {
  try {
    return fs.statSync(OVERRIDES_FILE).mtimeMs;
  } catch {
    return 0;
  }
}

module.exports = {
  OVERRIDES_FILE,
  readOverrides,
  writeOverrides,
  applyPatch,
  revertCompany,
  validatePatch,
  validateRelation,
  addRelation,
  removeRelation,
  relationKey,
  validateModel,
  addModel,
  removeModel,
  modelKey,
  overridesMtime,
};
