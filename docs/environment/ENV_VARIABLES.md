# Environment Variables Documentation

## 📋 Overview

This document explains all environment variables used in the NFT Marketplace application, their purposes, and configuration guidelines.

## 🗂️ File Structure

```
.env                        # Team-wide defaults (committed to git)
.env.local                  # Local development (NEVER commit!)
.env.production.local       # Production overrides (NEVER commit!)
.env.local.template         # Template for local setup
.env.production.template    # Template for production deployment
```

## 🔐 Security Best Practices

### ✅ DO:

- ✓ Keep `.env.local` and `.env.production.local` in `.gitignore`
- ✓ Use strong, unique secrets for production (64+ characters)
- ✓ Rotate API keys regularly
- ✓ Configure rate limits in provider dashboards
- ✓ Use checksummed addresses (correct capitalization)
- ✓ Review all `NEXT_PUBLIC_` variables (they're exposed to browser!)

### ❌ DON'T:

- ✗ Commit secrets to git
- ✗ Share API keys via chat/email
- ✗ Use the same keys for dev/prod
- ✗ Expose database credentials in `NEXT_PUBLIC_` variables
- ✗ Hard-code secrets in source files

---

## 📚 Variable Reference

### 1️⃣ Database Configuration

#### `MONGODB_URI` (Server-Side)

- **Purpose:** MongoDB connection string
- **Type:** Secret
- **Required:** Yes
- **Format:** `mongodb+srv://user:pass@cluster.mongodb.net/db?options`
- **Example:** `mongodb+srv://<USERNAME>:<PASSWORD>@<CLUSTER>.mongodb.net/<DB_NAME>?retryWrites=true&w=majority`
- **Notes:**
  - Contains credentials - NEVER expose to client!
  - Use connection pooling for production
  - Enable IP whitelist in MongoDB Atlas

#### `MONGODB_DB` (Server-Side)

- **Purpose:** Database name
- **Type:** Configuration
- **Required:** Yes
- **Default:** `Ideationmarket_v2`
- **Example:** `IdeationMarket_Production`

### 1️⃣b Redis Configuration (Optional, empfohlen für Skalierung)

#### `REDIS_URL` (Server-Side)

- **Purpose:** Redis connection string for shared cache + distributed rate limiting
- **Type:** Secret
- **Required:** No (fallback to in-memory when unset)
- **Format:** `redis://...` or `rediss://...`
- **Example:** `rediss://default:password@your-redis-host:6379`

#### `REDIS_SSE_CHANNEL` (Server-Side)

- **Purpose:** Redis-Pub/Sub-Kanal, über den die Instanzen ihre SSE-Ereignisse
  austauschen (`src/services/sse/broadcast.ts`).
- **Type:** Config
- **Required:** **Yes, je Umgebung explizit** (V64). Es gibt **keinen**
  Rückfallwert mehr. Begründung: teilen zwei Umgebungen eine Redis-Instanz,
  würde ein gemeinsamer Standardkanal die Ereignisse der einen still in die
  andere tragen — ein Fehler, der sich nicht als Fehler zeigt, sondern als
  unerklärliche Aktualisierung in der falschen Umgebung.
- **Format:** freier Kanalname, der die Umgebung benennt
- **Example:** `marketplace:alpha:sse:events`
- **Runtime or Build:** Runtime
- **Notes:**
   - Strongly recommended for multi-instance deployments
   - Enables cross-instance cache hits and global API throttling
   - Keep credentials server-side only

#### `REDIS_DISABLED` (Server-Side)

- **Purpose:** Force-disable Redis integration without removing `REDIS_URL`
- **Type:** Feature flag
- **Required:** No
- **Options:** `true`, `false`
- **Default:** `false`

#### `REDIS_SSE_CHANNEL` (Server-Side)

- **Purpose:** Redis Pub/Sub channel for marketplace SSE fanout
- **Type:** Configuration
- **Required:** No
- **Default:** `marketplace:sse:events`
- **Notes:**
   - Useful when multiple environments share one Redis cluster
   - Keep different channel names for staging/production isolation

---

### 2️⃣ Authentication & Security

#### `JWT_SECRET` (Server-Side)

- **Purpose:** Secret key for JWT token signing
- **Type:** Secret (Critical!)
- **Required:** Yes
- **Format:** Minimum 32 characters, alphanumeric
- **Generate:** `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- **Example:** `a1b2c3d4e5f6...` (64 characters)
- **Notes:**
  - Use different secrets for dev/prod
  - Rotate regularly (invalidates all sessions)
  - Never commit to git!

---

### 3️⃣ Blockchain RPC Endpoints

#### Server-Side RPC (Backend Only)

##### `JSON_RPC_URL`

- **Purpose:** Primary RPC endpoint for server operations
- **Type:** Secret (contains API key)
- **Required:** Yes
- **Providers:** Alchemy, Infura, QuickNode
- **Example:** `https://eth-sepolia.g.alchemy.com/v2/<ALCHEMY_API_KEY>`

##### `ALCHEMY_URL` / `ALCHEMY_URL_WSS`

- **Purpose:** Alchemy HTTP & WebSocket endpoints
- **Type:** Secret
- **Format:**
  - HTTP: `https://eth-sepolia.g.alchemy.com/v2/{API_KEY}`
  - WSS: `wss://eth-sepolia.g.alchemy.com/v2/{API_KEY}`

##### `INFURA_URL` / `INFURA_URL_WSS`

- **Purpose:** Infura HTTP & WebSocket endpoints
- **Type:** Secret
- **Format:**
  - HTTP: `https://sepolia.infura.io/v3/{PROJECT_ID}`
  - WSS: `wss://sepolia.infura.io/ws/v3/{PROJECT_ID}`

#### Client-Side RPC (Exposed to Browser)

##### `NEXT_PUBLIC_SEPOLIA_RPC_URL`

- **Purpose:** Client-side RPC for wallet interactions
- **Type:** Public (exposed to browser)
- **Required:** Yes
- **Security:** Configure rate limiting in provider dashboard
- **Example:** `https://eth-sepolia.g.alchemy.com/v2/PUBLIC_KEY`

##### `NEXT_PUBLIC_ALCHEMY_URL_WSS` / `NEXT_PUBLIC_INFURA_URL_WSS`

- **Purpose:** WebSocket endpoints for real-time events
- **Type:** Public
- **Usage:** Event listeners, transaction monitoring
- **Example:** `wss://sepolia.infura.io/ws/v3/PUBLIC_KEY`

##### `NEXT_PUBLIC_ALCHEMY_API_KEY` / `NEXT_PUBLIC_INFURA_API_KEY`

- **Purpose:** Direct API access from client
- **Type:** Public (rate-limited)
- **Security:** MUST have rate limits configured
- **Example:** `<PUBLIC_ALCHEMY_API_KEY>`

**⚠️ RPC Security Notes:**

- Use separate keys for client vs server
- Client keys should have lower rate limits
- Configure allowlists (domains, IPs) in provider dashboards
- Monitor usage to detect abuse

---

### 4️⃣ Wallet Connect Integration

#### `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`

#### `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID`

- **Purpose:** WalletConnect Cloud project identifier
- **Type:** Public
- **Required:** Yes (for mobile wallet connections)
- **Get From:** https://cloud.walletconnect.com
- **Example:** `<WALLETCONNECT_PROJECT_ID>`
- **Notes:**
  - Both variables used for compatibility
  - Configure allowed domains in WalletConnect dashboard
  - Free tier: 1M+ requests/month

---

### 5️⃣ Smart Contract Addresses

#### `NEXT_PUBLIC_MARKETPLACE_ADDRESS`

- **Purpose:** Diamond Marketplace contract address
- **Type:** Public (blockchain address)
- **Required:** Yes
- **Format:** Checksummed Ethereum address (0x...)
- **Example:** `0x1107Eb26D47A5bF88E9a9F97cbC7EA38c3E1D7EC`
- **Notes:**
  - Use Diamond proxy address, NOT facet addresses!
  - Verify on Etherscan before deployment
  - Different addresses for Sepolia/Mainnet

#### `NEXT_PUBLIC_MULTISIG_WALLET_ADDRESS`

- **Purpose:** MultiSig governance wallet
- **Type:** Public
- **Required:** No (optional feature)
- **Example:** `0xYourMultiSigAddressHere`

---

### 6️⃣ The Graph Subgraph Indexing

#### `NEXT_PUBLIC_SUBGRAPH_VERSION`

- **Purpose:** Active subgraph version identifier
- **Type:** Configuration
- **Options:** `v1`, `v2`
- **Default:** `v2`
- **Example:** `v2`

#### `NEXT_PUBLIC_SUBGRAPH_V2_URL`

- **Purpose:** The Graph API endpoint
- **Type:** Public
- **Required:** Yes
- **Format:** `https://api.studio.thegraph.com/query/{ACCOUNT}/{SUBGRAPH}/{VERSION}`
- **Example:** `https://api.studio.thegraph.com/query/46078/ideation-market/v0.1.2`
- **Notes:**
  - Studio (hosted): Free, rate-limited
  - Decentralized: Pay per query, censorship-resistant

#### `NEXT_PUBLIC_SUBGRAPH_V2_DEPLOY_KEY`

- **Purpose:** Deploy key for subgraph updates
- **Type:** Secret
- **Required:** Only for CI/CD deployment
- **Example:** `<SUBGRAPH_DEPLOY_KEY>`
- **Security:** Never commit! Use in CI/CD secrets only

#### `USE_GRAPH_SUBSCRIPTIONS`

- **Purpose:** Enable WebSocket subscriptions
- **Type:** Feature flag
- **Options:** `true`, `false`
- **Default:** `false`
- **Status:** Deprecated (replaced by polling)

---

### 7️⃣ Exchange Rates & Pricing

#### `NEXT_PUBLIC_COINBASE_API_URL`

- **Purpose:** Coinbase exchange rate API
- **Type:** Public endpoint
- **Default:** `https://api.coinbase.com/v2/exchange-rates`
- **Usage:** Fallback price source

#### `NEXT_PUBLIC_CRYPTOCOMPARE_API_URL`

- **Purpose:** CryptoCompare price feed
- **Type:** Public endpoint
- **Default:** `https://min-api.cryptocompare.com/data/pricemulti`
- **Usage:** Primary price source

#### `NEXT_PUBLIC_EXCHANGE_RATE_CACHE_HOURS`

- **Purpose:** Cache duration for exchange rates
- **Type:** Configuration
- **Default:** `24` (hours)

---

### 8️⃣ DEX Aggregation (1inch)

#### `ONEINCH_API_KEY` (Server-Side)

- **Purpose:** API key for 1inch Aggregation API (quote/swap endpoints)
- **Type:** Secret
- **Required:** Yes (for 1inch integration)
- **Usage:** Backend-only in `/api/integrations/1inch/*` routes
- **Security:** Never expose to client, do NOT use `NEXT_PUBLIC_`

#### `ONE_INCH_API_KEY` (Server-Side, fallback)

- **Purpose:** Backward-compatible alternate env name
- **Type:** Secret
- **Required:** Optional (only used if `ONEINCH_API_KEY` is not set)
- **Usage:** Same as `ONEINCH_API_KEY`, kept for compatibility

#### `NEXT_PUBLIC_EXCHANGE_RATE_UPDATE_INTERVAL_HOURS`

- **Purpose:** Background update frequency
- **Type:** Configuration
- **Default:** `6` (hours)
- **Range:** 1-24

#### `NEXT_PUBLIC_CURRENCY_DEBUG_MODE`

- **Purpose:** Enable verbose logging for currency operations
- **Type:** Feature flag
- **Options:** `true`, `false`
- **Default:** `false`
- **Usage:** Development debugging only

---

### 9️⃣ Access Control & Admin Configuration

#### `NEXT_PUBLIC_MULTISIG_OWNER_ADDRESSES`

- **Purpose:** Primary admin addresses (mirror of MultiSig wallet owners)
- **Type:** Public (blockchain addresses)
- **Required:** Recommended (primary source)
- **Format:** Comma-separated checksummed addresses (no spaces)
- **Example:** `0x8BbA5E9b30E986C55465fEaC4D3417791065d1bb,0xf034e8ad11F249c8081d9da94852bE1734bc11a4`
- **Notes:**
  - Intended to match current `getOwners()` result of the MultiSig wallet.
  - If configured, admin set is: `MULTISIG_OWNER_ADDRESSES ∪ INSIGHTS_ADMIN_ADDRESSES`.

#### `NEXT_PUBLIC_INSIGHTS_ADMIN_ADDRESSES`

- **Purpose:** Additional admin addresses (break-glass / temporary / service accounts)
- **Type:** Public (blockchain addresses)
- **Required:** Optional
- **Format:** Comma-separated checksummed addresses (no spaces!)
- **Example:** `0x8BbA5E9b30E986C55465fEaC4D3417791065d1bb,0xf034e8ad11F249c8081d9da94852bE1734bc11a4`
- **Privileges (combined admin set):**
  - Create/edit NFT insights
  - Access admin dashboard
  - View system health
  - Manage marketplace settings
- **Fallback behavior:**
  - If `NEXT_PUBLIC_MULTISIG_OWNER_ADDRESSES` is empty, legacy admin behavior uses configured admin addresses only.

#### `NEXT_PUBLIC_INSIGHTS_READ_ONLY_MODE`

- **Purpose:** Disable admin modifications
- **Type:** Feature flag
- **Options:** `true`, `false`
- **Default:** `false`
- **Usage:** Maintenance mode, audits

#### `NEXT_PUBLIC_APP_LOCK_ENABLED`

- **Purpose:** Restrict entire app to admin wallets only
- **Type:** Feature flag
- **Options:** `true`, `false`
- **Default:** `false`
- **Usage:** Beta testing, emergency lockdown

---

### 8️⃣b NFT Data Platform (Paket A1/A2)

Alle Variablen dieses Abschnitts sind **ausschließlich serverseitig**. Keine davon
darf ein `NEXT_PUBLIC_`-Gegenstück bekommen (V14): Secret und Signatur gehören
nie in den Browser-Bundle. `scripts/check-env.js` meldet einen solchen Spiegel
als Fehler.

Gelesen werden sie an genau einer Stelle: `src/lib/nft-data-platform/config.ts`.
Dort liegt auch der **verbindliche** Nachweis für V14 — die Funktion
`getPlatformConfig()` läuft im echten Prozess, wirft beim ersten Aufruf und nennt
alle fehlenden Namen auf einmal. `npm run env:check` prüft dagegen eine Datei und
belegt in einer Umgebung, in der der Hoster die Variablen injiziert, nichts
(Entscheidung E4, `state/plan-v2-plattform-integration.md` Abschnitt 6).

#### `NFT_DATA_PLATFORM_ENABLED` (Server-Side)

- **Purpose:** Schaltet den Datenbezug über die NFT Data Platform ein. Ist das
  Flag aus, erzeugt kein Pfad einen Plattform-Aufruf und keine der Variablen
  unten ist Pflicht.
- **Type:** Flag
- **Required:** No (ohne Angabe gilt: aus)
- **Format:** **Streng** — nur `true` oder `1` gelten als an. `TRUE`, `yes`,
  `on`, Leerstring oder ein Tippfehler gelten als **aus**. Begründung: ein Flag,
  das bei Tippfehlern „an" bedeutet, stellt eine Datenquelle scharf, die niemand
  scharf stellen wollte.
- **Example:** `true`
- **Runtime or Build:** Runtime

#### Pflichtvariablen, wenn das Flag an ist

| Name | Purpose | Type | Example |
|---|---|---|---|
| `NFT_API_BASE_URL` | Basis-URL der Plattform, ohne Pfad | URL | `https://nft-api.example.test` |
| `NFT_API_READ_CLIENT_ID` | Client-ID des Lese-Clients (`alpha-read`) | ID | `alpha-read` |
| `NFT_API_READ_KEY` | API-Key des Lese-Clients | Secret | `<READ_KEY>` |
| `NFT_API_READ_SECRET` | HMAC-Secret des Lese-Clients | Secret | `<READ_SECRET>` |
| `NFT_API_OPS_CLIENT_ID` | Client-ID des Ops-Clients (`alpha-ops`) | ID | `alpha-ops` |
| `NFT_API_OPS_KEY` | API-Key des Ops-Clients | Secret | `<OPS_KEY>` |
| `NFT_API_OPS_SECRET` | HMAC-Secret des Ops-Clients | Secret | `<OPS_SECRET>` |

Zwei Zugangsdatensätze, nicht einer (Entscheidung 14 der Spec, V15): Lesen,
Discover und Token-Refresh laufen über **read** mit 600 Anfragen pro Minute, die
Collection-Registrierung über **ops** mit 30. Die Zugangsdaten werden **je
Umgebung** vergeben; die der Alpha gelten nicht für die Produktion. Der
Bootstrap-Client der Plattform wird nie benutzt.

#### Optionale Stellwerte

Alle haben einen Standardwert im Code. Sie existieren, damit die Messung aus V34
die Startwerte korrigieren kann, **ohne** dass Code geändert werden muss.

| Name | Purpose | Default |
|---|---|---|
| `NFT_API_TIMEOUT_MS` | Timeout je Anfrage | `10000` |
| `NFT_API_MAX_ATTEMPTS` | Versuche je Anfrage, Wiederholungen eingeschlossen | `3` |
| `NFT_API_READ_LIMIT_PER_MINUTE` | Fensterlimit des Lese-Clients | `600` |
| `NFT_API_READ_CONCURRENCY` | gleichzeitige Anfragen des Lese-Clients | `8` |
| `NFT_API_OPS_LIMIT_PER_MINUTE` | Fensterlimit des Ops-Clients | `30` |
| `NFT_API_OPS_CONCURRENCY` | gleichzeitige Anfragen des Ops-Clients | `2` |

**Warum der Deckel bei 8 liegt:** 600 Anfragen pro Minute sind 10 pro Sekunde.
Bei 8 gleichzeitigen müsste jede unter 800 ms liegen, um das Fenster zu füllen —
der Deckel bremst also erst, wenn die Plattform ohnehin langsamer ist als das
Limit erlaubt. **Achtung bei mehreren Prozessen:** Budget und Deckel liegen im
Prozess, das Limit gilt je Client über alle Instanzen. Web und Worker zählen
getrennt, erlauben sich also zusammen das Doppelte. Geführt in
`state/assumption-ledger.md` (13.10.2026); erkennbar an `sentInWindow` im
Protokoll neben `remaining`.

---

### 9️⃣ External API Integrations

#### `GOOGLE_API_KEY`

- **Purpose:** Google Cloud API access (Maps, Analytics, etc.)
- **Type:** Secret
- **Required:** No (optional features)
- **Example:** `<GOOGLE_API_KEY>`
- **Services:**
  - Google Maps (location-based features)
  - Google Analytics (usage tracking)
- **Security:** Configure API restrictions in Google Cloud Console

---

### 🔟 Build & Deployment Configuration

#### `NODE_ENV`

- **Purpose:** Node.js environment mode
- **Type:** System configuration
- **Options:** `development`, `production`, `test`
- **Auto-set:** Usually by deployment platform
- **Notes:**
  - `development`: Full error messages, hot reload
  - `production`: Optimized builds, error tracking

#### `NEXT_SHARP_PATH`

- **Purpose:** Sharp image library path (Docker/Railway)
- **Type:** System configuration
- **Default:** `/tmp/node_modules/sharp`
- **Required:** Only for containerized deployments
- **Notes:** Fixes sharp library loading in read-only filesystems

#### `NEXT_PUBLIC_APP_NAME`

- **Purpose:** Application display name
- **Type:** Branding
- **Default:** `IdeationMarket`
- **Example:** `IdeationMarket`, `NFT Marketplace`

---

## 🚀 Environment Setup Guide

### Development Setup

1. **Copy Template:**

   ```bash
   cp .env.local.template .env.local
   ```

2. **Get API Keys:**
   - Alchemy: https://dashboard.alchemy.com
   - Infura: https://infura.io
   - WalletConnect: https://cloud.walletconnect.com
   - MongoDB: https://cloud.mongodb.com

3. **Fill Variables:**
   - Replace all `YOUR_*_KEY` placeholders
   - Use development/testnet values
   - Keep secrets local!

4. **Verify:**
   ```bash
   npm run dev
   ```

### Production Deployment

1. **Use Production Template:**

   ```bash
   cp .env.production.template .env.production.local
   ```

2. **Generate Secrets:**

   ```bash
   # JWT Secret
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```

3. **Configure Production APIs:**
   - Use production-tier Alchemy/Infura plans
   - Configure rate limits
   - Enable IP allowlists
   - Set up monitoring/alerts

4. **Set Environment Variables in Deployment Platform:**
   - Railway: Settings → Variables
   - Vercel: Settings → Environment Variables
   - Docker: Use secrets management

5. **Verify Production Config:**
   ```bash
   npm run build
   npm run start
   ```

---

## 🔍 Troubleshooting

### Common Issues

#### "MongoDB connection failed"

- ✓ Check `MONGODB_URI` format
- ✓ Verify credentials
- ✓ Check IP whitelist in Atlas
- ✓ Test connection: `mongosh <MONGODB_URI>`

#### "RPC rate limit exceeded"

- ✓ Check usage in provider dashboard
- ✓ Upgrade plan or use multiple providers
- ✓ Implement request caching
- ✓ Use different keys for client/server

#### "WalletConnect not connecting"

- ✓ Verify `PROJECT_ID` is correct
- ✓ Check allowed domains in dashboard
- ✓ Clear browser cache
- ✓ Try different wallet app

#### "Subgraph data not loading"

- ✓ Check subgraph deployment status
- ✓ Verify URL and version match
- ✓ Test query in GraphQL Playground
- ✓ Check browser console for errors

---

## 📊 Monitoring & Best Practices

### Production Monitoring

1. **API Usage:**
   - Monitor RPC call counts
   - Track rate limit warnings
   - Set up alerts for quota exceeded

2. **Database:**
   - Monitor connection pool
   - Track query performance
   - Set up backup alerts

3. **Security:**
   - Audit admin address changes
   - Monitor for unusual API access patterns
   - Rotate secrets quarterly

### Performance Optimization

1. **Caching:**
   - Use exchange rate cache
   - Implement RPC response caching
   - Cache subgraph queries

2. **Rate Limiting:**
   - Client-side request throttling
   - Batch blockchain reads
   - Use indexed subgraph data

3. **Error Handling:**
   - Graceful RPC fallbacks
   - Retry logic with exponential backoff
   - User-friendly error messages

---

## 🆘 Support & Resources

- **Alchemy Docs:** https://docs.alchemy.com
- **Infura Docs:** https://docs.infura.io
- **The Graph Docs:** https://thegraph.com/docs
- **WalletConnect Docs:** https://docs.walletconnect.com
- **MongoDB Atlas:** https://docs.atlas.mongodb.com

---

## 📝 Changelog

### v2.0.0 (2026-01-22)

- ✨ Restructured all environment files
- ✨ Added comprehensive documentation
- ✨ Created production/development templates
- ✨ Improved security guidelines
- ✨ Added troubleshooting section
