import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { NetworkChainID } from '../../config/config-chain-ids';
import configNetworks from '../../config/config-networks';
import { initNetworkProviders } from '../../providers/active-network-providers';
import { getGasTokenBalance } from '../gas-token-balance';
import { getMockNetwork, getMockWalletAddress } from '../../../test/mocks.test';

chai.use(chaiAsPromised);
const { expect } = chai;

const MOCK_WALLET_ADDRESS = getMockWalletAddress();

describe('gas-token-balance', () => {
  before(() => {
    configNetworks[NetworkChainID.Ethereum] = getMockNetwork();
    initNetworkProviders();
  });

  it('Should pull gas token balance of live wallet', async () => {
    await expect(
      getGasTokenBalance(NetworkChainID.Ethereum, MOCK_WALLET_ADDRESS),
    ).to.not.be.rejected;
  }).timeout(10000);
}).timeout(30000);
