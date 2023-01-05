import { Gauge, Counter } from 'prom-client';

export const gas_token_balance = new Gauge({
  name: 'gas_token_balance',
  help: 'latest relayer gas token balance at public address on specific chain',
  labelNames: ['chain_type', 'chain_id', 'derivation_index', 'address'],
});

export const shielded_token_balance = new Gauge({
  name: 'shielded_token_balance',
  help: 'latest relayer shielded token balances for chain',
  labelNames: ['chain_type', 'chain_id', 'token_address'],
});

export const relayed_transaction_count = new Counter({
  name: 'relayed_transaction_count',
  help: 'number of transactions relayed',
  labelNames: ['chain_type'],
});
