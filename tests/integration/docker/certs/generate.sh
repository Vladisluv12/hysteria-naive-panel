#!/bin/sh
# tests/integration/docker/certs/generate.sh
set -e
mkdir -p /certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /certs/ca.key -out /certs/ca.pem \
  -subj '/CN=TestCA'
openssl req -nodes -newkey rsa:2048 \
  -keyout /certs/server.key -out /certs/server.csr \
  -subj '/CN=test.localhost'
openssl x509 -req -days 365 \
  -in /certs/server.csr -CA /certs/ca.pem -CAkey /certs/ca.key \
  -set_serial 1 -out /certs/server.pem \
  -extfile /dev/stdin <<EOF
subjectAltName=DNS:test.localhost,DNS:localhost,IP:127.0.0.1
EOF
rm /certs/ca.key /certs/server.csr
chmod 644 /certs/*.pem /certs/*.key
echo "Certs generated"
