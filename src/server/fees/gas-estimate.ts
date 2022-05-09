import { BaseProvider } from '@ethersproject/providers';
import { BigNumber, PopulatedTransaction } from 'ethers';
import { EVMGasType } from '../../models/network-models';
import { throwErr } from '../../util/promise-utils';
import { NetworkChainID } from '../config/config-chain-ids';
import configNetworks from '../config/config-networks';
import { getProviderForNetwork } from '../providers/active-network-providers';
import { BAD_TOKEN_FEE_ERROR_MESSAGE } from './fee-validator';

export type TransactionGasDetails =
  | TransactionGasDetailsType0
  | TransactionGasDetailsType2;

export type TransactionGasDetailsType0 = {
  evmGasType: EVMGasType.Type0;
  gasEstimate: BigNumber;
  gasPrice: BigNumber;
};

export type TransactionGasDetailsType2 = {
  evmGasType: EVMGasType.Type2;
  gasEstimate: BigNumber;
  maxFeePerGas: BigNumber;
  maxPriorityFeePerGas: BigNumber;
};

const getEVMGasType = (chainID: NetworkChainID): EVMGasType => {
  const network = configNetworks[chainID];
  return network.evmGasType;
};

export const getEstimateGasDetails = async (
  chainID: NetworkChainID,
  populatedTransaction: PopulatedTransaction,
): Promise<TransactionGasDetails> => {
  try {
    const provider = getProviderForNetwork(chainID);
    const [gasEstimate, feeData] = await Promise.all([
      provider.estimateGas(populatedTransaction).catch(throwErr),
      getProviderFeeData(chainID, provider),
    ]);

    return { gasEstimate, ...feeData };
  } catch (err) {
    if (err.message && err.message.includes('failed to meet quorum')) {
      throw new Error(BAD_TOKEN_FEE_ERROR_MESSAGE);
    }
    throw err;
  }
};

export const getProviderFeeData = async (
  chainID: NetworkChainID,
  provider: BaseProvider,
): Promise<
  | { evmGasType: EVMGasType.Type0; gasPrice: BigNumber }
  | {
      evmGasType: EVMGasType.Type2;
      maxFeePerGas: BigNumber;
      maxPriorityFeePerGas: BigNumber;
    }
> => {
  const { maxFeePerGas, maxPriorityFeePerGas, gasPrice } =
    await provider.getFeeData();

  const evmGasType = getEVMGasType(chainID);

  switch (evmGasType) {
    case EVMGasType.Type0: {
      if (gasPrice == null) {
        throw new Error(
          'Could not fetch EVM Type 1 fee data for this transaction.',
        );
      }
      return { evmGasType, gasPrice };
    }
    case EVMGasType.Type2: {
      if (maxFeePerGas == null || maxPriorityFeePerGas == null) {
        throw new Error(
          'Could not fetch EVM Type 2 fee data for this transaction.',
        );
      }
      return { evmGasType, maxFeePerGas, maxPriorityFeePerGas };
    }
  }
  throw new Error('Unrecognized gas type.');
};

export const calculateGasLimit = (gasEstimate: BigNumber): BigNumber => {
  // Gas Limit: Add 20% to gas estimate.
  return gasEstimate.mul(12000).div(10000);
};

const calculateGasPrice = (gasDetails: TransactionGasDetails) => {
  switch (gasDetails.evmGasType) {
    case EVMGasType.Type0: {
      return gasDetails.gasPrice;
    }
    case EVMGasType.Type2: {
      const { maxFeePerGas, maxPriorityFeePerGas } = gasDetails;
      return maxFeePerGas.add(maxPriorityFeePerGas);
    }
  }
  throw new Error('Unrecognized gas type.');
};

export const calculateTotalGas = (
  transactionGasDetails: TransactionGasDetails,
) => {
  const gasPrice = calculateGasPrice(transactionGasDetails);
  const { gasEstimate } = transactionGasDetails;
  return gasEstimate.mul(gasPrice);
};

export const calculateMaximumGas = (
  transactionGasDetails: TransactionGasDetails,
): BigNumber => {
  const gasPrice = calculateGasPrice(transactionGasDetails);
  const { gasEstimate } = transactionGasDetails;
  return calculateGasLimit(gasEstimate).mul(gasPrice);
};
