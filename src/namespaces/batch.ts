import type {
  BatchCallDetailedResponse,
  BatchCallResponse,
  BatchCallWhatsAppParams,
  OutboundCallRecipient,
  SubmitBatchCallRequest,
} from '../generated/types.gen.js';
import {
  type RequestOptions,
  type Requester,
  jsonInit,
  parseJson,
  parseOptionalJson,
} from './helpers.js';

export interface CreateBatchParams extends RequestOptions {
  callName: string;
  agentId: string;
  recipients: Array<OutboundCallRecipient>;
  scheduledTimeUnix?: number | null;
  agentPhoneNumberId?: string | null;
  whatsappParams?: BatchCallWhatsAppParams | null;
}

export interface BatchNamespace {
  /**
   * Create a batch calling job.
   *
   * @example
   * await client.batch.create({
   *   callName: 'Q2 followup',
   *   agentId: 'agt_123',
   *   recipients: [{ phone_number: '+919999999999' }],
   * });
   */
  create(params: CreateBatchParams): Promise<BatchCallResponse>;
  /**
   * Fetch a batch calling job by ID.
   *
   * @example
   * const batch = await client.batch.get('batch_123');
   */
  get(batchId: string, options?: RequestOptions): Promise<BatchCallDetailedResponse>;
  /**
   * Cancel a batch calling job.
   *
   * @example
   * await client.batch.cancel('batch_123');
   */
  cancel(batchId: string, options?: RequestOptions): Promise<BatchCallResponse>;
  /**
   * Delete a batch calling job.
   *
   * @example
   * await client.batch.delete('batch_123');
   */
  delete(batchId: string, options?: RequestOptions): Promise<void>;
}

export function createBatchNamespace(request: Requester): BatchNamespace {
  return {
    create: async ({
      callName,
      agentId,
      recipients,
      scheduledTimeUnix,
      agentPhoneNumberId,
      whatsappParams,
      signal,
    }) => {
      const body: SubmitBatchCallRequest = {
        call_name: callName,
        agent_id: agentId,
        recipients,
        ...(scheduledTimeUnix !== undefined ? { scheduled_time_unix: scheduledTimeUnix } : {}),
        ...(agentPhoneNumberId !== undefined ? { agent_phone_number_id: agentPhoneNumberId } : {}),
        ...(whatsappParams !== undefined ? { whatsapp_params: whatsappParams } : {}),
      };
      return parseJson<BatchCallResponse>(
        await request('/v1/voiceai/batch-calling/submit', jsonInit('POST', body, { signal })),
      );
    },
    get: async (batchId, options = {}) =>
      parseJson<BatchCallDetailedResponse>(
        await request(`/v1/voiceai/batch-calling/${encodeURIComponent(batchId)}`, {
          signal: options.signal,
        }),
      ),
    cancel: async (batchId, options = {}) =>
      parseJson<BatchCallResponse>(
        await request(
          `/v1/voiceai/batch-calling/${encodeURIComponent(batchId)}/cancel`,
          jsonInit('POST', undefined, options),
        ),
      ),
    delete: async (batchId, options = {}) => {
      await parseOptionalJson<unknown>(
        await request(`/v1/voiceai/batch-calling/${encodeURIComponent(batchId)}`, {
          method: 'DELETE',
          signal: options.signal,
        }),
      );
    },
  };
}
