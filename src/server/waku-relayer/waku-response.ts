import { JsonRpcResult } from '@walletconnect/jsonrpc-types';

export type WakuMethodResponse = {
  rpcResult: JsonRpcResult<string | object>;
  contentTopic: string;
};
