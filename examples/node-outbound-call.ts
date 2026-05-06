/**
 * Run with: pnpm tsx examples/node-outbound-call.ts
 *
 * Requires THREETONE_API_KEY, THREETONE_AGENT_ID, THREETONE_PHONE_NUMBER_ID,
 * and THREETONE_TO_NUMBER in env.
 */
import { ThreetoneClient } from '../src/index.js';

const client = new ThreetoneClient({
  apiKey:
    process.env.THREETONE_API_KEY ??
    (() => {
      throw new Error('Set THREETONE_API_KEY');
    })(),
});

const call = await client.calls.outbound({
  agentId:
    process.env.THREETONE_AGENT_ID ??
    (() => {
      throw new Error('Set THREETONE_AGENT_ID');
    })(),
  phoneNumberId:
    process.env.THREETONE_PHONE_NUMBER_ID ??
    (() => {
      throw new Error('Set THREETONE_PHONE_NUMBER_ID');
    })(),
  toPhoneNumber:
    process.env.THREETONE_TO_NUMBER ??
    (() => {
      throw new Error('Set THREETONE_TO_NUMBER');
    })(),
});

console.log(call);
