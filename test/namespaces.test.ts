import { describe, expect, it, vi } from 'vitest';
import {
  ThreetoneCallError,
  ThreetoneClient,
  ThreetoneError,
  ThreetoneNotFoundError,
  ThreetoneRateLimitError,
  ThreetoneValidationError,
} from '../src/index.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'x-request-id': 'req_test' },
  });
}

function emptyResponse(status = 204): Response {
  return new Response(null, { status });
}

function bodyJson(init: RequestInit): unknown {
  return JSON.parse(String(init.body));
}

describe('namespace helpers', () => {
  it('maps calls.outbound params and camelizes the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        success: true,
        conversation_id: 'conv_123',
        message: 'started',
        call_sid: 'sid_123',
      }),
    );
    const client = new ThreetoneClient({ apiKey: 'k', fetch: fetchMock });

    await expect(
      client.calls.outbound({
        agentId: 'agt_123',
        phoneNumberId: 'pn_123',
        toPhoneNumber: '+919999999999',
        dynamicVariables: { name: 'Raghav' },
      }),
    ).resolves.toEqual({
      success: true,
      conversationId: 'conv_123',
      message: 'started',
      callSid: 'sid_123',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.threetone.in/v1/voiceai/outbound-call',
      expect.objectContaining({ method: 'POST' }),
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(bodyJson(init)).toEqual({
      agent_id: 'agt_123',
      phone_number_id: 'pn_123',
      to_phone_number: '+919999999999',
      dynamic_variables: { name: 'Raghav' },
    });
  });

  it('throws ThreetoneCallError when outbound returns success false', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { success: false, conversation_id: '', message: 'busy' }),
      );
    const client = new ThreetoneClient({ apiKey: 'k', fetch: fetchMock });

    await expect(
      client.calls.outbound({
        agentId: 'agt_123',
        phoneNumberId: 'pn_123',
        toPhoneNumber: '+919999999999',
      }),
    ).rejects.toBeInstanceOf(ThreetoneCallError);
  });

  it('normalizes agent pagination and maps create body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          agents: [
            { agent_id: 'agt_123', name: 'Support', created_at_unix_secs: 1, access_info: {} },
          ],
          next_cursor: 'next',
          has_more: true,
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { agent_id: 'agt_new' }));
    const client = new ThreetoneClient({ apiKey: 'k', fetch: fetchMock });

    await expect(client.agents.list({ limit: 10, cursor: 'cur', search: 'sup' })).resolves.toEqual({
      data: [{ agent_id: 'agt_123', name: 'Support', created_at_unix_secs: 1, access_info: {} }],
      nextCursor: 'next',
      hasMore: true,
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.threetone.in/v1/convai/agents?page_size=10&cursor=cur&search=sup',
    );

    await client.agents.create({
      name: 'Support',
      conversationConfig: { language: 'hi' },
      enableVersioning: true,
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://api.threetone.in/v1/convai/agents/create?enable_versioning=true',
    );
    expect(bodyJson(fetchMock.mock.calls[1]?.[1] as RequestInit)).toEqual({
      conversation_config: { language: 'hi' },
      name: 'Support',
    });
  });

  it('maps conversations list filters and get path', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          conversations: [
            {
              agent_id: 'agt_123',
              conversation_id: 'conv_123',
              start_time_unix_secs: 1,
              call_duration_secs: 10,
              message_count: 2,
              status: 'done',
              call_successful: 'success',
            },
          ],
          has_more: false,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          agent_id: 'agt_123',
          conversation_id: 'conv_123',
          status: 'done',
          transcript: [],
          metadata: {},
          has_audio: false,
          has_user_audio: false,
          has_response_audio: false,
        }),
      );
    const client = new ThreetoneClient({ apiKey: 'k', fetch: fetchMock });

    await expect(
      client.conversations.list({ agentId: 'agt_123', limit: 5 }),
    ).resolves.toMatchObject({
      hasMore: false,
      data: [{ conversation_id: 'conv_123' }],
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.threetone.in/v1/voiceai/conversations?page_size=5&agent_id=agt_123',
    );
    await client.conversations.get('conv_123');
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://api.threetone.in/v1/voiceai/conversations/conv_123',
    );
  });

  it('maps batch create/get/cancel/delete', async () => {
    const batch = {
      id: 'batch_123',
      name: 'Q2 followup',
      agent_id: 'agt_123',
      created_at_unix: 1,
      scheduled_time_unix: 2,
      last_updated_at_unix: 3,
      status: 'pending',
      agent_name: 'Support',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, batch))
      .mockResolvedValueOnce(jsonResponse(200, { ...batch, recipients: [] }))
      .mockResolvedValueOnce(jsonResponse(200, { ...batch, status: 'cancelled' }))
      .mockResolvedValueOnce(emptyResponse());
    const client = new ThreetoneClient({ apiKey: 'k', fetch: fetchMock });

    await client.batch.create({
      callName: 'Q2 followup',
      agentId: 'agt_123',
      recipients: [{ phone_number: '+919999999999' }],
      agentPhoneNumberId: 'pn_123',
    });
    expect(bodyJson(fetchMock.mock.calls[0]?.[1] as RequestInit)).toEqual({
      call_name: 'Q2 followup',
      agent_id: 'agt_123',
      recipients: [{ phone_number: '+919999999999' }],
      agent_phone_number_id: 'pn_123',
    });

    await client.batch.get('batch_123');
    await client.batch.cancel('batch_123');
    await client.batch.delete('batch_123');
    expect(fetchMock.mock.calls.map((call) => [call[0], (call[1] as RequestInit).method])).toEqual([
      ['https://api.threetone.in/v1/voiceai/batch-calling/submit', 'POST'],
      ['https://api.threetone.in/v1/voiceai/batch-calling/batch_123', 'GET'],
      ['https://api.threetone.in/v1/voiceai/batch-calling/batch_123/cancel', 'POST'],
      ['https://api.threetone.in/v1/voiceai/batch-calling/batch_123', 'DELETE'],
    ]);
  });

  it('normalizes knowledge-base pagination and supports document add methods', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          documents: [{ id: 'doc_123', name: 'Docs', metadata: {}, access_info: {}, type: 'text' }],
          next_cursor: 'next',
          has_more: true,
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { id: 'doc_url', name: 'Docs' }))
      .mockResolvedValueOnce(jsonResponse(200, { id: 'doc_text', name: 'FAQ' }))
      .mockResolvedValueOnce(jsonResponse(200, { id: 'doc_file', name: 'manual.pdf' }));
    const client = new ThreetoneClient({ apiKey: 'k', fetch: fetchMock });

    await expect(client.knowledgeBase.list({ limit: 10, cursor: 'cur' })).resolves.toMatchObject({
      data: [{ id: 'doc_123' }],
      nextCursor: 'next',
      hasMore: true,
    });
    await client.knowledgeBase.addUrl({ url: 'https://docs.example.com', name: 'Docs' });
    await client.knowledgeBase.addText({ text: 'FAQ', name: 'FAQ' });
    await client.knowledgeBase.addFile({ file: new Blob(['pdf']), name: 'manual.pdf' });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.threetone.in/v1/voiceai/knowledge-base?page_size=10&cursor=cur',
    );
    expect(bodyJson(fetchMock.mock.calls[1]?.[1] as RequestInit)).toEqual({
      url: 'https://docs.example.com',
      name: 'Docs',
    });
    expect(bodyJson(fetchMock.mock.calls[2]?.[1] as RequestInit)).toEqual({
      text: 'FAQ',
      name: 'FAQ',
    });
    const fileInit = fetchMock.mock.calls[3]?.[1] as RequestInit;
    expect(fetchMock.mock.calls[3]?.[0]).toBe(
      'https://api.threetone.in/v1/voiceai/knowledge-base/file?name=manual.pdf',
    );
    expect(fileInit.body).toBeInstanceOf(FormData);
  });

  it('maps voices and phone-number inventory', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, [
          { voice_id: 'v_123', name: 'Asha', accent: 'hi', sample_storage_path: 'sample' },
        ]),
      )
      .mockResolvedValueOnce(jsonResponse(200, { countries: [], currency: 'USD' }));
    const client = new ThreetoneClient({ apiKey: 'k', fetch: fetchMock });

    await expect(client.voices.list()).resolves.toEqual([
      { voice_id: 'v_123', name: 'Asha', accent: 'hi', sample_storage_path: 'sample' },
    ]);
    await expect(client.phoneNumbers.inventory()).resolves.toEqual({
      countries: [],
      currency: 'USD',
    });
  });

  it('surfaces 404 from agents.get as ThreetoneNotFoundError with requestId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Agent not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json', 'x-request-id': 'req_404' },
      }),
    );
    const client = new ThreetoneClient({
      apiKey: 'k',
      fetch: fetchMock,
      retry: { maxRetries: 0 },
    });

    await expect(client.agents.get('agt_missing')).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof ThreetoneNotFoundError &&
        err.status === 404 &&
        err.requestId === 'req_404' &&
        err.message === 'Agent not found'
      );
    });
  });

  it('surfaces 422 from agents.create as ThreetoneValidationError with detail message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: 'conversation_config is required' }), {
        status: 422,
        headers: { 'content-type': 'application/json', 'x-request-id': 'req_422' },
      }),
    );
    const client = new ThreetoneClient({
      apiKey: 'k',
      fetch: fetchMock,
      retry: { maxRetries: 0 },
    });

    await expect(
      // biome-ignore lint/suspicious/noExplicitAny: deliberately invalid input for the test
      client.agents.create({ conversationConfig: undefined as any }),
    ).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof ThreetoneValidationError &&
        err.status === 422 &&
        err.message === 'conversation_config is required'
      );
    });
  });

  it('surfaces 429 from conversations.list as ThreetoneRateLimitError with retryAfterMs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: 'slow down' }), {
        status: 429,
        headers: {
          'content-type': 'application/json',
          'retry-after': '2',
          'x-request-id': 'req_429',
        },
      }),
    );
    const client = new ThreetoneClient({
      apiKey: 'k',
      fetch: fetchMock,
      retry: { maxRetries: 0 },
    });

    await expect(client.conversations.list()).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof ThreetoneRateLimitError && err.status === 429 && err.retryAfterMs === 2000
      );
    });
  });

  it('agents.delete tolerates an empty 204 response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(emptyResponse());
    const client = new ThreetoneClient({ apiKey: 'k', fetch: fetchMock });

    await expect(client.agents.delete('agt_123')).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.threetone.in/v1/convai/agents/agt_123');
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe('DELETE');
  });

  it('wraps malformed JSON 2xx bodies in ThreetoneError instead of SyntaxError', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('<html>oops</html>', {
        status: 200,
        headers: { 'content-type': 'text/html', 'x-request-id': 'req_html' },
      }),
    );
    const client = new ThreetoneClient({ apiKey: 'k', fetch: fetchMock });

    await expect(client.agents.get('agt_123')).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof ThreetoneError &&
        err.message === 'Invalid JSON in response' &&
        err.status === 200 &&
        err.requestId === 'req_html' &&
        err.body === '<html>oops</html>'
      );
    });
  });
});
