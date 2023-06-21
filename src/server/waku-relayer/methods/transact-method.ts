import * as ed from '@noble/ed25519';
import { TransactionResponse } from '@ethersproject/providers';
import {
  hexlify,
  encryptJSONDataWithSharedKey,
  tryDecryptJSONDataWithSharedKey,
  EncryptedData,
  getRailgunWalletPrivateViewingKey,
  getRailgunWalletAddressData,
  isDefined,
} from '@railgun-community/quickstart';
import { formatJsonRpcResult } from '@walletconnect/jsonrpc-utils';
import debug from 'debug';
import { processTransaction } from '../../transactions/process-transaction';
import {
  getRailgunWalletAddress,
  getRailgunWalletID,
} from '../../wallets/active-wallets';
import { contentTopics } from '../topics';
import { WakuMethodResponse } from '../waku-response';
import { ErrorMessage } from '../../../util/errors';
import configDefaults from '../../config/config-defaults';
import { recognizesFeeCacheID } from '../../fees/transaction-fee-cache';
import { RelayerChain } from '../../../models/chain-models';
import configNetworks from '../../config/config-networks';
import {
  RelayerEncryptedMethodParams,
  RelayerRawParamsTransact,
  versionCompare,
} from '@railgun-community/shared-models';
import { getRelayerVersion } from '../../../util/relayer-version';

const handledClientPubKeys: string[] = [];

const dbg = debug('relayer:transact');

export const transactMethod = async (
  params: RelayerEncryptedMethodParams,
  id: number,
): Promise<Optional<WakuMethodResponse>> => {
  dbg('got transact');
  dbg(params);

  const { pubkey: clientPubKey, encryptedData } = params;

  if (handledClientPubKeys.includes(clientPubKey)) {
    // Client sent a repeated message. Ignore because we've already handled it.
    dbg('Repeat message - already handled');
    return undefined;
  }
  handledClientPubKeys.push(clientPubKey);

  const railgunWalletID = getRailgunWalletID();
  const viewingPrivateKey = getRailgunWalletPrivateViewingKey(railgunWalletID);
  const sharedKey = await ed.getSharedSecret(viewingPrivateKey, clientPubKey);

  const decrypted = await tryDecryptData(encryptedData, sharedKey);
  if (decrypted == null) {
    // Incorrect key. Skipping transact message.
    dbg('Cannot decrypt - Not intended receiver');
    return undefined;
  }

  const {
    chainType,
    chainID,
    minGasPrice,
    feesID: feeCacheID,
    serializedTransaction,
    relayerViewingKey,
    useRelayAdapt,
    devLog,
    minVersion,
    maxVersion,
  } = decrypted as RelayerRawParamsTransact;

  const chain: RelayerChain = {
    type: chainType,
    id: chainID,
  };

  try {
    dbg('Decrypted - attempting to transact');

    if (!minVersion || !maxVersion) {
      dbg(`Cannot process tx - Requires params minVersion, maxVersion`);
      // Do nothing. No error response.
      return;
    }
    const relayerVersion = getRelayerVersion();
    if (
      versionCompare(relayerVersion, minVersion) < 0 ||
      versionCompare(relayerVersion, maxVersion) > 0
    ) {
      dbg(
        `Cannot process tx - Relayer version ${relayerVersion} outside range ${minVersion}-${maxVersion}`,
      );
      // Do nothing. No error response.
      return;
    }

    if (!relayerViewingKey) {
      dbg(`Cannot process tx - Requires params relayerViewingKey`);
      // Do nothing. No error response.
      return;
    }

    const railgunWalletAddress = getRailgunWalletAddress();
    const { viewingPublicKey } =
      getRailgunWalletAddressData(railgunWalletAddress);
    if (relayerViewingKey !== hexlify(viewingPublicKey)) {
      return undefined;
    }

    if (!feeCacheID) {
      dbg(`Cannot process tx - Requires params feeCacheID`);
      // Do nothing. No error response.
      return;
    }
    if (
      configDefaults.transactionFees.requireMatchingFeeCacheID &&
      !recognizesFeeCacheID(chain, feeCacheID)
    ) {
      dbg(
        'Fee cache ID unrecognized. Transaction sent to another Relayer with same Rail Address.',
      );
      // Do nothing. No error response.
      return undefined;
    }

    // Relayer validated. Begin error responses.

    if (
      chainType == null ||
      chainID == null ||
      minGasPrice == null ||
      feeCacheID == null ||
      serializedTransaction == null ||
      relayerViewingKey == null ||
      useRelayAdapt == null
    ) {
      return errorResponse(
        id,
        chain,
        sharedKey,
        new Error(ErrorMessage.MISSING_REQUIRED_FIELD),
        devLog,
      );
    }

    if (
      !isDefined(configNetworks[chain.type]) ||
      !isDefined(configNetworks[chain.type][chain.id])
    ) {
      return errorResponse(
        id,
        chain,
        sharedKey,
        new Error(ErrorMessage.UNSUPPORTED_NETWORK),
        devLog,
      );
    }

    const txResponse = await processTransaction(
      chain,
      feeCacheID,
      minGasPrice,
      serializedTransaction,
      useRelayAdapt ?? false,
      devLog,
    );
    return resultResponse(id, chain, sharedKey, txResponse);
  } catch (err) {
    dbg(err);
    return errorResponse(id, chain, sharedKey, err, devLog);
  }
};

