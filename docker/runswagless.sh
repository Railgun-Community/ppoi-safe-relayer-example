#!/bin/bash
cd -- "$( dirname -- "${BASH_SOURCE[0]}" )"
docker stack deploy -c docker-stack-swagless.yml -c custom.yml relayer
echo \n
docker stack services relayer
