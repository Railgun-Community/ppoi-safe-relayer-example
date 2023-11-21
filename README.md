[![Unit Tests](https://github.com/Railgun-Community/poi-safe-relayer-example/actions/workflows/unit-tests.yml/badge.svg?branch=main)](https://github.com/Railgun-Community/poi-safe-relayer-example/actions)

# Example code and tests for POI-Safe RAILGUN transactions

Example code to forward RAILGUN transactions to the blockchain. Uses the Waku messaging protocol, while guaranteeing a Proof Of Innocence for all transactions.

`poi-safe-relayer-example` is a node.js application that receives encrypted transactions from RAILGUN wallets equipped with Proof Of Innocence. The Relayer example verifies, signs and forwards the transactions to the blockchain. It will broadcast fees on the tokens you configure to accept at the rates defined in the config.

## Proof Of Innocence

Proof Of Innocence is validated on every transaction for the safety of users and wallets.

Proof of Innocence is verified through a Proof Of Spendability, which verifies a merkle proof guaranteeing that the UTXOs that are spent are part of the Proof Of Innocence inclusion set for each list.

This means that every fee that is gathered is guaranteed to be spendable by your wallet - and RAILGUN wallets without Proof Of Innocence will not be able to use the relayer to forward any transactions.

## Waku Messaging

This network runs on [Waku](https://wakunetwork.com/), a secure and decentralized messaging protocol. Encrypted messages are sent over the private waku peer-to-peer network.

# Setup

## Requirements

- node 16+
- docker, if using docker
- jq (cli utility for parsing json)

## Configuration

### nwaku

Create and edit docker/.env to define your environment. Start by copying docker/.env.empty to docker/.env, as this includes the needed fields.

      cp docker/.env.empty docker/.env

The fields to configure are described below. Note that you may leave the domain and email fields empty if not using a domain name.

- `EXTIP` - this is the IP address at which your system can be reached by the rest of the world
- `LISTENIP` - if your system has its own public ip, this is the same as `EXTIP`. If you are running inside docker or behind a router with NAT, this will be '0.0.0.0'

##### Required if running with Swag

- `BASEDOMAIN` - If your full domain were 'relayer.railgun.org, this would be 'railgun.org'
- `SUBDOMAIN` - If your domain were `relayer.railgun.org', this would be 'relayer'
- `TZ` - timezone code; eg 'EST'
- `EMAIL` - letsencrypt will generate an SSL certificate for your domain; an email address must be entered. Whether you enter a real email address or a fake one is up to you

### Init

Customize your node by running `npm run copy-my-config`, which copies `src/MY-CONFIG.ts.example` to `src/MY-CONFIG.ts`.

#### Configuration

The standard configurations are set in config files in `src/server/config/`. All of these can be overridden in `src/MY-CONFIG.ts`. The following are the most common fields that you might want to edit.

- configDefaults.networks.active

Configure the networks on which you want to run a relayer. Simply add or remove networks from `configDefaults.networks.active`

```ts
import { ChainType } from '@railgun-community/shared-models';
import { NetworkChainID } from './server/config/config-chain-ids';

export const myConfigOverrides = () => {
//...
configDefaults.networks.active = [
    NetworkChainID.Ropsten,
    NetworkChainID.Ethereum,
    NetworkChainID.BNBChain,
  ];
//...

```

- configDefaults.waku.rpcURL

Specify a waku server to use for your relayer's p2p communication. It defaults to http://localhost:8546.

```ts
//...
configDefaults.waku.rpcURL = 'http://nwaku1:8546';
configDefaults.waku.rpcURLBackup = 'http://nwaku2:8547';
```

- configDefaults.wallet.mnemonic

Set the mnemonic used for the wallets

```ts
//...
configDefaults.wallet.mnemonic = 'word1 word2  ...';
```

- configDefaults.wallet.hdWallets

Set the derivation paths you want to use

```ts
//...
configDefaults.wallet.hdWallets = [
  {
    index: 0,
    priority: 1,
  },
];
```

- configNetworks

Set network provider

```ts
//...
configNetworks[ChainType.EVM][
  NetworkChainID.Ethereum
].fallbackProviderConfig.providers.unshift({
  provider: 'http://<IP>:<PORT>',
  priority: 1,
  weight: 1,
});
```

- configTokens

Set the tokens you want to accept as fees on each network.

```ts
//...
configTokens[ChainType.EVM][NetworkChainID.Ethereum]['0x_token_address'] = {
  symbol: 'TOKEN1',
};
```

## Running Options:

### Docker stack

- Prereqs: Install docker
- Create a secret key (`NODEKEY_1 & NODEKEY_2`) for your node. This is not currently used for encryption, but does establish your node's identity: running `scripts/nodekey.sh` will generate these. (see below.)
- Know your external IP (`EXTIP`) and verify that ports 60000 and 8000 are exposed to the outside world (see https://www.canyouseeme.org/ or similar).
- If you have a stable ip and domain and would like to join the community fleet of bootstrap nodes, be sure to enter your `BASEDOMAIN` and optionally `SUBDOMAIN`. The `swag` service will automatically generate an SSL certificate for you through letsencrypt.

- Initialize docker swarm if you don't already have one:

      docker swarm init

- Generate `DB_ENCRYPTION_KEY` docker secret. Do not use password `sw0rdf1sh`. This is an example. Change it to your own. This command hashes your password to 32 bytes and wrangles it into the docker secret.

      echo "sw0rdf1sh" -n | sha256sum | awk '{print $1}' | docker secret create DB_ENCRYPTION_KEY -

- Generate `NODEKEY` docker secret:

```sh
      # step 1:
            ./scripts/nodekey.sh
      # this will generate NODEKEY_1 & NODEKEY_2
      # and fill them into .env if they're not already present.

      # Step 2:
            ./scripts/nodekey.sh --set-secret
      # This will run the above command, but store the secrets if they're already setup.
```

##### Manual Completion Example

```sh
echo "0xaf46f851e0d9c2f520c89ad95d67b5d098f1d79fae2fef3f562102eca9310a66" | docker secret create NODEKEY_1 - 
echo "0xc5af820e2fb37a65470a8a7c82ba415605c83009ffcbf87916707183942bbb68" | docker secret create NODEKEY_2 - 
# do not use these for your NODEKEYs
```

- Register `MNEMONIC` docker secret. This is an example. Your actual mnemonic is not 'my mnemonic words...'

      echo "my mnemonic words..." | docker secret create MNEMONIC -

- Run `docker/build.sh` to build the `relayer` and `nwaku` docker images from your `docker/.env` environment definition. This will compose a 'swag' version (`creates SSL certs for DOMAINS, only needed if you're using a domain`) and one that just uses the `$EXTIP` for its nwaku visibility.

```sh
      ./docker/build.sh                 # builds the swag docker stack
      ./docker/build.sh --no-swag       # builds swagless docker stack
```

- Deploy stack with `./docker/run.sh`:
- Deploy `SWAGLESS` stack with `./docker/runswagless.sh`:

        $ ./docker/run.sh

        Creating network relayer_relayer
        Creating service relayer_relayer
        Creating service relayer_swag
        Creating service relayer_nwaku

If you get an error about the `relayer_relayer` network not existing, just execute `docker/run.sh` again until it works. This is a known issue with docker, but you may need to do it 5 times. Just press up instead of typing it again.

- Stop stack:

      docker/stop.sh

- View logs. append with `-f` to follow

      docker service logs relayer_relayer       # relayer logs
      docker service logs relayer_nwaku         # nwaku network node
      docker service logs relayer_swag          # letsencrypt generation

<br>

## Regular :

### 1. setup & start docker nwaku

- copy `docker/.env.empty` to `docker/.env` and fill in `EXTIP`, `NODEKEY`, `LISTENIP` (see above)

- build image and config.toml from your .env file:

      docker/build.sh

- run image interactively (useful for first setup): replace `$EXTIP` with your external IP.

      docker run -p 8546:8546 -p 60000:60000 -p 8000:8000 -it nwaku --config-file=/app/config.toml --nat="extip:$EXTIP"

- run image in background/detached: replace `$EXTIP` with your external IP.

      docker run -p 8546:8546 -p 60000:60000 -p 8000:8000 -d nwaku --config-file=/app/config.toml --nat="extip:$EXTIP"

- verify that you can communicate with your nwaku instance over json-rpc:

`scripts/nwaku/whoami.sh`

- verify that nwaku is connected to other nwaku nodes:

`scripts/nwaku/peers.sh`

## Diagnostics

- run `./scripts/nwaku/whoami.sh` and see something like:

```
{
  "listenAddresses": [
    "/dns4/relayer.of.holdings/tcp/60000/p2p/16Uiu2HAmMUjGmiUhJeiZgu6ZZnLRkE2VViR2JgjqtW9aTZnHQqgg",
    "/dns4/relayer.of.holdings/tcp/8000/ws/p2p/16Uiu2HAmMUjGmiUhJeiZgu6ZZnLRkE2VViR2JgjqtW9aTZnHQqgg"
  ],
  "enrUri": "enr:-LO4QGvrbg2hqZnqdOFxGVZnDs9U2PWMkwfQUJdbjWixYkzUC8WOAkZXSlM3E4zxC-sh0yPcrYoiwrjooS2egIqnWnsBgmlkgnY0gmlwhKdH8B6KbXVsdGlhZGRyc5wAGjYTcmVsYXllci5vZi5ob2xkaW5ncwYfQN0DiXNlY3AyNTZrMaEDgxhTW1QQXUp6rmDAj8RflocYG0_fxiW9GnU_pzl_7XWDdGNwgupghXdha3UyDw"
}
```

- run `./scripts/nwaku/peers.sh` and see something like:

```
[
  {
    "multiaddr": "/dns4/node-01.do-ams3.status.prod.statusim.net/tcp/30303/p2p/16Uiu2HAm6HZZr7aToTvEBPpiys4UxajCTU97zj5v7RNR2gbniy1D",
    "protocol": "/vac/waku/relay/2.0.0",
    "connected": true
  },
  {
    "multiaddr": "/dns4/node-01.gc-us-central1-a.status.prod.statusim.net/tcp/30303/p2p/16Uiu2HAkwBp8T6G77kQXSNMnxgaMky1JeyML5yqoTHRM8dbeCBNb",
    "protocol": "/vac/waku/relay/2.0.0",
    "connected": false
  },
  {
    "multiaddr": "/dns4/relayer.railgun.org/tcp/60000/p2p/16Uiu2HAmNy49QzXVWHMdhz7DQHXCpk9sHvVua99j3QcShUK8PVSD",
    "protocol": "/vac/waku/relay/2.0.0",
    "connected": true
  }
]
```

- Monitor logs with commands like

  - `docker service logs relayer_nwaku`
  - `docker service logs relayer_relayer`
  - `docker service logs relayer_swag`

- In the event that services were restarted, the logs shown by the above commands may not be the true logs. If in doubt, execute:
  - `docker container ps`
  - This will show a list of running containers. The first column is the id of the container. You can generally refernce it with the first two characters of the id.
  - `docker logs 34` (where `34` are the first two characters of the container id)

```
 CONTAINER ID   IMAGE                             COMMAND                  CREATED       STATUS       PORTS                            NAMES
345265257f8f   relayer:latest                    "docker-entrypoint.s…"   5 hours ago   Up 5 hours                                    relayer_relayer.1.k8e9vk23lhzi79g3vcu02wtr9
8fe5803a4314   nwaku:latest                      "wakunode2 --config-…"   5 hours ago   Up 5 hours   8545/tcp, 30303/tcp, 60000/tcp   relayer_nwaku.1.5kfe0bcahwbb95bdqxmqgx6ak
4e76b7e1cd3d   ghcr.io/linuxserver/swag:latest   "/init"                  5 hours ago   Up 5 hours   80/tcp, 443/tcp                  relayer_swag.1.cmi0mo0r1fto3mbsz7iyfsms
```

## Run unit/integration tests

- `yarn test`
- `yarn test-coverage` (with code coverage visualizer)
