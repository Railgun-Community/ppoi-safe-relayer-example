import axios, { AxiosInstance } from 'axios';
import debug from 'debug';
import { WakuMessage } from '../waku-relayer/waku-message';
import { isDefined } from '@railgun-community/shared-models';
import { promiseTimeout } from '../../util/promise-utils';

export type WakuRelayMessage = {
  contentTopic: string;
  payload: Uint8Array;
  timestamp: number;
  version?: number;
};

export type WakuApiClientOptions = {
  url: string;
  urlBackup: string;
};

export enum WakuRequestMethods {
  DebugInfo = '/debug/v1/info', // GET
  PublishSubscription = '/relay/v1/subscriptions', // POST
  PublishMessage = '/relay/v1/messages/', // POST - requires pubsub topic
  GetMessages = '/relay/v1/messages/',  // GET - requires pubsub topic
  DeleteSubscriptions = '/relay/v1/subscriptions', // DELETE
}

const MAX_RETRIES = 4;

export class WakuApiClient {
  dbg: debug.Debugger;

  http: AxiosInstance;

  mainNwaku: string;

  backupNwaku: string;

  constructor(options: WakuApiClientOptions) {
    this.dbg = debug('waku:REST-api');
    this.mainNwaku = options.url;
    this.backupNwaku = options.urlBackup;
    const httpConfig = {
      timeout: 60000,
      headers: { 'Content-Type': 'application/json' },
    };
    this.http = axios.create(httpConfig);
    this.dbg('Relaying via ', options.url);
  }

  async post(path: string, data: any) {
    const response = await promiseTimeout(
      this.http.post(path, data),
      10 * 1000,
    );
    return response.data;
  }

  async get(path: string) {
    const response = await promiseTimeout(
      this.http.get(path),
      10 * 1000,
    );
    return response.data;
  }

  async delete(path: string, data: any) {
    const response = await promiseTimeout(
      this.http.delete(path, { data }),
      10 * 1000,
    );
    return response.data;
  }

  formatRESTRequest(method: string, topic: any) {
    this.dbg('formatting REST request', method, topic);
    return `${method}${topic}`;
  }

  determineRequestType(method: string) {
    this.dbg('determining request type', method);
    switch (method) {
      case WakuRequestMethods.DebugInfo:
      case WakuRequestMethods.GetMessages:
        return 'GET';
      case WakuRequestMethods.PublishSubscription:
      case WakuRequestMethods.PublishMessage:
        return 'POST';
      case WakuRequestMethods.DeleteSubscriptions:
        return 'DELETE';
      default:
        return 'GET';
    }
  }

  async request(method: string, topic: string, params: any, retry = 0): Promise<any> {
    const req = this.formatRESTRequest(method, topic);
    try {
      const baseURL = retry === 0 ? this.mainNwaku : this.backupNwaku;
      const formattedURL = `${baseURL}${req}`;

      const requestType = this.determineRequestType(method);

      switch (requestType) {
        case 'GET':
          {
            const response = await promiseTimeout(this.get(formattedURL), 10 * 1000);
            this.dbg(response)
            return response.data;
          }
        case 'POST':
          {
            const response = await promiseTimeout(this.post(formattedURL, params), 10 * 1000);
            this.dbg(response)
            return response;
          }
        case 'DELETE':
          {
            const response = await promiseTimeout(this.delete(formattedURL, params), 10 * 1000);
            this.dbg(response)
            return response;
          }
        default:
          {
            const response = await promiseTimeout(this.get(formattedURL), 10 * 1000);
            this.dbg(response)
            return response;
          }
      }
    } catch (err) {
      if (retry < MAX_RETRIES) {
        this.dbg('Error posting to relay-api. Retrying.', req, err.message);
        return this.request(method, params, retry + 1);
      }
      this.dbg('Error posting to relay-api', req, err.message);
      throw Error(err.message);
    }
  }

  async getDebug(): Promise<string[]> {
    const data = await this.request(WakuRequestMethods.DebugInfo, '', []);
    const { result, error } = data;
    if (isDefined(result)) {
      return result.listenAddresses;
    }
    if (isDefined(error)) {
      this.dbg(error.message);
    }
    return [];
  }

  async unsubscribe(topics: string[]) {
    this.dbg('unsubscribing from topics', topics);
    const data = await this.request(WakuRequestMethods.DeleteSubscriptions, '', [
      topics,
    ]);
    const { result } = data;
    return result;
  }

  async subscribe(topics: string[]) {
    this.dbg('subscribing to topics', topics);
    const data = await this.request(WakuRequestMethods.PublishSubscription, '', [
      topics,
    ]);

    const { result } = data;
    return result;
  }

  /**
   * publish a js-waku WakuMessage to pubsub topic
   * @todo be less convenient and don't depend on js-waku
   */
  async publish(message: WakuMessage, topic: string) {
    if (!message.payload) {
      this.dbg('Tried to publish empty message');
      return false;
    }
    const { timestamp } = message;
    const payload = Buffer.from(message.payload).toString('base64');
    const { contentTopic } = message;

    if (contentTopic?.includes('fees') === true) {
      // we have fee message.. dont try to resend.
      const data = await this.request(
        WakuRequestMethods.PublishMessage, topic,
        [{ payload, timestamp, contentTopic }],
        MAX_RETRIES,
      );
      return data.result;
    }

    const data = await this.request(WakuRequestMethods.PublishMessage, topic, [
      { payload, timestamp, contentTopic },
    ]);
    return data.result;
  }

  static fromJSON(obj: any): WakuRelayMessage {
    const msg: WakuRelayMessage = {
      contentTopic: obj.contentTopic,
      payload: Buffer.from(obj?.payload ?? [], 'base64'),
      version: obj.version ?? 0,
      timestamp: obj.timestamp ?? undefined,
    };
    return msg;
  }

  /**
   * retrieve messages collected since last call
   * this is not Filter API - the rpc node returns all messages on the pubsub topic
   *
   * however, specifying contentTopics locally filters out uninteresting messages before return
   */
  async getMessages(
    topic: string,
    contentTopics: string[] = [],
  ): Promise<WakuRelayMessage[]> {
    const data = await this.request(WakuRequestMethods.GetMessages, topic, []);

    if (isDefined(data.error)) {
      throw data.error;
    }
    const messages: WakuRelayMessage[] = data.result.map(
      WakuApiClient.fromJSON,
    );

    if (!isDefined(messages)) {
      this.dbg('No messages, got data:', data);
      return [];
    }

    // if contentTopics given, return only matching messages
    if (contentTopics.length) {
      return messages.filter((message: WakuRelayMessage) =>
        contentTopics.includes(message.contentTopic),
      );
    }
    // otherwise return messages of all contentTopics (including ping etc)
    return messages;
  }
}
