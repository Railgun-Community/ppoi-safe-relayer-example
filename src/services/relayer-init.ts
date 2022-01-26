import { initWallets } from './wallets/active-wallets';
import { initNetworkProviders } from './providers/active-network-providers';
import { initPricePoller } from './tokens/token-price-poller';

export const initRelayer = () => {
  initWallets();
  initNetworkProviders();
  initPricePoller();
};