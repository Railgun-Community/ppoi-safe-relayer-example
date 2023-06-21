import {
  TransactionRequest,
  TransactionResponse,
} from '@ethersproject/providers';
import {
  EVMGasType,
  TransactionGasDetails,
} from '@railgun-community/shared-models';
import debug from 'debug';
import { Wallet as EthersWallet } from 'ethers';
import { RelayerChain } from '../../models/chain-models';
import { ActiveWallet } from '../../models/wallet-models';
import { ErrorMessage, sanitizeRelayerError } from '../../util/errors';
import { promiseTimeout, throwErr } from '../../util/promise-utils';
import { minBigNumber } from '../../util/utils';
import { updateCachedGasTokenBalance } from '../balances/balance-cache';
import { getSettingsNumber, storeSettingsNumber } from '../db/settings-db';
import {
  calculateGasLimitRelayer,
  calculateMaximumGasRelayer,
} from '../fees/gas-estimate';
import { getProviderForNetwork } from '../providers/active-network-providers';
import { createEthersWallet } from '../wallets/active-wallets';
import { setWalletAvailability } from '../wallets/available-wallets';
import { getBestMatchWalletForNetwork } from '../wallets/best-match-wallet';
import { isDefined } from '@railgun-community/quickstart';

const dbg = debug('relayer:transact:execute');

const LAST_NONCE_KEY = 'last_nonce_key';

export const getLastNonceKey = (chain: RelayerChain, wallet: EthersWallet) => {
  return `${LAST_NONCE_KEY}|${wallet.address}|${chain.type}|${chain.id}`;
};

export const getCurrentWalletNonce = async (
  wallet: EthersWallet,
): Promise<number> => {
  try {
    const blockTag = 'pending';
    return await wallet.getTransactionCount(blockTag);
  } catch (err) {
    return throwErr(err);
  }
};

/**
 * NOTE: This nonce storage has been unreliable...
 * Since we keep the wallet locked while a tx is pending, we can just use the tx count.
 * Only limitation is if we restart during a pending tx, but blockTag 'pending' seems to help.
 */
export const getCurrentNonce = async (
  chain: RelayerChain,
  wallet: EthersWallet,
): Promise<number> => {
  const blockTag = 'pending';
  const [txCount, lastTransactionNonce] = await Promise.all([
    wallet.getTransactionCount(blockTag).catch(throwErr),
    await getSettingsNumber(getLastNonceKey(chain, wallet)),
  ]);
  if (isDefined(lastTransactionNonce)) {
    return Math.max(txCount, lastTransactionNonce + 1);
  }
  return txCount;
};

export const storeCurrentNonce = async (
  chain: RelayerChain,
  nonce: number,
  wallet: EthersWallet,
) => {
  await storeSettingsNumber(getLastNonceKey(chain, wallet), nonce);
};

export const executeTransaction = async (
  chain: RelayerChain,
  transactionRequest: TransactionRequest,
  gasDetails: TransactionGasDetails,
  wallet?: ActiveWallet,
  overrideNonce?: number,
): Promise<TransactionResponse> => {
  dbg('Execute transaction');

  const maximumGas = calculateMaximumGasRelayer(gasDetails, chain);
  const activeWallet =
    wallet ?? (await getBestMatchWalletForNetwork(chain, maximumGas));

  const provider = getProviderForNetwork(chain);
  const ethersWallet = createEthersWallet(activeWallet, provider);
  const nonce = overrideNonce ?? (await getCurrentWalletNonce(ethersWallet));
  const gasLimit = calculateGasLimitRelayer(gasDetails.gasEstimate, chain);
  dbg('Nonce', nonce);

  const finalTransaction: TransactionRequest = {
    ...transactionRequest,
    chainId: chain.id,
    nonce,
    gasLimit,
  };

  dbg(`Gas limit: ${gasLimit.toString()}`);

  dbg(`Gas details: ${JSON.stringify(gasDetails)}`);

  finalTransaction.type = gasDetails.evmGasType;

  switch (gasDetails.evmGasType) {
    case EVMGasType.Type0:
    case EVMGasType.Type1: {
      const { gasPrice } = gasDetails;
      finalTransaction.gasPrice = gasPrice;
      dbg(`Gas price: ${gasPrice.toString()}`);
      break;
    }
    case EVMGasType.Type2: {
      const { maxFeePerGas, maxPriorityFeePerGas } = gasDetails;
      finalTransaction.maxFeePerGas = maxFeePerGas;
      finalTransaction.maxPriorityFeePerGas = minBigNumber(
        maxFeePerGas,
        maxPriorityFeePerGas,
      );
      dbg(`Max fee per gas: ${maxFeePerGas.toString()}`);
      dbg(`Max priority fee: ${maxPriorityFeePerGas.toString()}`);
      break;
    }
  }

  try {
    dbg('Submitting transaction');
    dbg(finalTransaction);

    setWalletAvailability(activeWallet, chain, false);

    const txResponse = await promiseTimeout(
      ethersWallet.sendTransaction(finalTransaction),
      // 45-second time-out. A shorter or longer timeout may cause issues with frontends.
      // Frontends submit to relayers with their own timeout; the frontend timeout may lapse before the Relayer timeout.
      45000,
    );

    dbg('Submitted transaction:', txResponse.hash);

    // Perform this action synchronously - return txResponse immediately.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    waitForTx(activeWallet, ethersWallet, chain, txResponse, nonce).then(() => {
      setWalletAvailability(activeWallet, chain, true);
    });

    return txResponse;
  } catch (err) {
    dbg(err);

    setWalletAvailability(activeWallet, chain, true);

    const errMsg = err?.message as string | undefined;
    if (isDefined(errMsg) && errMsg.includes('Timed out')) {
      throw new Error(ErrorMessage.TRANSACTION_SEND_TIMEOUT_ERROR);
    }

    if (isDefined(errMsg) && errMsg.includes('Nonce already used')) {
      // Try again with increased nonce.
      return executeTransaction(
        chain,
        transactionRequest,
        gasDetails,
        wallet,
        nonce + 1,
      );
    }

    throw sanitizeRelayerError(err);
  }
};

export const waitForTx = async (
  activeWallet: ActiveWallet,
  ethersWallet: EthersWallet,
  chain: RelayerChain,
  txResponse: TransactionResponse,
  nonce: number,
) => {
  try {
    await waitTx(txResponse);
    dbg(`Transaction completed/mined: ${txResponse.hash}`);
    await storeCurrentNonce(chain, nonce, ethersWallet);
  } catch (err) {
    dbg(`Transaction ${txResponse.hash} error: ${err.message}`);
  } finally {
    await updateCachedGasTokenBalance(chain, activeWallet.address);
  }
};

export const waitForTxs = async (
  activeWallet: ActiveWallet,
  ethersWallet: EthersWallet,
  chain: RelayerChain,
  txResponses: TransactionResponse[],
) => {
  await Promise.all(
    txResponses.map(async (txResponse) => {
      const nonce = await getCurrentNonce(chain, ethersWallet);
      await waitForTx(activeWallet, ethersWallet, chain, txResponse, nonce);
    }),
  );
};

// Separated so it can be stubbed for tests.
export const waitTx = async (txResponse: TransactionResponse) => {
  const timeout = 5 * 60 * 1000; // 5 minutes
  await promiseTimeout(txResponse.wait().catch(throwErr), timeout);
};
