[![Node.js CI Actions Status](https://github.com/Railgun-Community/relayer/actions/workflows/node.js.yml/badge.svg?branch=master)](https://github.com/Railgun-Community/relayer/actions)

# Transaction anonymizing relayer for RAILGUN

The RAILGUN relayer network runs on [Waku](https://wakunetwork.com/), a secure and decentralized messaging protocol.

`relayer` is a node application which relays transactions for RAILGUN users so that their transactions are signed by your address rather than their own. Your relayer will broadcast fees on the tokens you configure it to accept at the rates you define. Messages are sent over the waku peer to peer network.

## Prerequisites

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
- `BASEDOMAIN` - If your full domain were 'relayer.railgun.org, this would be 'railgun.org'
- `SUBDOMAIN` - If your domain were `relayer.railgun.org', this would be 'relayer'
- `TZ` - timezone code; eg 'EST'
- `EMAIL` - letsencrypt will generate an SSL certificate for your domain; an email address must be entered. Whether you enter a real email address or a fake one is up to you

### relayer

#### Init

Customize your relayer by running `npm run copy-my-config`, which copies `src/MY-CONFIG.ts.example` to `src/MY-CONFIG.ts`.

#### Configuration

The standard relayer configurations are set in config files in `src/server/config/`. All of these can be overridden in `src/MY-CONFIG.ts`. The following are the most common fields that you might want to edit.

- configDefaults.networks.active

Configure the networks on which you want to run a relayer. Simply add or remove networks from `configDefaults.networks.active`

```
import {NetworkChainID} from './server/config/config-chain-ids';

configDefaults.networks.active = [
    NetworkChainID.Ropsten,
    NetworkChainID.Ethereum,
    NetworkChainID.BNBChain,
  ];
```

- configDefaults.waku.rpcURL

Specify a waku server to use for your relayer's p2p communication. It defaults to http://localhost:8546

```
configDefaults.waku.rpcURL = 'http://127.0.0.1:8546'
```

- configDefaults.wallet.mnemonic

Set the mnemonic used to fund the relayer

```
configDefaults.wallet.mnemonic = "word1 word2  ..."
```

- configDefaults.wallet.hdWallets

Set the derivation paths you want to use

```
configDefaults.wallet.hdWallets = [
    {
      index: 0,
      priority: 1,
    },
  ];
```

- configNetworks

Set network provider

```
configNetworks[ChainType.EVM][NetworkChainID.Ethereum].fallbackProviderConfig.providers.unshift({
      provider: 'http://<IP>:<PORT>',
      priority: 1,
      weight: 1,
});
```

- configTokens

Set the tokens you want to accept for each network.

```
configTokens[ChainType.EVM][NetworkChainID.Ethereum]['0x_token_address'] = {
    symbol: 'TOKEN1',
  };
```

## Run RAILGUN relayer

- `npm run copy-my-config`, run in root
- Make config changes to src/MY-CONFIG.ts
- `npm install`
- `npm start` or
- `npm run debug` (DEBUG mode, with logs)

## Use docker

- Prereqs: Install docker
- Create a secret key (`NODEKEY`) for your node. This is not currently used for encryption, but does establish your node's identity: `scripts/nodekey.sh`
- Know your external IP (`EXTIP`) and verify that ports 60000 and 8000 are exposed to the outside world (see https://www.canyouseeme.org/ or similar).
- If you have a stable ip and domain and would like to join the community fleet of bootstrap nodes, be sure to enter your `BASEDOMAIN` and optionally `SUBDOMAIN`. The `swag` service will automatically generate an SSL certificate for you through letsencrypt.

### docker stack

- Initialize docker swarm if you don't already have one:

      docker swarm init

- Generate `DB_ENCRYPTION_KEY` docker secret. Do not use password `sw0rdf1sh`. This is an example. Change it to your own. This command hashes your password to 32 bytes and wrangles it into the docker secret.

      echo "sw0rdf1sh" -n | sha256sum | awk '{print $1}' | docker secret create DB_ENCRYPTION_KEY -

- Generate `NODEKEY` docker secret:

      scripts/nodekey.sh | docker secret create NODEKEY -

- Register `MNEMONIC` docker secret. This is an example. Your actual mnemonic is not 'my mnemonic words...'

      echo "my mnemonic words..." | docker secret create MNEMONIC -

- Run docker/build.sh to build the `relayer` and `nwaku` docker images from your `docker/.env` environment definition

      docker/build.sh

- Deploy stack with `./docker/run.sh`:

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

### regular docker

- copy `docker/.env.empty` to `docker/.env` and fill in `EXTIP`, `NODEKEY`, `LISTENIP` (see above)

- build image and config.toml from your .env file:

      docker/build.sh

- run image interactively (useful for first setup):

      docker run -p 8546:8546 -p 60000:60000 -p 8000:8000 -it nwaku

- run image in background/detached:

      docker run -p 8546:8546 -p 60000:60000 -p 8000:8000 -d nwaku

- verify that you can communicate with your nwaku instance over json-rpc:

      scripts/nwaku/whoami.sh

- verify that nwaku is connected to other nwaku nodes:

      scripts/nwaku/peers.sh

## Diagnostics

- should be able to run ./scripts/nwaku/whoami.sh and see something like:

```
{
  "listenAddresses": [
    "/dns4/relayer.of.holdings/tcp/60000/p2p/16Uiu2HAmMUjGmiUhJeiZgu6ZZnLRkE2VViR2JgjqtW9aTZnHQqgg",
    "/dns4/relayer.of.holdings/tcp/8000/ws/p2p/16Uiu2HAmMUjGmiUhJeiZgu6ZZnLRkE2VViR2JgjqtW9aTZnHQqgg"
  ],
  "enrUri": "enr:-LO4QGvrbg2hqZnqdOFxGVZnDs9U2PWMkwfQUJdbjWixYkzUC8WOAkZXSlM3E4zxC-sh0yPcrYoiwrjooS2egIqnWnsBgmlkgnY0gmlwhKdH8B6KbXVsdGlhZGRyc5wAGjYTcmVsYXllci5vZi5ob2xkaW5ncwYfQN0DiXNlY3AyNTZrMaEDgxhTW1QQXUp6rmDAj8RflocYG0_fxiW9GnU_pzl_7XWDdGNwgupghXdha3UyDw"
}
```

- should be able to run ./scripts/nwaku/peers.sh and see something like:

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

## Run tests

- `npm run test`
- `npm run test-coverage` (with code coverage visualizer)

## Monitoring with prometheus and grafana

- Open port 3000 to the public. This port will be password authenticated, so nobody without the password will be able to see your monitoring
- Allow monitoring in MY-CONFIG.ts

```
  configDefaults.monitoring.shouldMonitor = true;
```

- Set monitoring password in docker/grafana/config/grafana.ini
