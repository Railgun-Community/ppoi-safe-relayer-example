import { NetworkChainID } from '../config/config-chains';
import configNetworks from '../config/config-networks';
import configDefaults from '../config/config-defaults';
import { RelayerChain } from '../../models/chain-models';
import { ChainType } from '@railgun-community/lepton/dist/models/lepton-types';
import { removeUndefineds } from '../../util/utils';

export const configuredNetworkChains = (): RelayerChain[] => {
  const chainTypes: ChainType[] = removeUndefineds(
    Object.keys(configNetworks),
  ).map((chainType) => Number(chainType));
  const chains: RelayerChain[] = [];

  chainTypes.forEach((chainType) => {
    const chainIDs: NetworkChainID[] = removeUndefineds(
      Object.keys(configNetworks[chainType]),
    ).map((chainID) => Number(chainID));
    chains.push(
      ...chainIDs.map((chainID) => {
        return {
          type: chainType,
          id: chainID,
        };
      }),
    );
  });

  return chains.filter(
    (chain) =>
      chain.type !== ChainType.EVM ||
      configDefaults.networks.EVM.includes(chain.id),
  );
};
