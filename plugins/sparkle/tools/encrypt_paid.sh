#!/bin/sh
# Encrypts assets/paid-pets.bin (gitignored) to paid-pets.bin.enc, which is committed. The key is in
# .paid-key (gitignored, keep a copy somewhere safe) and the repository secret SHIMEJI_PAID_KEY; the
# release workflow decrypts it before building, so public release ZIPs carry the purchased pets
# while git only ever holds ciphertext. Run after tools/build_paid_seasonal.py.
set -e
cd "$(dirname "$0")/.."
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass file:.paid-key -in assets/paid-pets.bin -out paid-pets.bin.enc
echo "Wrote paid-pets.bin.enc"
