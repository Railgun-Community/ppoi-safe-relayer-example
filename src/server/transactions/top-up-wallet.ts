import { TokenAmount } from '../../models/token-models';
import { ActiveWallet } from '../../models/wallet-models';
import { zeroXGetSwapQuote } from '../api/0x/0x-quote';
import { getERC20TokenBalance } from '../balances/erc20-token-balance';
import configNetworks from '../config/config-networks';
import { networkTokens } from '../tokens/network-tokens';
import {
  createEthersWallet,
  getRailgunWalletID,
} from '../wallets/active-wallets';
import { setWalletAvailability } from '../wallets/available-wallets';
import { unshieldTokens } from './unshield-tokens';
import { getProviderForNetwork } from '../providers/active-network-providers';
import { getCurrentNonce, waitForTx, waitForTxs } from './execute-transaction';
import { approveZeroX } from './approve-spender';
import configDefaults from '../config/config-defaults';
import { swapZeroX } from './0x-swap';
import {
  getPrivateTokenBalanceCache,
  ShieldedCachedBalance,
  updateShieldedBalances,
} from '../balances/shielded-balance-cache';
import { removeUndefineds } from '../../util/utils';
import { RelayerChain } from '../../models/chain-models';
import debug from 'debug';
import { isDefined } from '@railgun-community/quickstart';

const dbg = debug('relayer:topup');

const getPublicTokenAmountsAfterUnwrap = async (
  wallet: ActiveWallet,
  chain: RelayerChain,
): Promise<TokenAmount[]> => {
  const allTokens = networkTokens[chain.type][chain.id];
  const newPublicTokenAmounts: TokenAmount[] = await Promise.all(
    allTokens.map(async (token) => {
      const amt = await getERC20TokenBalance(chain, wallet.address, token);
      const tokenAmount: TokenAmount = {
        tokenAddress: token.address,
        amount: amt,
      };
      return tokenAmount;
    }),
  );
  return newPublicTokenAmounts;
};

const getShieldedTokenAmountsForChain = async (
  chain: RelayerChain,
): Promise<ShieldedCachedBalance[]> => {
  const fullRescan = false;
  await updateShieldedBalances(chain, fullRescan);
  const shieldedBalancesForChain = getPrivateTokenBalanceCache(chain);
  return shieldedBalancesForChain;
};

// Currently unused.
// export const filterTopUpTokens = (
//   topUpTokens: TokenAmount[],
// ): TokenAmount[] => {
//   // const desiredTopUpTokens = [];
//   // const desiredTopUpTokens: Optiona<TokenAmount>[] = await Promise.all (
//   //   topUpTokens.map( async (tokenAmount) => {
//   //       if (!configDefaults.topUps.shouldNotSwap.includes(tokenAmount.tokenAddress)){
//   //         return
//   //       }
//   //     }
//   //   )
//   // )
//   return [topUpTokens[0]];
// };

export const getTopUpTokenAmountsForChain = async (
  chain: RelayerChain,
): Promise<TokenAmount[]> => {
  const tokenAmountsForChain = await getShieldedTokenAmountsForChain(chain);

  const topUpTokenAmountsForChain: Optional<TokenAmount>[] = await Promise.all(
    tokenAmountsForChain.map(async (shieldedTokenCache) => {
      const gasTokenSymbol =
        configNetworks[chain.type][chain.id].gasToken.symbol;

      const tokenAmountInGasToken = await zeroXGetSwapQuote(
        chain,
        shieldedTokenCache.tokenAmount,
        gasTokenSymbol,
        configDefaults.topUps.toleratedSlippage,
      );
      try {
        if (
          isDefined(tokenAmountInGasToken.quote) &&
          tokenAmountInGasToken.quote.buyTokenAmount.amount.gt(
            configDefaults.topUps.swapThresholdIntoGasToken,
          )
        ) {
          return shieldedTokenCache.tokenAmount;
        }
        return undefined;
      } catch (err) {
        dbg(`Quote for token failed - ${err.message}`);
        throw err;
      }
    }),
  );
  return removeUndefineds(topUpTokenAmountsForChain);
};

export const topUpWallet = async (
  topUpWallet: ActiveWallet,
  chain: RelayerChain,
) => {
  const topUpTokens = await getTopUpTokenAmountsForChain(chain);

  if (topUpTokens.length === 0) {
    dbg(
      `No tokens to top up wallet ${topUpWallet.address} on chain ${chain.id}`,
    );
    return;
  }

  // begin topup
  dbg(
    `Begin top up for wallet with address ${topUpWallet.address} and index ${topUpWallet.index} on chain ${chain.type}:${chain.id}`,
  );

  const railgunWalletID = getRailgunWalletID();

  setWalletAvailability(topUpWallet, chain, false);
  const provider = getProviderForNetwork(chain);
  const ethersWallet = createEthersWallet(topUpWallet, provider);
  const nonce = await getCurrentNonce(chain, ethersWallet);

  // unshield tokens intended to swap
  const batchResponse = await unshieldTokens(
    railgunWalletID,
    configDefaults.engine.dbEncryptionKey,
    topUpWallet.address,
    topUpTokens,
    chain,
  );
  await waitForTx(topUpWallet, ethersWallet, chain, batchResponse, nonce);

  // get public balances
  const publicTokenAmounts = await getPublicTokenAmountsAfterUnwrap(
    topUpWallet,
    chain,
  );

  // perform approvals
  const approvalTxResponses = await approveZeroX(
    topUpWallet,
    publicTokenAmounts,
    chain,
  );
  await waitForTxs(topUpWallet, ethersWallet, chain, approvalTxResponses);
  dbg('Approvals complete');

  // perform swaps
  const swapTxResponses = await swapZeroX(
    topUpWallet,
    publicTokenAmounts,
    chain,
  );
  await waitForTxs(topUpWallet, ethersWallet, chain, swapTxResponses);

  // set wallet available and conclude
  setWalletAvailability(topUpWallet, chain, true);
  dbg('Topup complete');
};
