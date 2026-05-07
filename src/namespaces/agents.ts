import type {
  AgentPatchRequest,
  AgentPlatformSettingsRequestModel,
  AgentSummaryResponseModel,
  AgentWorkflowRequestModel,
  BodyCreateAgentV1ConvaiAgentsCreatePost,
  ConversationalConfigApiModelInput,
  CreateAgentResponseModel,
  GetAgentResponseModel,
  GetAgentsPageResponseModel,
} from '../generated/types.gen.js';
import {
  type Page,
  type RequestOptions,
  type Requester,
  buildQuery,
  jsonInit,
  parseJson,
  parseOptionalJson,
  toPage,
} from './helpers.js';

export interface ListAgentsParams extends RequestOptions {
  limit?: number;
  cursor?: string;
  search?: string;
  archived?: boolean;
  sortDirection?: 'asc' | 'desc';
  sortBy?: string;
}

export interface CreateAgentParams extends RequestOptions {
  conversationConfig: ConversationalConfigApiModelInput;
  platformSettings?: AgentPlatformSettingsRequestModel | null;
  workflow?: AgentWorkflowRequestModel | null;
  name?: string | null;
  tags?: Array<string> | null;
  enableVersioning?: boolean;
}

export interface AgentsNamespace {
  /**
   * List agents in the workspace.
   *
   * @example
   * const agents = await client.agents.list({ limit: 20 });
   */
  list(params?: ListAgentsParams): Promise<Page<AgentSummaryResponseModel>>;
  /**
   * Fetch one agent by ID.
   *
   * @example
   * const agent = await client.agents.get('agt_123');
   */
  get(agentId: string, options?: RequestOptions): Promise<GetAgentResponseModel>;
  /**
   * Create an agent.
   *
   * @example
   * await client.agents.create({
   *   name: 'Support agent',
   *   conversationConfig: { language: 'hi' },
   * });
   */
  create(params: CreateAgentParams): Promise<CreateAgentResponseModel>;
  /**
   * Update an agent with the API patch shape.
   *
   * @example
   * await client.agents.update('agt_123', { name: 'Updated support agent' });
   */
  update(
    agentId: string,
    patch: AgentPatchRequest,
    options?: RequestOptions,
  ): Promise<GetAgentResponseModel>;
  /**
   * Delete an agent by ID.
   *
   * @example
   * await client.agents.delete('agt_123');
   */
  delete(agentId: string, options?: RequestOptions): Promise<void>;
}

export function createAgentsNamespace(request: Requester): AgentsNamespace {
  return {
    list: async (params = {}) => {
      const query = buildQuery({
        page_size: params.limit,
        cursor: params.cursor,
        search: params.search,
        archived: params.archived,
        sort_direction: params.sortDirection,
        sort_by: params.sortBy,
      });
      const body = await parseJson<GetAgentsPageResponseModel>(
        await request(`/v1/convai/agents${query}`, { signal: params.signal }),
      );
      return toPage(body.agents, body.next_cursor, body.has_more);
    },
    get: async (agentId, options = {}) =>
      parseJson<GetAgentResponseModel>(
        await request(`/v1/convai/agents/${encodeURIComponent(agentId)}`, {
          signal: options.signal,
        }),
      ),
    create: async ({
      conversationConfig,
      platformSettings,
      workflow,
      name,
      tags,
      enableVersioning,
      signal,
    }) => {
      const query = buildQuery({ enable_versioning: enableVersioning });
      const body: BodyCreateAgentV1ConvaiAgentsCreatePost = {
        conversation_config: conversationConfig,
        ...(platformSettings != null ? { platform_settings: platformSettings } : {}),
        ...(workflow != null ? { workflow } : {}),
        ...(name != null ? { name } : {}),
        ...(tags != null ? { tags } : {}),
      };
      return parseJson<CreateAgentResponseModel>(
        await request(`/v1/convai/agents/create${query}`, jsonInit('POST', body, { signal })),
      );
    },
    update: async (agentId, patch, options = {}) =>
      parseJson<GetAgentResponseModel>(
        await request(
          `/v1/convai/agents/${encodeURIComponent(agentId)}`,
          jsonInit('PATCH', patch, options),
        ),
      ),
    delete: async (agentId, options = {}) => {
      await parseOptionalJson<unknown>(
        await request(`/v1/convai/agents/${encodeURIComponent(agentId)}`, {
          method: 'DELETE',
          signal: options.signal,
        }),
      );
    },
  };
}
