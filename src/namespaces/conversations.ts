import type {
  ConversationSummaryResponseModel,
  GetConversationResponseModel,
  GetConversationsPageResponseModel,
} from '../generated/types.gen.js';
import {
  type Page,
  type RequestOptions,
  type Requester,
  buildQuery,
  parseJson,
  toPage,
} from './helpers.js';

export interface ListConversationsParams extends RequestOptions {
  limit?: number;
  cursor?: string;
  agentId?: string;
  callSuccessful?: boolean;
  excludeBatch?: boolean;
}

export interface ConversationsNamespace {
  /**
   * List conversations. Outbound calls are represented as conversations.
   *
   * @example
   * const conversations = await client.conversations.list({ agentId: 'agt_123' });
   */
  list(params?: ListConversationsParams): Promise<Page<ConversationSummaryResponseModel>>;
  /**
   * Fetch conversation details by conversation ID.
   *
   * @example
   * const conversation = await client.conversations.get(call.conversationId);
   */
  get(conversationId: string, options?: RequestOptions): Promise<GetConversationResponseModel>;
}

export function createConversationsNamespace(request: Requester): ConversationsNamespace {
  return {
    list: async (params = {}) => {
      const query = buildQuery({
        page_size: params.limit,
        cursor: params.cursor,
        agent_id: params.agentId,
        call_successful: params.callSuccessful,
        exclude_batch: params.excludeBatch,
      });
      const body = await parseJson<GetConversationsPageResponseModel>(
        await request(`/v1/voiceai/conversations${query}`, { signal: params.signal }),
      );
      return toPage(body.conversations, body.next_cursor, body.has_more);
    },
    get: async (conversationId, options = {}) =>
      parseJson<GetConversationResponseModel>(
        await request(`/v1/voiceai/conversations/${encodeURIComponent(conversationId)}`, {
          signal: options.signal,
        }),
      ),
  };
}
