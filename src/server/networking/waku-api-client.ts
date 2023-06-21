import axios, { AxiosInstance } from 'axios';
import { formatJsonRpcRequest } from '@walletconnect/jsonrpc-utils';
import debug from 'debug';
import { WakuMessage } from '../waku-relayer/waku-message';
import { isDefined } from '@railgun-community/quickstart';

export type WakuRelayMessage = {
  contentTopic: string;
  payload: Uint8Array;
  timestamp: number;
};

export type WakuApiClientOptions = {
  url: string;
};

export enum WakuRequestMethods {
  DebugInfo = 'get_waku_v2_debug_v1_info',
  PublishSubscription = 'post_waku_v2_relay_v1_subscriptions',
  PublishMessage = 'post_waku_v2_relay_v1_message',
  GetMessages = 'get_waku_v2_relay_v1_messages',
  DeleteSubscriptions = 'delete_waku_v2_relay_v1_subscriptions',
}

const MAX_RETRIES = 4;

export class WakuApiClient {
  dbg: debug.Debugger;

  http: AxiosInstance;

  constructor(options: WakuApiClientOptions) {
    this.dbg = debug('waku:jsonrpc-api');
    const httpConfig = {
      timeout: 60000,
      baseURL: options.url,
      headers: { 'Content-Type': 'application/json' },
    };
    this.http = axios.create(httpConfig);
    this.dbg('Relaying via ', options.url);
  }

  async request(method: string, params: any, retry = 0): Promise<any> {
    const req = formatJsonRpcRequest(method, params);
    try {
      const response = await this.http.post('/', req);
      return response.data;
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
    const data = await this.request(WakuRequestMethods.DebugInfo, []);
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
    const data = await this.request(WakuRequestMethods.DeleteSubscriptions, [
      topics,
    ]);
    const { result } = data;
    return result;
  }

  async subscribe(topics: string[]) {
    this.dbg('subscribing to topics', topics);
    const data = await this.request(WakuRequestMethods.PublishSubscription, [
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
    const payload = Buffer.from(message.payload).toString('hex');
    const { contentTopic } = message;
    const data = await this.request(WakuRequestMethods.PublishMessage, [
      topic,
      { payload, timestamp, contentTopic },
    ]);
    return data.result;
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
    const data = await this.request(WakuRequestMethods.GetMessages, [topic]);

    const messages: WakuRelayMessage[] = data.result;
    // if contentTopics given, return only matching messages
    if (isDefined(data.error)) {
      throw data.error;
    }
    if (!isDefined(messages)) {
      this.dbg('No messages, got data:', data);
      return [];
    }
    if (contentTopics.length) {
      return messages.filter((message: WakuRelayMessage) =>
        contentTopics.includes(message.contentTopic),
      );
    }
    // otherwise return messages of all contentTopics (including ping etc)
    return messages;
  }
}
