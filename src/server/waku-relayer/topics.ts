import { NetworkChainID } from '../config/config-chain-ids';

export const contentTopics = {
  default: () => '/railgun/v1/default/json',
  fees: (chainID: NetworkChainID) => `/railgun/v1/${chainID}/fees/json`,
  transact: (chainID: NetworkChainID) => `/railgun/v1/${chainID}/transact/json`,
  transactResponse: (chainID: NetworkChainID) =>
    `/railgun/v1/${chainID}/transact-response/json`,
};
