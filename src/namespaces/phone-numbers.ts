import type { PhoneNumberInventoryResponse } from '../generated/types.gen.js';
import { type RequestOptions, type Requester, parseJson } from './helpers.js';

export interface PhoneNumbersNamespace {
  /**
   * Fetch the phone-number pricing inventory.
   *
   * This is not a list of provisioned numbers. Use the dashboard to find the
   * `phoneNumberId` required by `client.calls.outbound()`.
   *
   * @example
   * const inventory = await client.phoneNumbers.inventory();
   */
  inventory(options?: RequestOptions): Promise<PhoneNumberInventoryResponse>;
}

export function createPhoneNumbersNamespace(request: Requester): PhoneNumbersNamespace {
  return {
    inventory: async (options = {}) =>
      parseJson<PhoneNumberInventoryResponse>(
        await request('/v1/phone-numbers/inventory', { signal: options.signal }),
      ),
  };
}
