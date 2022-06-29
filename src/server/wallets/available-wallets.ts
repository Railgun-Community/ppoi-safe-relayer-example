import { parseUnits } from '@ethersproject/units';
import debug from 'debug';
import { ActiveWallet } from '../../models/wallet-models';
import { logger } from '../../util/logger';
import { resetMapObject } from '../../util/utils';
import { getCachedGasTokenBalance } from '../balances/balance-cache';
import { NetworkChainID } from '../config/config-chain-ids';
import configNetworks from '../config/config-networks';

const unavailableWalletMap: NumMapType<MapType<boolean>> = {};

const dbg = debug('relayer:wallets:availability');

export const setWalletAvailable = (
  wallet: ActiveWallet,
  chainID: NetworkChainID,
  available: boolean,
) => {
  unavailableWalletMap[chainID] = unavailableWalletMap[chainID] ?? {};
  unavailableWalletMap[chainID][wallet.address] = !available;
  dbg(`Set wallet ${wallet.address}:`, available ? 'AVAILABLE' : 'BUSY');
};

export const isWalletAvailable = (
  wallet: ActiveWallet,
  chainID: NetworkChainID,
) => {
  if (
    unavailableWalletMap[chainID] &&
    unavailableWalletMap[chainID][wallet.address]
  ) {
    return false;
  }
  try {
    return isBelowMinimumGasTokenBalance(wallet, chainID);
  } catch (err) {
    logger.error(err);
    logger.warn(
      `Error getting gas token balance for wallet ${wallet.address}. Assuming wallet unavailable.`,
    );
    return false;
  }
};

const isBelowMinimumGasTokenBalance = async (
  wallet: ActiveWallet,
  chainID: NetworkChainID,
) => {
  const { gasToken } = configNetworks[chainID];
  const minimumBalance = parseUnits(
    String(gasToken.minimumBalanceForAvailability),
    18,
  );
  try {
    const balance = await getCachedGasTokenBalance(chainID, wallet.address);
    if (balance.lt(minimumBalance)) {
      return false;
    }
    return true;
  } catch (err) {
    logger.error(err);
    logger.warn(
      `Error getting gas token balance for wallet ${wallet.address}. Assuming wallet has enough funds.`,
    );
    return false;
  }
};

const isProcessingTransaction = (
  wallet: ActiveWallet,
  chainID: NetworkChainID,
) => {
  if (
    unavailableWalletMap[chainID] &&
    unavailableWalletMap[chainID][wallet.address]
  ) {
    return false;
  }
  return true;
};

export const shouldTopUpWallet = (
  wallet: ActiveWallet,
  chainID: NetworkChainID,
) => {
  return (
    !isProcessingTransaction(wallet, chainID) &&
    isBelowMinimumGasTokenBalance(wallet, chainID)
  );
};

export const getAvailableWallets = async (
  activeWallets: ActiveWallet[],
  chainID: NetworkChainID,
) => {
  const walletAvailability = await Promise.all(
    activeWallets.map((wallet) => isWalletAvailable(wallet, chainID)),
  );
  return activeWallets.filter((_wallet, index) => walletAvailability[index]);
};

export const resetAvailableWallets = (chainID: NetworkChainID) => {
  resetMapObject(unavailableWalletMap[chainID]);
};
