#!/bin/sh
docker service create \
    --name relayer \
    --replicas 1 \
    --secret DB_ENCRYPTION_KEY \
    --env-file .env \
    relayer:latest