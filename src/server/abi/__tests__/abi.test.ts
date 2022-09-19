import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { configuredNetworkChains } from '../../chains/network-chain-ids';
import { abiForChainToken, abiForProxyContract } from '../abi';

chai.use(chaiAsPromised);
const { expect } = chai;

describe('abi', () => {
  it('Should get ABI for each network', () => {
    configuredNetworkChains().forEach((chain) => {
      const abi = abiForChainToken(chain);
      expect(abi).to.be.an('array');
    });
  });
  it('Should get ABI for Railgun proxy', () => {
    const abi = abiForProxyContract();
    expect(abi).to.be.an('array');
  });
}).timeout(10000);
