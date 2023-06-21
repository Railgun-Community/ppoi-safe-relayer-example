import { FallbackProvider } from '@ethersproject/providers';
import { Contract } from 'ethers';
import configNetworks from '../config/config-networks';
import configTokens from '../config/config-tokens';
import { GasTokenConfig, Token } from '../../models/token-models';
import { configuredNetworkChains } from '../chains/network-chain-ids';
import { getProviderForNetwork } from '../providers/active-network-providers';
import { removeUndefineds } from '../../util/utils';
import { logger } from '../../util/logger';
import { ABI_ERC20 } from '../abi/abi';
import { RelayerChain } from '../../models/chain-models';
import { isDefined } from '@railgun-community/quickstart';

export const networkTokens: NumMapType<NumMapType<Token[]>> = {};

export const initTokens = async () => {
  for (const chain of configuredNetworkChains()) {
    const tokensForChain = configTokens[chain.type][chain.id];
    if (!isDefined(tokensForChain)) {
      networkTokens[chain.type] ??= [];
      networkTokens[chain.type][chain.id] = [];
      continue;
    }
    const tokenAddresses = Object.keys(tokensForChain);
    const provider = getProviderForNetwork(chain);
    const tokenPromises = tokenAddresses.map((tokenAddress) =>
      erc20TokenDetailsForAddress(tokenAddress, provider, chain),
    );
    // eslint-disable-next-line no-await-in-loop
    const tokens = await Promise.all(tokenPromises);
    networkTokens[chain.type] ??= [];
    networkTokens[chain.type][chain.id] = removeUndefineds(tokens);
  }
};

export const getERC20Decimals = (
  tokenAddress: string,
  provider: FallbackProvider,
): Promise<number> => {
  const contract = new Contract(tokenAddress, ABI_ERC20, provider);
  return contract.decimals();
};

const erc20TokenDetailsForAddress = async (
  tokenAddress: string,
  provider: FallbackProvider,
  chain: RelayerChain,
): Promise<Optional<Token>> => {
  const { symbol } = configTokens[chain.type][chain.id][tokenAddress];
  try {
    const decimals = await getERC20Decimals(tokenAddress, provider);
    return {
      symbol,
      address: tokenAddress,
      decimals,
    };
  } catch (err) {
    logger.warn(
      `Could not load token ${tokenAddress} (${symbol}) for chain ${chain.type}:${chain.id}: ${err.message}`,
    );
    return undefined;
  }
};

export const allTokenAddressesForNetwork = (chain: RelayerChain): string[] => {
  return networkTokens[chain.type][chain.id].map((token) =>
    token.address.toLowerCase(),
  );
};

export const tokenForAddress = (
  chain: RelayerChain,
  address: string,
): Token => {
  const lowercaseAddress = address.toLowerCase();
  const tokens = networkTokens[chain.type][chain.id];
  for (const token of tokens) {
    if (token.address.toLowerCase() === lowercaseAddress) {
      return token;
    }
  }
  throw new Error(
    `Unsupported token for chain ${chain.type}:${chain.id}: ${address}`,
  );
};

export const getTransactionTokens = (
  chain: RelayerChain,
  tokenAddress: string,
): { token: Token; gasToken: GasTokenConfig } => {
  const token = tokenForAddress(chain, tokenAddress);
  const networkConfig = configNetworks[chain.type][chain.id];
  const { gasToken } = networkConfig;
  return {
    token,
    gasToken,
  };
};
