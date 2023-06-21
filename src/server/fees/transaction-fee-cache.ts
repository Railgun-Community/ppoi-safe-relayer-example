import { BigNumber } from 'ethers';
import configDefaults from '../config/config-defaults';
import { resetMapObject } from '../../util/utils';
import { RelayerChain } from '../../models/chain-models';
import { isDefined } from '@railgun-community/quickstart';

type CachedFees = {
  tokenFees: MapType<BigNumber>;
  updatedAt: number; // In milliseconds.
};

// Cached token prices per network.
// {chainType: {chainID: {feeID: CachedFee}}}
const transactionFeeCache: NumMapType<NumMapType<MapType<CachedFees>>> = {};

export const resetTransactionFeeCache = () => {
  resetMapObject(transactionFeeCache);
};

const FEE_ID_CHARSET = 'abcdefghijklnopqrstuvwxyz0123456789';
const FEE_ID_CHARSET_LENGTH = FEE_ID_CHARSET.length;

const generateFeeCacheID = (length = 16) => {
  let retVal = '';
  for (let i = 0; i < length; i += 1) {
    retVal += FEE_ID_CHARSET.charAt(
      Math.floor(Math.random() * FEE_ID_CHARSET_LENGTH),
    );
  }
  return retVal;
};

const clearExpiredFees = (chain: RelayerChain) => {
  const cacheForChain = transactionFeeCache[chain.type][chain.id];
  const keys = Object.keys(cacheForChain);
  for (const key of keys) {
    const cachedFees = cacheForChain[key];
    if (cachedFeesExpired(cachedFees)) {
      delete cacheForChain[key];
    }
  }
};

export const cacheUnitFeesForTokens = (
  chain: RelayerChain,
  tokenFees: MapType<BigNumber>,
): string => {
  const feeCacheID = generateFeeCacheID();
  const cachedFee: CachedFees = {
    tokenFees,
    updatedAt: Date.now(),
  };
  transactionFeeCache[chain.type] ??= {};
  transactionFeeCache[chain.type][chain.id] ??= {};
  transactionFeeCache[chain.type][chain.id][feeCacheID] = cachedFee;
  clearExpiredFees(chain);
  return feeCacheID;
};

const cachedFeesExpired = (cachedFees: CachedFees) => {
  const ttl = configDefaults.transactionFees.feeExpirationInMS;
  return cachedFees.updatedAt + ttl < Date.now();
};

export const lookUpCachedUnitTokenFee = (
  chain: RelayerChain,
  feeCacheID: string,
  tokenAddress: string,
): Optional<BigNumber> => {
  transactionFeeCache[chain.type] ??= {};
  transactionFeeCache[chain.type][chain.id] ??= {};
  const cachedFees = transactionFeeCache[chain.type][chain.id][feeCacheID];
  if (!isDefined(cachedFees)) {
    return undefined;
  }
  if (cachedFeesExpired(cachedFees)) {
    return undefined;
  }
  return cachedFees.tokenFees[tokenAddress];
};

/**
 * Checks if feeCacheID is in cache map. It's ok if it's expired.
 * The fee cache ID ensures that this exact server sent out the fees.
 * This enables a Relayer to run multiple servers with the same Rail Address (and different HD wallets).
 * We check whether the fee was dispatched by this Relayer in transact-method.ts.
 */
export const recognizesFeeCacheID = (
  chain: RelayerChain,
  feeCacheID: string,
) => {
  transactionFeeCache[chain.type] ??= {};
  transactionFeeCache[chain.type][chain.id] ??= {};
  return transactionFeeCache[chain.type][chain.id][feeCacheID] != null;
};
