import configNetworks from '../config/config-networks';
import { GasTokenConfig, Token } from '../../models/token-models';
import { logger } from '../../util/logger';
import { resetMapObject } from '../../util/utils';
import { tokenForAddress } from './network-tokens';
import { RelayerChain } from '../../models/chain-models';
import { isDefined } from '@railgun-community/quickstart';

export enum TokenPriceSource {
  CoinGecko = 'CoinGecko',
  ZeroX = '0x',
}

export type TokenPrice = {
  price: number;
  updatedAt: number; // In milliseconds.
};

export type TokenPriceUpdater = (
  tokenAddress: string,
  tokenPrice: TokenPrice,
) => void;

type TokenAddressesToPrice = MapType<Optional<TokenPrice>>;

// Cached token prices per network.
// {source: {chainType: {chainID: {address: TokenPrice}}}}
const tokenPriceCache: MapType<NumMapType<NumMapType<TokenAddressesToPrice>>> =
  {};

export const cacheTokenPriceForNetwork = (
  source: TokenPriceSource,
  chain: RelayerChain,
  tokenAddress: string,
  tokenPrice: TokenPrice,
) => {
  tokenPriceCache[source] ??= {};
  tokenPriceCache[source][chain.type] ??= {};
  tokenPriceCache[source][chain.type][chain.id] ??= {};
  tokenPriceCache[source][chain.type][chain.id][tokenAddress.toLowerCase()] = {
    price: tokenPrice.price,
    updatedAt: tokenPrice.updatedAt,
  };
  logger.log(
    `${source} [${chain.type}:${chain.id}]: Cache price $${
      tokenPrice.price
    } for token ${tokenAddress.toLowerCase()}`,
  );
};

export const resetTokenPriceCache = () => {
  resetMapObject(tokenPriceCache);
};

export const getTokenPriceCache = () => {
  return tokenPriceCache;
};

const logTokenLookupError = (
  errorMsg: string,
  chain: RelayerChain,
  tokenAddress: string,
) => {
  const tokenSymbol = tokenForAddress(chain, tokenAddress).symbol;
  const tokenDetails = `${tokenSymbol} on ${
    configNetworks[chain.type][chain.id].name
  } (${tokenAddress})`;
  logger.warn(`${errorMsg}: ${tokenDetails}`);
};

export const cachedTokenPriceForSource = (
  source: TokenPriceSource,
  chain: RelayerChain,
  tokenAddress: string,
): Optional<TokenPrice> => {
  const pricesForSource = tokenPriceCache[source];
  if (!isDefined(pricesForSource)) {
    return undefined;
  }
  const cachedNetworkPrices = pricesForSource[chain.type][chain.id];
  if (!isDefined(cachedNetworkPrices)) {
    logTokenLookupError(`[${source}] No network prices`, chain, tokenAddress);
    return undefined;
  }

  const cachedPrice = cachedNetworkPrices[tokenAddress];
  if (!cachedPrice) {
    // No cached price for this source/network. Likely still loading.
    return undefined;
  }

  // Token price expired (configurable per network: priceTTLInMS).
  const networkPriceTTLInMs = configNetworks[chain.type][chain.id].priceTTLInMS;
  const expiration = cachedPrice.updatedAt + networkPriceTTLInMs;
  const priceExpired = expiration < Date.now();
  if (priceExpired) {
    const expirationTimeLapsed = Date.now() - expiration;
    logTokenLookupError(
      `[${source}] Token price expired by ${expirationTimeLapsed} ms`,
      chain,
      tokenAddress,
    );
    return undefined;
  }

  return cachedPrice;
};

const getAverageCachedTokenPrice = (
  chain: RelayerChain,
  tokenAddress: string,
): Optional<number> => {
  const tokenPrices: TokenPrice[] = [];

  Object.values(TokenPriceSource).forEach((source) => {
    const cachedPrice = cachedTokenPriceForSource(source, chain, tokenAddress);
    if (cachedPrice) {
      tokenPrices.push(cachedPrice);
    }
  });

  if (!tokenPrices.length) {
    return undefined;
  }

  const prices = tokenPrices.map((t) => t.price);
  const averageValidPrice = prices.reduce((a, b) => a + b) / tokenPrices.length;
  return averageValidPrice;
};

export const lookUpCachedTokenPrice = (
  chain: RelayerChain,
  tokenAddress: string,
): number => {
  const cachedPrice = getAverageCachedTokenPrice(
    chain,
    tokenAddress.toLowerCase(),
  );

  // No price available.
  if (!isDefined(cachedPrice)) {
    logTokenLookupError('NO TOKEN PRICE', chain, tokenAddress);
    throw new Error(`No cached price for token: ${tokenAddress}`);
  }

  return cachedPrice;
};

export const getTransactionTokenPrices = (
  chain: RelayerChain,
  token: Token,
  gasToken: GasTokenConfig,
): { gasTokenPrice: number; tokenPrice: number } => {
  const tokenPrice = lookUpCachedTokenPrice(chain, token.address);
  const gasTokenPrice = lookUpCachedTokenPrice(chain, gasToken.wrappedAddress);
  return {
    tokenPrice,
    gasTokenPrice,
  };
};
