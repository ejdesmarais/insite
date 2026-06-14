'use strict';

require('dotenv').config();
const OpenAI = require('openai');

let _client;

function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set. Copy .env.template to .env and fill in your key.');
  }
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      maxRetries: 0,
    });
  }
  return _client;
}

const MAX_RETRIES = parseInt(process.env.OPENAI_MAX_RETRIES || '6', 10);
const REQUEST_TIMEOUT_MS = parseInt(process.env.OPENAI_REQUEST_TIMEOUT_MS || '30000', 10);
const RETRY_ON = new Set([429, 500, 502, 503, 504]);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry(fn) {
  const initialDelay = 1000;
  const base = 2;
  const maxDelay = 60000;

  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (err) {
      const status = err.status ?? err.response?.status;

      if (!RETRY_ON.has(status) || attempt >= MAX_RETRIES) {
        throw err;
      }

      const jitter = Math.random();
      const delay = Math.min(initialDelay * Math.pow(base, attempt) * (1 + jitter), maxDelay);
      const delaySecs = (delay / 1000).toFixed(1);

      console.warn(`[ai] OpenAI ${status} - retry ${attempt + 1}/${MAX_RETRIES} in ${delaySecs}s`);
      await sleep(delay);
      attempt++;
    }
  }
}

async function createJsonChatCompletion({ model, messages }) {
  const response = await withRetry(() =>
    getClient().chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      messages,
    }, {
      timeout: REQUEST_TIMEOUT_MS,
    })
  );

  return response.choices?.[0]?.message?.content || '';
}

module.exports = { createJsonChatCompletion };
