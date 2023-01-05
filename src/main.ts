import debug from 'debug';
import {
  initRelayerModules,
  uninitRelayerModules,
} from 'server/init/relayer-init';
import {
  WakuRelayer,
  WakuRelayerOptions,
  WAKU_TOPIC,
} from 'server/waku-relayer/waku-relayer';
import { getRailgunWallet } from 'server/wallets/active-wallets';
import { delay } from 'util/promise-utils';
import config from 'server/config/config-defaults';
import { WakuApiClient } from 'server/networking/waku-api-client';
import { RailgunEngine, ViewOnlyWallet } from '@railgun-community/engine';

const dbg = debug('relayer:main');

let relayer: WakuRelayer;

const main = async (): Promise<void> => {
  dbg('Warming up Relayer');

  await initRelayerModules();

  // Note that this default can be overridden in initRelayerModules().
  dbg(`Connecting to ${config.waku.rpcURL}`);

  const client = new WakuApiClient({ url: config.waku.rpcURL });
  const wallet = getRailgunWallet();
  const options: WakuRelayerOptions = {
    topic: WAKU_TOPIC,
    feeExpiration: config.transactionFees.feeExpirationInMS,
  };
  relayer = await WakuRelayer.init(client, wallet, options);
  relayer.poll(config.waku.pollFrequencyInMS);
  relayer.broadcastFeesOnInterval(config.waku.broadcastFeesDelayInMS);

  // print multiaddress of nim-waku instance
  dbg(await relayer.client.getDebug());
};

process.on('SIGINT', async () => {
  dbg('shutting down');
  uninitRelayerModules();
  await relayer.stop();
  await delay(2000);
  process.exit(0);
});

main();
