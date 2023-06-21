import { isDefined } from '@railgun-community/quickstart';
import { CoingeckoNetworkID } from '../../../models/api-constants';
import { TokenPrice, TokenPriceUpdater } from '../../tokens/token-price-cache';
import { CoingeckoApiEndpoint, getCoingeckoData } from './coingecko-fetch';

type TokenAddressPrice = {
  tokenAddress: string;
  tokenPrice: TokenPrice;
};

type CoingeckoPriceData = {
  last_updated_at: number;
};
type CoingeckoPriceMap = MapType<CoingeckoPriceData>;

const tokenPriceArrayFromCoingeckoPriceMap = (
  coingeckoPriceMap: CoingeckoPriceMap,
  currency: string,
): TokenAddressPrice[] => {
  const tokenPrices: TokenAddressPrice[] = [];

  Object.keys(coingeckoPriceMap).forEach((tokenAddress) => {
    const coingeckoPriceData = coingeckoPriceMap[tokenAddress];
    if (!isDefined(coingeckoPriceData)) return; // Token price not found.

    tokenPrices.push({
      tokenAddress,
      tokenPrice: {
        updatedAt: coingeckoPriceData.last_updated_at * 1000, // Convert Sec to MSec
        price: Number((coingeckoPriceData as any)[currency]),
      },
    });
  });

  return tokenPrices;
};

const coingeckoPriceLookup = async (
  coingeckoNetworkId: CoingeckoNetworkID,
  tokenAddresses: string[],
): Promise<TokenAddressPrice[]> => {
  const currency = 'usd';
  const params = {
    contract_addresses: tokenAddresses.join(','),
    vs_currencies: currency,
    include_last_updated_at: true,
  };
  const coingeckoPriceMap: CoingeckoPriceMap = await getCoingeckoData(
    CoingeckoApiEndpoint.PriceLookup,
    coingeckoNetworkId,
    params,
  );

  const tokenPrices = tokenPriceArrayFromCoingeckoPriceMap(
    coingeckoPriceMap,
    currency,
  );
  return tokenPrices;
};

export const coingeckoUpdatePricesByAddresses = async (
  coingeckoNetworkId: CoingeckoNetworkID,
  tokenAddresses: string[],
  updater: TokenPriceUpdater,
): Promise<void> => {
  const batchSize = 50;
  for (let i = 0; i < tokenAddresses.length; i += batchSize) {
    const batch = tokenAddresses.slice(i, i + batchSize);
    // eslint-disable-next-line no-await-in-loop
    const batchTokenAddressPrices = await coingeckoPriceLookup(
      coingeckoNetworkId,
      batch,
    );
    batchTokenAddressPrices.forEach(({ tokenAddress, tokenPrice }) =>
      updater(tokenAddress, tokenPrice),
    );
  }
};
