/* globals describe, it, before, beforeEach, afterEach */
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { allNetworkChainIDs } from '../../chains/network-chain-ids';
import { abiForChain } from '../abi';

chai.use(chaiAsPromised);
const { expect } = chai;

describe('abi', () => {
  it('Should get ABI for each network', async () => {
    allNetworkChainIDs().forEach((chainID) => {
      const abi = abiForChain(chainID);
      expect(abi).to.be.an('array');
    });
  });
}).timeout(10000);