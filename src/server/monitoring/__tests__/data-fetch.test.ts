import { formatUnits } from '@ethersproject/units';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { BigNumber } from 'ethers';
import { getMockGoerliNetwork } from '../../../test/mocks.test';
import { testChainGoerli } from '../../../test/setup.test';
import { normalizeToChainUnit, normalizeToTokenUnit } from '../data-fetcher';

chai.use(chaiAsPromised);
const { expect } = chai;

const testNetwork = getMockGoerliNetwork();
const MOCK_CHAIN = testChainGoerli();

const MOCK_TOKEN_AMOUNT_UNDER_ONE = BigNumber.from(1); // 1 wei
const MOCK_TOKEN_AMOUNT_OVER_ONE = BigNumber.from(10)
  .pow(testNetwork.gasToken.decimals)
  .mul(3);

describe
  .only('data-fetcher', () => {
    before(async () => {});
    it('Should normalize token balances greater than one whole token properly for gas token and on chain token', () => {
      const normalizedNumber = normalizeToChainUnit(
        MOCK_TOKEN_AMOUNT_UNDER_ONE,
        MOCK_CHAIN,
      );
      expect(normalizedNumber).to.equal(1e-18);
    });

    it('Should normalize token balances greater than one whole token properly for gas token and on chain token', () => {
      const normalizedNumber = normalizeToChainUnit(
        MOCK_TOKEN_AMOUNT_OVER_ONE,
        MOCK_CHAIN,
      );
      expect(normalizedNumber).to.equal(3.0);
    });
  })
  .timeout(10000);
