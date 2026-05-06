import type { VoiceListItem } from '../generated/types.gen.js';
import { type RequestOptions, type Requester, parseJson } from './helpers.js';

export interface VoicesNamespace {
  /**
   * List available voices.
   *
   * @example
   * const voices = await client.voices.list();
   */
  list(options?: RequestOptions): Promise<Array<VoiceListItem>>;
}

export function createVoicesNamespace(request: Requester): VoicesNamespace {
  return {
    list: async (options = {}) =>
      parseJson<Array<VoiceListItem>>(await request('/v1/voices', { signal: options.signal })),
  };
}
