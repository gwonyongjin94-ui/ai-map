'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { OVERRIDES_FILE, overridesMtime } = require('./overrides');

const DATA_DIR = path.join(__dirname, '..', 'public', 'data');
const COMPANIES_FILE = path.join(DATA_DIR, 'companies.js');
const RELATIONS_FILE = path.join(DATA_DIR, 'relations.js');
const MODELS_FILE = path.join(DATA_DIR, 'models.js');
const DATACENTERS_FILE = path.join(DATA_DIR, 'datacenters.js');
const POWER_FILE = path.join(DATA_DIR, 'power.js');

let cache = { version: '' };

function evaluate(files) {
  const sandbox = { window: {} };
  for (const file of files) {
    if (fs.existsSync(file)) vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
  }
  return sandbox.window;
}

function mtime(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

// The browser data files assign to `window`; evaluate them in a sandbox so the server shares
// one source of truth — companies.js, relations.js, models.js, datacenters.js, power.js, then the
// approved overrides on top, exactly like the page loads them. Reloaded whenever any of them
// changes; `version` lets callers drop anything derived from the old data. `original` is companies.js alone (what a revert restores).
function getCompanies() {
  const version = [COMPANIES_FILE, RELATIONS_FILE, MODELS_FILE, DATACENTERS_FILE, POWER_FILE].map(mtime).concat(overridesMtime()).join(':');
  if (version !== cache.version) {
    const merged = evaluate([COMPANIES_FILE, RELATIONS_FILE, MODELS_FILE, DATACENTERS_FILE, POWER_FILE, OVERRIDES_FILE]);
    const original = evaluate([COMPANIES_FILE]);
    cache = {
      version,
      list: merged.AI_COMPANIES,
      byId: new Map(merged.AI_COMPANIES.map((c) => [c.id, c])),
      original: new Map(original.AI_COMPANIES.map((c) => [c.id, c])),
      verified: merged.AI_DATA_VERIFIED || null,
      relations: merged.AI_RELATIONS || [],
      relationTypes: merged.AI_RELATION_TYPES || {},
      models: merged.AI_MODELS || [],
      modelKinds: merged.AI_MODEL_KINDS || {},
      datacenters: merged.AI_DATACENTERS || [],
      powerPlants: merged.AI_POWER_PLANTS || [],
      powerCompanies: merged.AI_POWER_COMPANIES || [],
    };
  }
  return cache;
}

module.exports = { getCompanies };
