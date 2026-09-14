# 🚀 NFT Marketplace 2.0 - Production Ready

A modern, full-stack NFT marketplace built with Next.js 15, TypeScript, and Web3 technologies. **Fully refactored for production with hybrid metadata system, modular components, and enterprise-grade security.**

![NFT Marketplace](https://img.shields.io/badge/Version-2.0.0-blue.svg)
![Next.js](https://img.shields.io/badge/Next.js-15.5.9-black.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4.5-blue.svg)
![License](https://img.shields.io/badge/License-MIT-green.svg)
![Status](https://img.shields.io/badge/Status-Production%20Ready-green.svg)

## 🎯 **Production Highlights** ⚡

### **Architecture Complete**

- ✅ **Hybrid Metadata System** - DB-first loading (~56ms p50, measured) with blockchain fallback
- ✅ **Modular Components** - BaseCard, BaseModal, LoadingState, FormField
- ✅ **Standardized API** - 42+ handlers with apiHandler, middleware, validation
- ✅ **Type-Safe Infrastructure** - Comprehensive TypeScript coverage
- ✅ **Performance Optimized** - Parallel execution, smart filtering, shared caches

### **Security & Authentication**

- ✅ **Signature-Based Admin Auth** - Wallet verification with 24h sessions
- ✅ **API Security** - Automatic auth middleware, rate limiting, error handling
- ✅ **Session Management** - httpOnly cookies, CSRF protection
- ✅ **Input Validation** - Zod schemas for all API routes

### **Data Management**

- ✅ **Real-Time Sync** - TheGraph → MongoDB polling (30s interval)
- ✅ **Smart Caching** - Multi-layer caching with automatic invalidation
- ✅ **Ownership Tracking** - Full NFT transfer history
- ✅ **Alchemy Optimization** - Discovery-only mode (`withMetadata=false`)

## ✨ Features

### 🎨 **Modern UI/UX**

- Responsive design with Tailwind CSS
- **Modular component architecture** (BaseCard, BaseModal, LoadingState)
- Optimized image loading with Next.js Image component
- Smooth animations and transitions
- Mobile-first approach
- Accessible components with ARIA support

### 🔗 **Web3 Integration**

- Multi-chain support (Ethereum, Polygon, etc.)
- Wallet connectivity with RainbowKit
- Smart contract interactions with Wagmi & Viem
- ERC-721 and ERC-2981 standard support
- Real-time blockchain data synchronization

### 💾 **Data Management - Hybrid Architecture** ⚡

#### **Production Architecture: Separation of Concerns**

- **`nft_metadata` Collection:** Central source of truth for all NFT data
  - Metadata (name, image, description, attributes)
  - Contract info (name, symbol, totalSupply)
  - Ownership tracking with full history
  - Insights (category, rarity, tags)
  - **Instant wallet loading** (~56ms p50 vs ~497ms cold discovery, measured)
- **`marketplace_items` Collection:** Listing-specific data only
  - Price, seller, buyer, listing status
  - References `nft_metadata` via $lookup
  - Smaller, faster queries
- **`nft_stats` Collection:** User interactions
  - Views, likes, ratings, watchlist
  - Aggregated statistics

#### **Smart Sync Strategy**

- **Alchemy Discovery:** withMetadata=false (cheap API calls)
- **Blockchain Metadata:** Direct from contract + IPFS (free)
- **Fewer Metadata Calls:** Only fetch metadata for NEW NFTs (not quantified)
- **Background Verification:** Auto-sync on wallet connect (doesn't block UI)
- **Transfer Detection:** Automatic ownership updates

#### **TheGraph Integration**

- Real-time blockchain data via GraphQL
- Fully decentralized data source
- Auto-sync on server boot (production ready)
- 61+ NFTs synced from marketplace contract
- 30-second polling interval

### 🛡️ **Security & Authentication**

- **Signature-Based Admin Auth** - Wallet verification without gas fees
- **Session Management** - httpOnly cookies, 24h expiration
- **API Middleware** - Automatic auth, validation, error handling
- **Rate Limiting** - Protection against abuse
- **Input Validation** - Zod schemas for all API routes

### 🖼️ **NFT Features**

- **Modular NFT detail pages** with 13+ components
- Support for images, videos, and animations
- **Tabbed interface** (Project/Functionalities/Tokenomics)
- IPFS gateway integration with fallbacks
- Attribute filtering and search
- Collection browsing
- **Smart validation** for NFT addresses and token IDs

### 💰 **Marketplace Functionality**

- Active listings display with real-time updates
- Price tracking in multiple currencies (ETH, USD, EUR, etc.)
- Transaction history with blockchain verification
- Seller/Buyer information with wallet integration
- Smart contract interactions (buy, list, cancel, update)
- Collection-level statistics and insights
- Shopping cart with batch purchase support

## 🛠️ Tech Stack

### **Frontend**

- **[Next.js 15](https://nextjs.org/)** - React framework with App Router
- **[TypeScript](https://www.typescriptlang.org/)** - Static type checking
- **[Tailwind CSS](https://tailwindcss.com/)** - Utility-first CSS framework
- **[React 18](https://react.dev/)** - Component library with concurrent features

### **Web3**

- **[Wagmi](https://wagmi.sh/)** - React hooks for Ethereum
- **[Viem](https://viem.sh/)** - TypeScript interface for Ethereum
- **[RainbowKit](https://www.rainbowkit.com/)** - Wallet connection interface

### **Data & State**

- **[MongoDB](https://www.mongodb.com/)** - Database for NFT metadata, stats, and user data
- **[Apollo Client](https://www.apollographql.com/docs/react/)** - GraphQL client for TheGraph
- **[TanStack Query](https://tanstack.com/query)** - Data fetching and caching
- **[React Context](https://react.dev/reference/react/useContext)** - Global state management
- **[React Error Boundary](https://github.com/bvaughn/react-error-boundary)** - Error handling

### **Development**

- **[ESLint](https://eslint.org/)** - Code linting
- **[Turbopack](https://turbo.build/pack)** - Fast development bundler

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18.17 or later
- **npm** or **yarn** package manager
- **Git** for version control

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/nextjs-nft-marketplace-w3i-2.0.git
   cd nextjs-nft-marketplace-w3i-2.0
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Environment Setup**

   Copy the example environment file:

   ```bash
   cp .env.local.template .env.local
   ```

   Configure the following environment variables:

   ```env
   # App Configuration
   NEXT_PUBLIC_APP_URL=http://localhost:3000

   # Web3 Configuration
   NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=your_wallet_connect_project_id
   NEXT_PUBLIC_INFURA_PROJECT_ID=your_infura_project_id
   NEXT_PUBLIC_ALCHEMY_API_KEY=your_alchemy_api_key

   # GraphQL Subgraph (TheGraph)
   NEXT_PUBLIC_SUBGRAPH_URL=https://api.thegraph.com/subgraphs/name/your-subgraph
   NEXT_PUBLIC_SUBGRAPH_WS_URL=wss://api.thegraph.com/subgraphs/name/your-subgraph

   # MongoDB
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/nft_marketplace
   MONGODB_DB=nft_marketplace

   # Admin Wallet (for signature-based auth)
   ADMIN_ADDRESSES=0xYourAdminWallet1,0xYourAdminWallet2

   # API Keys
   COINGECKO_API_KEY=your_coingecko_api_key
   ```

4. **Run the development server**

   ```bash
   npm run dev
   ```

5. **Open your browser**

   Navigate to [http://localhost:3000](http://localhost:3000) to see the application.

### ⚠️ MongoDB Connection Issues?

If you see `API error: 500` or MongoDB connection errors:

```bash
# Quick diagnosis (shows your IP and tests connection)
npm run diagnose:mongodb
```

**Common Issue:** IP not in MongoDB Atlas whitelist

- See [MongoDB Quick Fix Guide](docs/database/quick-fix.md) for 2-minute solution
- Full troubleshooting: [MongoDB Troubleshooting](docs/database/troubleshooting.md)

## ⚠️ Known Issues and TODOs

- **Request typing uses `@ts-ignore`** for `NextRequest` extensions in auth/validation middleware and several API routes. Recommend module augmentation or a typed request wrapper to remove `@ts-ignore` usage.
- **Admin auth automated tests pending** (see [docs/api/authentication.md](docs/api/authentication.md) Automated Tests section).
- **History Towers tests pending** (see [src/app/history-towers/**tests**/README.md](src/app/history-towers/__tests__/README.md) TODO sections for remaining test suites).

## 📁 Project Structure

```
nextjs-nft-marketplace-w3i-2.0/
├── docs/                       # 📚 Comprehensive documentation
│   ├── README.md              # Docs navigation
│   ├── api/                   # API documentation
│   ├── architecture/          # Architecture guides
│   ├── database/              # Database guides + schemas
│   ├── development/           # Development workflows
│   ├── environment/           # Environment variables
│   ├── integrations/          # External integrations
│   └── CHANGELOG.md           # Version history
├── src/
│   ├── app/                   # Next.js App Router
│   │   ├── api/              # API routes (42+ handlers)
│   │   │   ├── auth/         # Admin authentication
│   │   │   ├── nft/          # NFT endpoints
│   │   │   ├── user/         # User endpoints
│   │   │   ├── marketplace/  # Marketplace endpoints
│   │   │   ├── wallet/       # Wallet endpoints
│   │   │   ├── cart/         # Shopping cart
│   │   │   └── admin/        # Admin endpoints
│   │   ├── nft/[contractAddress]/[tokenId]/  # NFT detail pages
│   │   ├── wallet/           # Wallet dashboard
│   │   ├── admin/            # Admin panel
│   │   ├── marketplace/      # Marketplace pages
│   │   ├── sell/             # Listing creation
│   │   ├── history-towers/   # Game feature
│   │   ├── layout.tsx        # Root layout
│   │   └── page.tsx          # Home page
│   ├── components/            # React components
│   │   ├── core/             # Core reusable components
│   │   │   ├── Card/BaseCard.tsx         # Standardized card component
│   │   │   ├── Modal/BaseModal.tsx       # Modal infrastructure
│   │   │   ├── Loading/LoadingState.tsx  # Loading states
│   │   │   ├── Empty/EmptyState.tsx      # Empty states
│   │   │   └── Form/FormField.tsx        # Form fields
│   │   ├── nft/              # NFT components
│   │   ├── marketplace/      # Marketplace features
│   │   ├── layout/           # Layout components
│   │   ├── ui/               # UI components
│   │   └── auth/             # Auth components
│   ├── contexts/              # React contexts (one folder per domain)
│   │   ├── nft-stats/        # Stats & interactions
│   │   ├── wallet-nfts/      # Wallet NFTs (DB-first)
│   │   ├── collections/      # Collections aggregation
│   │   ├── marketplace-items/ # Marketplace cache
│   │   └── CurrencyContext.tsx  # Multi-currency
│   ├── hooks/                 # Custom React hooks
│   │   ├── marketplace/      # Marketplace hooks
│   │   ├── nfts/             # NFT-related hooks
│   │   └── ui/useForm.ts     # Form validation hook
│   ├── lib/                   # Library configurations
│   │   ├── api/              # API infrastructure
│   │   │   ├── handler.ts    # apiHandler wrapper
│   │   │   ├── errors.ts     # Custom error classes
│   │   │   └── responses.ts  # Response helpers
│   │   ├── middleware/       # API middleware
│   │   │   ├── auth.ts       # Authentication
│   │   │   └── validation.ts # Request validation (Zod)
│   │   ├── cache.ts          # Shared cache module
│   │   ├── mongodb.ts        # Database connection
│   │   └── utils.ts          # Utilities
│   ├── services/              # Business logic services
│   │   └── blockchain/       # Blockchain services
│   │       └── transaction-service.ts  # Contract interactions
│   ├── types/                 # TypeScript types
│   │   ├── core/             # NFT types, custom events
│   │   ├── api/              # API types
│   │   └── index.ts          # Type exports
│   ├── utils/                 # Utility functions
│   │   ├── nft/              # NFT utilities
│   │   ├── formatters/       # Data formatting
│   │   └── validation/       # Validation helpers
│   └── config/                # App configuration
├── scripts/                   # Utility scripts
│   ├── production/           # Production scripts
│   │   ├── sync-marketplace-data.js  # Main sync service
│   │   └── create-indexes.js         # MongoDB indexes
│   ├── dev/                  # Development helpers
│   └── maintenance/          # DB maintenance
├── public/                    # Static assets
├── .env.local                 # Environment variables
├── next.config.ts             # Next.js config
├── tailwind.config.js         # Tailwind config
├── tsconfig.json              # TypeScript config
├── package.json               # Dependencies
└── README.md                  # This file
```

For detailed documentation, see the `/docs` folder.

## 🎨 Key Features Deep Dive

### **�️ Production Architecture**

#### **API Infrastructure**

- **apiHandler Pattern** - Standardized wrapper for all routes (42+ handlers)
- **Middleware System** - Composable auth, validation, error handling
- **Custom Error Classes** - Type-safe error handling with proper status codes
- **Zod Validation** - Request/response validation with TypeScript inference
- **Automatic Logging** - Request/response logging with performance metrics

#### **Component Library**

- **BaseCard** - Standardized card component with variants (383 LOC)
- **BaseModal** - Modal infrastructure with accessibility (150 LOC)
- **LoadingState** - Consistent loading states across app (80 LOC)
- **EmptyState** - Empty state handling (100 LOC)
- **FormField** - Reusable form fields with validation (100 LOC)

#### **Business Logic Layer**

- **TransactionService** - Blockchain interactions (purchase, list, cancel, update)
- **useForm Hook** - Form validation and state management (367 LOC)
- **Smart Caching** - Multi-layer caching with automatic invalidation
- **Event System** - Custom events for cross-component communication

### **🔐 Admin Authentication System**

**Signature-Based Authentication** - No gas fees, maximum security

#### **Flow:**

```
1. Admin connects wallet → Check if address in ADMIN_ADDRESSES
2. Request challenge → Server generates unique nonce + timestamp
3. Sign message → User signs with wallet (free, no gas)
4. Verify signature → Server validates with viem.verifyMessage()
5. Create session → Set httpOnly cookie (24h expiration)
6. API access → All admin routes protected with withAdmin middleware
```

#### **Security Features:**

- ✅ Challenge-response pattern prevents replay attacks
- ✅ Signature verification proves wallet ownership
- ✅ httpOnly cookies prevent XSS attacks
- ✅ 24h session expiration
- ✅ Server-side session validation on every request

### **📊 Data Architecture**

#### **MongoDB Collections:**

```typescript
// nft_metadata - Central source of truth
{
  nftAddress: string;
  tokenId: string;
  metadata: { name, description, image, attributes };
  contractInfo: { name, symbol, totalSupply };
  ownershipHistory: [{ owner, from, to, timestamp }];
  insights: { category, rarity, tags };
  lastSync: Date;
}

// marketplace_items - Listing data only
{
  nftAddress: string;
  tokenId: string;
  price: string;
  seller: string;
  buyer?: string;
  status: 'active' | 'sold' | 'cancelled';
  listingType: 'sale' | 'swap';
}

// nft_stats - User interactions
{
  nftAddress: string;
  tokenId: string;
  viewCount: number;
  favoriteCount: number;
  watchlistCount: number;
  averageRating: number;
}
```

#### **Data Flow:**

```
TheGraph (Blockchain Events)
    ↓
sync-marketplace-data.js (Polling: 30s)
    ↓
MongoDB (marketplace_items)
    ↓
API Routes (with apiHandler)
    ↓
React Contexts (MarketplaceCacheContext, WalletNFTsContext)
    ↓
UI Components
```

## 🔧 Configuration

### **Blockchain Networks**

Configure supported networks in `src/config/networks.ts`:

```typescript
export const NETWORK_CONFIG: NetworkMapping = {
  "31337": { NftMarketplace: [...], MultiSigWallet: [] },      // Hardhat Local
  "11155111": { NftMarketplace: [...], MultiSigWallet: [...] }, // Sepolia Testnet
  "1": { NftMarketplace: [...], MultiSigWallet: [...] },        // Ethereum Mainnet
};
```

### **Currency Support**

Configure supported currencies:

```typescript
export const SUPPORTED_CURRENCIES: Currency[] = [
  {
    symbol: "ETH",
    name: "Ethereum",
    coingeckoId: "ethereum",
    decimals: 18,
  },
  // ... other currencies
];
```

## 🚢 Deployment

### **Vercel (Recommended)**

1. Connect your GitHub repository to Vercel
2. Configure environment variables in Vercel dashboard
3. Deploy - Vercel will automatically build and deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/nextjs-nft-marketplace-w3i-2.0)

### **Build Commands**

```bash
# Production build
npm run build

# Start production server
npm start

# Development with Turbopack
npm run dev
```

## 🧪 Development

### **Code Quality**

```bash
# Linting
npm run lint

# Type checking
npx tsc --noEmit

# Build verification
npm run build
```

### **Performance Optimization**

- Turbopack for fast development builds
- Next.js Image optimization for media
- React Query for efficient data caching
- Lazy loading for components and images
- **Optimized React patterns** with hooks
- **Modular architecture** for tree shaking

## 🔍 API Routes

### **Authentication**

- `/api/auth/challenge` - Generate signature challenge
- `/api/auth/verify` - Verify wallet signature
- `/api/auth/session` - Check session status
- `/api/auth/logout` - End session

### **NFT Data**

- `/api/nft/detail` - NFT metadata with blockchain sync
- `/api/nft/metadata` - NFT metadata fetching
- `/api/nft/metadata/cached` - Cached metadata (GET, POST)
- `/api/nft/insights` - Public NFT insights
- `/api/nft/stats` - NFT statistics (GET, POST)
- `/api/nft/image/[hash]` - IPFS image proxy

### **Admin Endpoints** (Protected with `withAdmin`)

- `/api/nft/admin/insights` - Manage NFT insights (POST, PUT, DELETE)
- `/api/nft/admin/insights/collections` - Manage collection insights
- `/api/admin/nfts/list` - Admin NFT listing

### **Marketplace**

- `/api/marketplace/items` - Marketplace listings (pagination, filtering)
- `/api/marketplace/listing/[contractAddress]/[tokenId]` - Single listing
- `/api/marketplace/nft/[contractAddress]/[tokenId]` - NFT detail
- `/api/marketplace/collections` - Collection metadata
- `/api/marketplace/sync` - Sync status/control (admin)
- `/api/marketplace/facets` - Diamond facets (admin debug)

### **User Endpoints** (Protected with `withAuth`)

- `/api/user/nfts` - User-owned NFTs from DB
- `/api/user/nfts/sync` - Sync user NFTs
- `/api/user/interactions` - User interactions (GET, POST, PUT)
- `/api/cart` - Shopping cart (GET, POST, DELETE)

### **Wallet**

- `/api/wallet/nfts` - Wallet NFT discovery (Alchemy + DB)

### **Collections**

- `/api/collections` - NFT collections aggregation

See [docs/api/routes.md](docs/api/routes.md) for complete API reference.

## 🔄 Architecture Benefits

### **Before Refactoring:**

- ❌ Scattered API patterns with inconsistent error handling
- ❌ No authentication/authorization middleware
- ❌ Duplicate code across components
- ❌ Hard to maintain and test
- ❌ Poor performance with unnecessary re-renders
- ❌ Slow NFT loading (full metadata fetched from Alchemy on every wallet load)

### **After Refactoring:**

- ✅ **Standardized API Infrastructure** - 42+ handlers with consistent patterns
- ✅ **Security Complete** - Signature-based auth, automatic middleware
- ✅ **Modular Components** - BaseCard, BaseModal, LoadingState, FormField
- ✅ **Instant Wallet Loading** - ~56ms p50 from DB vs ~497ms cold discovery (measured)
- ✅ **Reduced API Cost** - Discovery-only mode for Alchemy (`withMetadata=false`)
- ✅ **Type-Safe** - Comprehensive TypeScript coverage
- ✅ **Production Ready** - Real-time sync, monitoring, error handling

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes with proper TypeScript types
4. **Follow the new modular architecture** patterns
5. Test your changes thoroughly
6. Commit with clear messages: `git commit -m 'feat: add amazing feature'`
7. Push to your branch: `git push origin feature/amazing-feature`
8. Open a Pull Request

### **Development Guidelines**

- Use TypeScript for all new code
- **Follow the standardized API patterns** with apiHandler
- **Use middleware** (withAuth, withAdmin) for protected routes
- **Use Zod schemas** for request/response validation
- **Follow component architecture** - BaseCard, BaseModal, LoadingState
- **Use centralized types** from `/src/types`
- **Leverage utility functions** from `/src/utils`
- Add proper error handling and loading states
- Write clear, self-documenting code
- Test cross-browser compatibility
- **Use React performance patterns** (useCallback, useMemo)

## 📈 Performance Metrics

Reproduce with `npm run bench:api -- 0xYourWallet` against a running dev server
([scripts/dev/benchmark-api.ts](scripts/dev/benchmark-api.ts)).

### **Measured** (local dev, 20 iterations after 3 warmups, 2026-09-03)

| Endpoint | cold | p50 | p95 |
|---|---|---|---|
| `GET /api/marketplace/items?pageSize=20` | 341ms | **17ms** | 20ms |
| `GET /api/collections` | 126ms | **104ms** | 122ms |
| `GET /api/user/nfts` (DB-first) | 90ms | **56ms** | 69ms |
| `GET /api/wallet/nfts` (Alchemy discovery) | **497ms** | 17ms¹ | 19ms¹ |

¹ Warm discovery requests are served from the shared cache and do not reflect
Alchemy latency — only the cold value is meaningful.

**DB-first vs. cold discovery: 56ms vs 497ms ≈ 9x.** Numbers are from a local
machine against MongoDB Atlas; production latency will differ.

### **Not measured**

Bundle size, cache hit rate, sync throughput and Alchemy cost savings have no
benchmark yet — treat any figure for those as an estimate.

### **Build & Development:**

- **Development**: Fast refresh with Turbopack
- **Production Build**: Optimized with tree shaking
- **Bundle Size**: Modular loading, code splitting
- **Type Checking**: Full TypeScript coverage

## 📄 License

Copyright (c) 2025-2026 Ideation Port UG (haftungsbeschränkt). This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. Third-party components and their licenses are listed in [NOTICE](NOTICE).

## 🙏 Acknowledgments

- **[Next.js Team](https://nextjs.org/)** - React framework with App Router
- **[Wagmi Contributors](https://wagmi.sh/)** - Web3 React hooks
- **[Viem Team](https://viem.sh/)** - TypeScript Ethereum interface
- **[The Graph Protocol](https://thegraph.com/)** - Decentralized data indexing
- **[Tailwind CSS](https://tailwindcss.com/)** - Utility-first CSS framework
- **[MongoDB](https://www.mongodb.com/)** - Database platform
- **[Alchemy](https://www.alchemy.com/)** - Web3 infrastructure

## 📞 Support & Documentation

- **Documentation Hub**: [/docs folder](docs/)
- **Architecture Guide**: [docs/architecture/overview.md](docs/architecture/overview.md)
- **API Reference**: [docs/api/routes.md](docs/api/routes.md)
- **Development Guide**: [docs/development/setup.md](docs/development/setup.md)
- **Admin Auth Guide**: [docs/api/authentication.md](docs/api/authentication.md)
- **Database Guide**: [docs/database/README.md](docs/database/README.md)

---

**Built with ❤️ for the Web3 community**

_Production-ready NFT marketplace with enterprise-grade architecture, security, and performance._
