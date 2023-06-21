import { JsonRpcProvider } from '@ethersproject/providers';
import { isDefined } from '@railgun-community/quickstart';
import debug from 'debug';

const dbg = debug('relayer:fallback-provider');

type EthersError = Error & {
  body: string;
  code: string;
  error: Error;
  reason: string;
  requestBody: string;
  requestMethod: string;
  url: string;
};

type RPCError = {
  jsonrpc: string;
  id: number;
  error: {
    code: number;
    message: string;
  };
};

type RPCRequest = {
  method: string;
  jsonrpc: string;
  id: number;
  params: Record<string, unknown>;
};

type ProviderDebugEvent = {
  action: string;
  error: EthersError;
  request: RPCRequest;
  provider: JsonRpcProvider;
};

export const providerDebugListener = (debugEvent: ProviderDebugEvent) => {
  if (isDefined(debugEvent.error)) {
    const info = {
      action: debugEvent.action,
      network: debugEvent.provider.network.name,
      provider: debugEvent.error?.url,
      body: debugEvent.error.body,
      request: debugEvent.error.requestBody,
      code: debugEvent.error.code,
    };
    let body: RPCError | undefined;
    try {
      body = JSON.parse(info.body);
    } catch (err) {
      /* noop */
    }
    if (body && body?.error?.message === 'already known') {
      return;
    }
    dbg(JSON.stringify(info));
  }
};
