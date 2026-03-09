FROM node:18-alpine AS builder

WORKDIR /app

COPY package.json yarn.lock* ./
RUN if [ -f yarn.lock ]; then yarn install --frozen-lockfile; else npm ci; fi

COPY index.html ./
COPY tsconfig.json* ./
COPY vite.config.ts* ./
COPY public ./public
COPY src ./src

# Build args become env vars for Vite at build time
ARG VITE_PULSECHAIN_CHAIN_ID=943
ARG VITE_PULSECHAIN_RPC_URL=https://rpc.v4.testnet.pulsechain.com
ARG VITE_PULSECHAIN_NETWORK_NAME=Pulsechain Testnet
ARG VITE_PULSECHAIN_EXPLORER_BASE_URL=https://scan.v4.testnet.pulsechain.com
ARG VITE_PBTC_TOKEN_ADDRESS
ARG VITE_BANK_ADDRESS
ARG VITE_BRIDGE_ADDRESS
ARG VITE_BTC_PRICE_USD=95000
ARG VITE_BRIDGE_API_URL=http://localhost:3007
ARG VITE_TVL_API_URL

ENV VITE_PULSECHAIN_CHAIN_ID=$VITE_PULSECHAIN_CHAIN_ID
ENV VITE_PULSECHAIN_RPC_URL=$VITE_PULSECHAIN_RPC_URL
ENV VITE_PULSECHAIN_NETWORK_NAME=$VITE_PULSECHAIN_NETWORK_NAME
ENV VITE_PULSECHAIN_EXPLORER_BASE_URL=$VITE_PULSECHAIN_EXPLORER_BASE_URL
ENV VITE_PBTC_TOKEN_ADDRESS=$VITE_PBTC_TOKEN_ADDRESS
ENV VITE_BANK_ADDRESS=$VITE_BANK_ADDRESS
ENV VITE_BRIDGE_ADDRESS=$VITE_BRIDGE_ADDRESS
ENV VITE_BTC_PRICE_USD=$VITE_BTC_PRICE_USD
ENV VITE_BRIDGE_API_URL=$VITE_BRIDGE_API_URL
ENV VITE_TVL_API_URL=$VITE_TVL_API_URL

RUN npx vite build

FROM nginx:alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html

# SPA fallback: serve index.html for all routes
RUN printf 'server {\n  listen 80;\n  root /usr/share/nginx/html;\n  index index.html;\n  location / {\n    try_files $uri $uri/ /index.html;\n  }\n}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