const resultResponse = (
  id: number,
  chain: RelayerChain,
  sharedKey: Uint8Array,
  txResponse: TransactionResponse,
): WakuMethodResponse => {
  const response = { txHash: txResponse.hash };
  return encryptedRPCResponse(response, id, chain, sharedKey);
};

const replaceErrorMessageNonDev = (
  errMsg: string,
  devLog?: boolean,
): string => {
  if (isDefined(devLog) && devLog) {
    return errMsg;
  }
  const knownError = errMsg as ErrorMessage;
  switch (knownError) {
    case ErrorMessage.BAD_TOKEN_FEE:
    case ErrorMessage.NO_RELAYER_FEE:
    case ErrorMessage.GAS_ESTIMATE_ERROR:
    case ErrorMessage.TRANSACTION_SEND_TIMEOUT_ERROR:
    case ErrorMessage.UNSUPPORTED_NETWORK:
    case ErrorMessage.GAS_PRICE_TOO_LOW:
    case ErrorMessage.MISSING_REQUIRED_FIELD:
    case ErrorMessage.UNKNOWN_ERROR:
    case ErrorMessage.FAILED_QUORUM:
    case ErrorMessage.REJECTED_PACKAGED_FEE:
      return errMsg;
  }
  return ErrorMessage.UNKNOWN_ERROR;
};

const errorResponse = (
  id: number,
  chain: RelayerChain,
  sharedKey: Uint8Array,
  err: Error,
  devLog?: boolean,
): WakuMethodResponse => {
  const response = {
    error: replaceErrorMessageNonDev(err.message, devLog),
  };
  return encryptedRPCResponse(response, id, chain, sharedKey);
};

const encryptedRPCResponse = (
  response: object,
  id: number,
  chain: RelayerChain,
  sharedKey: Uint8Array,
) => {
  dbg('Response:', response);
  const encryptedResponse = encryptResponseData(response, sharedKey);
  const rpcResult = formatJsonRpcResult(id, encryptedResponse);
  return {
    rpcResult,
    contentTopic: contentTopics.transactResponse(chain),
  };
};

export const tryDecryptData = async (
  encryptedData: EncryptedData,
  sharedKey: Uint8Array,
  // eslint-disable-next-line require-await
): Promise<object | null> => {
  return tryDecryptJSONDataWithSharedKey(encryptedData, sharedKey);
};

export const encryptResponseData = (
  data: object,
  sharedKey: Uint8Array,
): EncryptedData => {
  return encryptJSONDataWithSharedKey(data, sharedKey);
};
