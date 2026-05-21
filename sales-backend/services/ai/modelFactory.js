const REQUIRED_ENV_KEYS = [
  'OPENROUTER_API_KEY',
  'OPENROUTER_BASE_URL',
  'OPENROUTER_MODEL',
];

let chatOpenAIImportPromise;

function getAiConfigStatus() {
  const missing = REQUIRED_ENV_KEYS.filter((key) => !String(process.env[key] || '').trim());
  return {
    ok: missing.length === 0,
    missing,
  };
}

function assertAiEnv() {
  const status = getAiConfigStatus();
  if (!status.ok) {
    throw new Error(`AI configuration missing: ${status.missing.join(', ')}`);
  }
}

async function getChatOpenAIClass() {
  if (!chatOpenAIImportPromise) {
    chatOpenAIImportPromise = import('@langchain/openai');
  }

  const mod = await chatOpenAIImportPromise;
  return mod.ChatOpenAI;
}

async function createBaseModel() {
  assertAiEnv();
  const ChatOpenAI = await getChatOpenAIClass();
  const options = arguments[0] || {};

  return new ChatOpenAI({
    model: process.env.OPENROUTER_MODEL,
    apiKey: process.env.OPENROUTER_API_KEY,
    temperature: options.temperature ?? 0.1,
    timeout: options.timeout ?? 60000,
    maxTokens: options.maxTokens ?? 2200,
    streamUsage: false,
    configuration: {
      baseURL: process.env.OPENROUTER_BASE_URL,
      defaultHeaders: {
        'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:4200',
        'X-OpenRouter-Title': 'DealVoice AI Brief',
      },
    },
  });
}

async function createStructuredModel(schema, options = {}) {
  const model = await createBaseModel(options);
  return model.withStructuredOutput(schema, {
    name: options.name || 'DealVoiceStructuredOutput',
    method: options.method || 'functionCalling',
  });
}

module.exports = {
  assertAiEnv,
  createBaseModel,
  createStructuredModel,
  getAiConfigStatus,
};
