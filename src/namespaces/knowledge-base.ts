import type {
  AddKnowledgeBaseResponseModel,
  CreateTextDocumentRequest,
  CreateUrlDocumentRequest,
  GetKnowledgeBaseDocumentResponse,
  GetKnowledgeBaseListResponseModel,
} from '../generated/types.gen.js';
import {
  type Page,
  type RequestOptions,
  type Requester,
  buildQuery,
  jsonInit,
  parseJson,
  toPage,
} from './helpers.js';

export type KnowledgeBaseDocument = GetKnowledgeBaseListResponseModel['documents'][number];

export interface ListKnowledgeBaseParams extends RequestOptions {
  limit?: number;
  cursor?: string;
  search?: string;
  showOnlyOwnedDocuments?: boolean;
  parentFolderId?: string;
  ancestorFolderId?: string;
  foldersFirst?: boolean;
  sortDirection?: 'asc' | 'desc';
  sortBy?: string;
  types?: Array<string>;
}

export interface AddFileDocumentParams extends RequestOptions {
  file: Blob;
  name?: string;
  parentFolderId?: string;
}

export interface KnowledgeBaseNamespace {
  /**
   * List workspace knowledge-base documents.
   *
   * @example
   * const docs = await client.knowledgeBase.list({ limit: 20 });
   */
  list(params?: ListKnowledgeBaseParams): Promise<Page<KnowledgeBaseDocument>>;
  /**
   * Fetch a knowledge-base document by document ID.
   *
   * @example
   * const doc = await client.knowledgeBase.get('doc_123');
   */
  get(documentId: string, options?: RequestOptions): Promise<GetKnowledgeBaseDocumentResponse>;
  /**
   * Add a URL document.
   *
   * @example
   * await client.knowledgeBase.addUrl({ url: 'https://docs.example.com' });
   */
  addUrl(params: CreateUrlDocumentRequest & RequestOptions): Promise<AddKnowledgeBaseResponseModel>;
  /**
   * Add a text document.
   *
   * @example
   * await client.knowledgeBase.addText({ text: 'FAQ content', name: 'faq.txt' });
   */
  addText(
    params: CreateTextDocumentRequest & RequestOptions,
  ): Promise<AddKnowledgeBaseResponseModel>;
  /**
   * Add a file document using multipart/form-data.
   *
   * @example
   * await client.knowledgeBase.addFile({ file, name: 'manual.pdf' });
   */
  addFile(params: AddFileDocumentParams): Promise<AddKnowledgeBaseResponseModel>;
}

export function createKnowledgeBaseNamespace(request: Requester): KnowledgeBaseNamespace {
  return {
    list: async (params = {}) => {
      const query = buildQuery({
        page_size: params.limit,
        cursor: params.cursor,
        search: params.search,
        show_only_owned_documents: params.showOnlyOwnedDocuments,
        parent_folder_id: params.parentFolderId,
        ancestor_folder_id: params.ancestorFolderId,
        folders_first: params.foldersFirst,
        sort_direction: params.sortDirection,
        sort_by: params.sortBy,
        types: params.types,
      });
      const body = await parseJson<GetKnowledgeBaseListResponseModel>(
        await request(`/v1/voiceai/knowledge-base${query}`, { signal: params.signal }),
      );
      return toPage(body.documents, body.next_cursor, body.has_more);
    },
    get: async (documentId, options = {}) =>
      parseJson<GetKnowledgeBaseDocumentResponse>(
        await request(`/v1/voiceai/knowledge-base/${encodeURIComponent(documentId)}`, {
          signal: options.signal,
        }),
      ),
    addUrl: async ({ signal, ...body }) =>
      parseJson<AddKnowledgeBaseResponseModel>(
        await request('/v1/voiceai/knowledge-base/url', jsonInit('POST', body, { signal })),
      ),
    addText: async ({ signal, ...body }) =>
      parseJson<AddKnowledgeBaseResponseModel>(
        await request('/v1/voiceai/knowledge-base/text', jsonInit('POST', body, { signal })),
      ),
    addFile: async ({ file, name, parentFolderId, signal }) => {
      const form = new FormData();
      form.set('file', file);
      const query = buildQuery({ name, parent_folder_id: parentFolderId });
      return parseJson<AddKnowledgeBaseResponseModel>(
        await request(`/v1/voiceai/knowledge-base/file${query}`, {
          method: 'POST',
          body: form,
          signal,
        }),
      );
    },
  };
}
