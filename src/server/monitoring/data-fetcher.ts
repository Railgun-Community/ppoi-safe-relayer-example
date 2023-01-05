import { getGasTokenBalance } from '../balances/gas-token-balance';
import { RelayerChain } from '../../models/chain-models';
import { gas_token_balance, shielded_token_balance } from './metrics';
import { getActiveWallets } from '../wallets/active-wallets';
import { configuredNetworkChains } from '../chains/network-chain-ids';
import { networkForChain } from '@railgun-community/shared-models';
import { getPrivateTokenBalanceCache } from '../balances/shielded-balance-cache';
import { BigNumber } from 'ethers';
import { TokenAmount } from '../../models/token-models';
import { networkTokens, tokenForAddress } from '../tokens/network-tokens';
import { chainTypeToString } from '../config/config-chains';
import configNetworks from '../config/config-networks';
import { formatUnits } from '@ethersproject/units';

const bigZero = BigNumber.from('0');

export const fetchShieldedBalances = (chain: RelayerChain): TokenAmount[] => {
  const privateTokenBalances = getPrivateTokenBalanceCache(chain);
  const tokensForChain = networkTokens[chain.type][chain.id];
  const shieldedAndZeroBalances: TokenAmount[] = tokensForChain.map((token) => {
    const shieldedBalance = privateTokenBalances.find(
      (balance) => balance.tokenAmount.tokenAddress === token.address,
    );
    if (shieldedBalance) {
      return {
        tokenAddress: shieldedBalance.tokenAmount.tokenAddress,
        amount: shieldedBalance.tokenAmount.amount,
      };
    }
    return {
      tokenAddress: token.address,
      amount: bigZero,
    };
  });
  return shieldedAndZeroBalances;
};

export const defaultValueForUndefineds = 0;

export const normalizeToChainUnit = (
  amount: BigNumber,
  chain: RelayerChain,
): number => {
  const network = networkForChain(chain);
  if (!network) {
    return defaultValueForUndefineds;
  }
  return Number(formatUnits(amount, network.baseToken.decimals));
};

export const normalizeToTokenUnit = (
  chain: RelayerChain,
  tokenAmount: TokenAmount,
): number => {
  const tokenObject = tokenForAddress(chain, tokenAmount.tokenAddress);
  return Number(formatUnits(tokenAmount.amount, tokenObject.decimals));
};

export const fetchGasBalances = async (
  chain: RelayerChain,
  walletAddress: string,
): Promise<number> => {
  const gasTokenBalance = await getGasTokenBalance(chain, walletAddress);
  if (!gasTokenBalance) {
    return defaultValueForUndefineds;
  }
  return normalizeToChainUnit(gasTokenBalance, chain);
};

export const collectMetrics = () => {
  // get chains and wallets to monitor
  const chains = configuredNetworkChains();
  const activeWallets = getActiveWallets();

  // collect gas balances
  chains.forEach((chain) => {
    activeWallets.forEach(async (wallet) => {
      const gasBalance = await fetchGasBalances(chain, wallet.address);
      gas_token_balance
        .labels(
          chainTypeToString(chain.type),
          configNetworks[chain.type][chain.id].name,
          wallet.index.toString(),
          wallet.address,
        )
        .set(gasBalance);
    });

    // collect shielded balances
    const shieldedBalances = fetchShieldedBalances(chain);
    shieldedBalances.forEach((balance) => {
      shielded_token_balance
        .labels(
          chainTypeToString(chain.type),
          configNetworks[chain.type][chain.id].name,
          balance.tokenAddress,
        )
        .set(normalizeToTokenUnit(chain, balance));
    });
  });
};
