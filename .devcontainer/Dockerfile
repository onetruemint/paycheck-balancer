FROM mcr.microsoft.com/devcontainers/typescript-node:1-20-bookworm

# Watchman is required by Metro (React Native's bundler) for file watching
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends watchman \
    && apt-get clean -y && rm -rf /var/lib/apt/lists/*

# EAS CLI and Claude Code, available globally for the node user.
# The Expo CLI itself is a local project dependency, invoked via `npx expo`.
RUN npm install -g eas-cli @anthropic-ai/claude-code

USER node
