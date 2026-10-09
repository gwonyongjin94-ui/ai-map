// Shared Claude API access for server features (briefing, data watch).
'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');
const Anthropic = require('@anthropic-ai/sdk');

const MODEL = process.env.BRIEFING_MODEL || 'claude-opus-5-5';
const ENV_FILE = path.join(__dirname, '..', '.env');

// Only a key written in this project's .env turns Claude features on. ANTHROPIC_* variables
// inherited from whatever launched the server (an IDE, a desktop app) belong to that tool,
// and every call spends money, so they're deliberately ignored. Read on every call, so
// adding .env takes effect without a restart.
function projectApiKey() {
  try {
    return util.parseEnv(fs.readFileSync(ENV_FILE, 'utf8')).ANTHROPIC_API_KEY || null;
  } catch {
    return null;
  }
}

function hasCredentials() {
  return Boolean(projectApiKey());
}

function createClient() {
  // Explicit settings so no inherited ANTHROPIC_AUTH_TOKEN / ANTHROPIC_BASE_URL / profile applies.
  return new Anthropic({
    apiKey: projectApiKey(),
    authToken: null,
    profile: null,
    baseURL: 'https://api.anthropic.com',
  });
}

function describeError(err) {
  if (err instanceof Anthropic.AuthenticationError) return 'API 키가 올바르지 않아요. .env의 ANTHROPIC_API_KEY를 확인해 주세요.';
  if (err instanceof Anthropic.PermissionDeniedError) return '이 API 키로는 모델을 사용할 수 없어요.';
  if (err instanceof Anthropic.RateLimitError) return 'API 사용량 한도에 걸렸어요. 잠시 후 다시 시도해요.';
  if (err instanceof Anthropic.APIError) return `Claude API 오류 (${err.status ?? '연결'}): ${err.message}`;
  return err.message;
}

// One structured-output request. `format` comes from betaZodOutputFormat(schema).
async function structuredRequest({ system, user, format, effort = 'medium' }) {
  const stream = createClient().beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    // Route a safety-classifier refusal to Anthropic's recommended fallback model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    output_config: { effort, format },
    messages: [{ role: 'user', content: user }],
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === 'refusal') throw new Error('Claude가 이번 요청을 거절했어요.');
  if (message.stop_reason === 'max_tokens') throw new Error('응답이 길이 제한에 걸려 잘렸어요.');
  if (!message.parsed_output) throw new Error('Claude 응답을 해석하지 못했어요.');
  return message;
}

module.exports = { MODEL, hasCredentials, describeError, structuredRequest };
