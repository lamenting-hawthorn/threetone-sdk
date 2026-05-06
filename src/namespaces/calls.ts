import { ThreetoneCallError } from '../errors.js';
import type { OutboundCallResponse } from '../generated/types.gen.js';
import { type RequestOptions, type Requester, jsonInit, parseJson } from './helpers.js';

export interface OutboundCallParams extends RequestOptions {
  /** Agent ID to use for the call. */
  agentId: string;
  /** Phone number ID copied from the Threetone dashboard. */
  phoneNumberId: string;
  /** Destination phone number in E.164 format. */
  toPhoneNumber: string;
  /** Dynamic variables made available to the agent during the call. */
  dynamicVariables?: Record<string, unknown>;
}

export interface OutboundCall {
  success: true;
  conversationId: string;
  message?: string;
  callSid?: string | null;
}

export interface CallsNamespace {
  /**
   * Initiate an outbound call.
   *
   * @example
   * const call = await client.calls.outbound({
   *   agentId: 'agt_123',
   *   phoneNumberId: 'pn_123',
   *   toPhoneNumber: '+919999999999',
   * });
   */
  outbound(params: OutboundCallParams): Promise<OutboundCall>;
}

export function createCallsNamespace(request: Requester): CallsNamespace {
  return {
    outbound: async ({ agentId, phoneNumberId, toPhoneNumber, dynamicVariables, signal }) => {
      const response = await request(
        '/v1/voiceai/outbound-call',
        jsonInit(
          'POST',
          {
            agent_id: agentId,
            phone_number_id: phoneNumberId,
            to_phone_number: toPhoneNumber,
            ...(dynamicVariables ? { dynamic_variables: dynamicVariables } : {}),
          },
          { signal },
        ),
      );
      const body = await parseJson<OutboundCallResponse>(response);
      if (!body.success) {
        throw new ThreetoneCallError(body.message ?? 'Call initiation failed', {
          status: response.status,
          requestId: response.headers.get('x-request-id') ?? undefined,
          body,
        });
      }
      return {
        success: true,
        conversationId: body.conversation_id,
        ...(body.message ? { message: body.message } : {}),
        ...(body.call_sid !== undefined ? { callSid: body.call_sid } : {}),
      };
    },
  };
}
