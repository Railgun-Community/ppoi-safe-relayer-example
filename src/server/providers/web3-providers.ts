import Web3 from 'web3-eth';
// eslint-disable-next-line import/no-extraneous-dependencies
import { HttpProvider } from 'web3-core';
import configNetworks from '../config/config-networks';
import { RelayerChain } from '../../models/chain-models';
import { isDefined } from '@railgun-community/quickstart';

// Hack to get the types to apply correctly.
const Web3Eth = Web3 as unknown as typeof Web3.Eth;

export const web3ProviderFromChainID = (chain: RelayerChain): HttpProvider => {
  const network = configNetworks[chain.type][chain.id];
  if (!isDefined(network)) {
    throw new Error(
      `No provider config available for ${chain.type}:${chain.id}.`,
    );
  }
  const { fallbackProviderConfig } = network;
  if (!fallbackProviderConfig?.providers.length) {
    throw new Error(
      `No remote provider config available for web3 provider: ${chain.type}:${chain.id}.`,
    );
  }

  const host = fallbackProviderConfig.providers[0].provider;

  const web3Provider = new Web3Eth.providers.HttpProvider(host, {});
  return web3Provider;
};
