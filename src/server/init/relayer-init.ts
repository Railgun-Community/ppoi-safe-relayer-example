import { startEngine, stopEngine } from '../engine/engine-init';
import { initWallets } from '../wallets/active-wallets';
import { initNetworkProviders } from '../providers/active-network-providers';
import {
  initPricePoller,
  stopTokenPricePolling,
} from '../tokens/token-price-poller';
import { logger } from '../../util/logger';
import { initSettingsDB, closeSettingsDB } from '../db/settings-db';
// @ts-ignore
import { myConfigOverrides } from '../../MY-CONFIG';
import { initTokens } from '../tokens/network-tokens';
import {
  initTopUpPoller,
  stopTopUpPolling,
} from '../wallets/wallet-top-up-poller';
import {
  isDefined,
  setOnBalanceUpdateCallback,
} from '@railgun-community/quickstart';
import { onBalanceUpdateCallback } from '../balances/shielded-balance-cache';

export const initRelayerModules = async (forTest = false) => {
  if (!forTest) {
    isDefined(myConfigOverrides) && myConfigOverrides();
  }
  initSettingsDB();
  startEngine();
  await initNetworkProviders();
  await Promise.all([initWallets(), initTokens()]);
  setOnBalanceUpdateCallback(onBalanceUpdateCallback);
  initPricePoller();
  initTopUpPoller();
  logger.log('Relayer ready.');
};

export const uninitRelayerModules = async () => {
  stopTokenPricePolling();
  logger.log('stopping token price polling');
  stopTopUpPolling();
  logger.log('stopping wallet top up polling');
  await closeSettingsDB();
  logger.log('closed settings db');
  await stopEngine();
  logger.log('unloaded engine');
};
