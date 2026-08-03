#!/bin/sh
# Auto-load nvm and switch to the Node version in .nvmrc
# Sourced (not executed) so PATH changes take effect in the caller.

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"

if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
  nvm use --silent 2>/dev/null || nvm install
fi
