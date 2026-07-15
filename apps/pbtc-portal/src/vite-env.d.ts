interface ImportMetaEnv {
	readonly VITE_PULSECHAIN_CHAIN_ID?: string
	readonly VITE_PULSECHAIN_RPC_URL?: string
	readonly VITE_PBTC_TOKEN_ADDRESS?: string
	readonly VITE_BANK_ADDRESS?: string
	readonly VITE_BRIDGE_ADDRESS?: string
	readonly VITE_BTC_PRICE_USD?: string
	readonly VITE_TVL_API_URL?: string
	readonly VITE_BRIDGE_API_URL?: string
	readonly VITE_PULSECHAIN_NETWORK_NAME?: string
	readonly VITE_PULSECHAIN_EXPLORER_BASE_URL?: string
	readonly VITE_PULSECHAIN_CURRENCY_SYMBOL?: string
	readonly VITE_LIVE_BRIDGE?: string
}

interface ImportMeta {
	readonly env: ImportMetaEnv
}
