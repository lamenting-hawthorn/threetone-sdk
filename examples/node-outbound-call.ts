/**
 * Run with: pnpm tsx examples/node-outbound-call.ts
 *
 * Requires THREETONE_API_KEY in env. Replace agent_id and to_number.
 */
import { ThreetoneClient } from '../src/index.js';

const client = new ThreetoneClient({
  apiKey:
    process.env.THREETONE_API_KEY ??
    (() => {
      throw new Error('Set THREETONE_API_KEY');
    })(),
});

const res = await client.request('/v1/voiceai/outbound-call', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    agent_id: process.env.THREETONE_AGENT_ID ?? 'agt_replace_me',
    to_number: process.env.THREETONE_TO_NUMBER ?? '+919999999999',
  }),
});
console.log(await res.json());
