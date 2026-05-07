/**
 * Local demo — no real API key needed.
 *
 * Run with: pnpm tsx examples/local-demo.ts
 *
 * Uses a mock fetch that echoes the request and returns canned JSON so you can
 * see exactly what each namespace method sends and receives.
 */
import { ThreetoneCallError, ThreetoneClient } from '../src/index.js';

// Intercepts fetch calls, prints the request, and returns a canned response.
function makeMockFetch(responsesByPath: Record<string, unknown>) {
  return async (url: string, init?: RequestInit): Promise<Response> => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = new URL(url).pathname;
    const body = init?.body
      ? init.body instanceof FormData
        ? '[FormData]'
        : JSON.parse(String(init.body))
      : undefined;

    console.log(`\n  --> ${method} ${path}`);
    if (body) console.log('      body:', JSON.stringify(body, null, 6).replace(/\n/g, '\n      '));

    const responseBody = responsesByPath[path] ?? responsesByPath['*'];
    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-request-id': 'req_demo' },
    });
  };
}

const mockFetch = makeMockFetch({
  '/v1/voiceai/outbound-call': {
    success: true,
    conversation_id: 'conv_demo_abc',
    message: 'Call initiated',
    call_sid: 'sid_demo_xyz',
  },
  '/v1/voiceai/conversations': {
    conversations: [
      {
        agent_id: 'agt_demo',
        conversation_id: 'conv_demo_abc',
        start_time_unix_secs: 1746519000,
        call_duration_secs: 47,
        message_count: 8,
        status: 'done',
        call_successful: 'success',
      },
    ],
    has_more: false,
  },
  '/v1/convai/agents': {
    agents: [
      {
        agent_id: 'agt_demo',
        name: 'Support Agent',
        created_at_unix_secs: 1746519000,
        access_info: { is_creator: true },
      },
    ],
    next_cursor: null,
    has_more: false,
  },
  '/v1/convai/agents/create': { agent_id: 'agt_new_123' },
  '/v1/voiceai/batch-calling/submit': {
    id: 'batch_demo_456',
    name: 'Q2 followup',
    agent_id: 'agt_demo',
    status: 'pending',
    created_at_unix: 1746519000,
    scheduled_time_unix: 1746605400,
    last_updated_at_unix: 1746519000,
    agent_name: 'Support Agent',
  },
  '/v1/voiceai/knowledge-base': {
    documents: [
      { id: 'doc_demo_789', name: 'Product FAQ', type: 'text', metadata: {}, access_info: {} },
    ],
    next_cursor: null,
    has_more: false,
  },
  '/v1/voices': [
    { voice_id: 'v_asha', name: 'Asha', accent: 'hi-IN', sample_storage_path: 'samples/asha.mp3' },
    {
      voice_id: 'v_aryan',
      name: 'Aryan',
      accent: 'hi-IN',
      sample_storage_path: 'samples/aryan.mp3',
    },
  ],
  '/v1/phone-numbers/inventory': {
    countries: [
      {
        country: 'India',
        country_code: 'IN',
        phone_numbers: [{ number: '+91...', price: '2.00', currency: 'USD' }],
      },
    ],
    currency: 'USD',
  },
  '*': { success: true },
});

const client = new ThreetoneClient({ apiKey: 'demo_key_not_real', fetch: mockFetch });

function section(title: string) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(60));
}

// --- calls.outbound ---
section('client.calls.outbound()');
const call = await client.calls.outbound({
  agentId: 'agt_demo',
  phoneNumberId: 'pn_demo',
  toPhoneNumber: '+919999999999',
  dynamicVariables: { customer_name: 'Raghav', language: 'hi' },
});
console.log('  response:', call);

// --- Error demo: success:false ---
section('client.calls.outbound() — success:false throws ThreetoneCallError');
const failFetch = makeMockFetch({
  '/v1/voiceai/outbound-call': { success: false, conversation_id: '', message: 'Number busy' },
});
const failClient = new ThreetoneClient({ apiKey: 'demo_key', fetch: failFetch });
try {
  await failClient.calls.outbound({
    agentId: 'agt_demo',
    phoneNumberId: 'pn_demo',
    toPhoneNumber: '+919999999999',
  });
} catch (err) {
  if (err instanceof ThreetoneCallError) {
    console.log('  caught ThreetoneCallError:', err.message);
    console.log('  err.body:', err.body);
  }
}

// --- conversations.list ---
section('client.conversations.list()');
const convs = await client.conversations.list({ agentId: 'agt_demo', limit: 10 });
console.log('  hasMore:', convs.hasMore, '| count:', convs.data.length);
console.log('  first:', convs.data[0]);

// --- agents.list + agents.create ---
section('client.agents.list() + agents.create()');
const agents = await client.agents.list({ limit: 5, search: 'Support' });
console.log('  agents page:', { hasMore: agents.hasMore, count: agents.data.length });
const newAgent = await client.agents.create({
  name: 'Demo Agent',
  conversationConfig: { language: 'hi' },
});
console.log('  created agent_id:', (newAgent as { agent_id: string }).agent_id);

// --- batch.create ---
section('client.batch.create()');
const batch = await client.batch.create({
  callName: 'Q2 followup',
  agentId: 'agt_demo',
  agentPhoneNumberId: 'pn_demo',
  recipients: [{ phone_number: '+919999999901' }, { phone_number: '+919999999902' }],
  scheduledTimeUnix: Math.floor(Date.now() / 1000) + 86400,
});
console.log('  batch:', { id: batch.id, name: batch.name, status: batch.status });

// --- knowledgeBase.list + addText ---
section('client.knowledgeBase.list() + addText()');
const docs = await client.knowledgeBase.list({ limit: 20 });
console.log(
  '  docs:',
  docs.data.map((d) => d.name),
);
await client.knowledgeBase.addText({
  text: 'Our refund policy is 30 days.',
  name: 'refund-policy.txt',
});

// --- voices.list ---
section('client.voices.list()');
const voices = await client.voices.list();
console.log(
  '  voices:',
  voices.map((v) => `${v.name} (${v.accent})`),
);

// --- phoneNumbers.inventory ---
section('client.phoneNumbers.inventory()');
const inventory = await client.phoneNumbers.inventory();
console.log('  currency:', inventory.currency, '| countries:', inventory.countries.length);

console.log(`\n${'─'.repeat(60)}`);
console.log('  All demos complete.');
console.log('─'.repeat(60));
