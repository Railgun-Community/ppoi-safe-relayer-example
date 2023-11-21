#!/bin/bash
echo ""
for ((i=1; i<=2; i++)); do
    key=$(openssl rand -hex 32)
    if grep -q "NODEKEY_${i}=" docker/.env; then
      echo "NODEKEY_${i} already exists in .env."
      if [ "$1" = "--set-secret" ]; then
        echo "Setting Docker Secret for NODEKEY_${i} 0x$key"
        echo "0x$key" | docker secret create NODEKEY_$i -
      else
        echo "Not Setting Docker Secret values, please run again with --set-secret if you havent already. Or manually set them."
      fi
    else
      echo "NODEKEY_${i}=0x${key}" >> docker/.env
      echo "NODEKEY_${i} created with value: 0x${key}"
    fi
done
echo ""
