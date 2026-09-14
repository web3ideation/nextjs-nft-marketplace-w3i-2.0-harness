# Project Root Structure

## 📋 Essential Files Only

The root directory follows senior-level organization principles:

### ✅ Configuration Files (Must Stay)
```
├── .dockerignore          # Docker build exclusions
├── .env                   # Team defaults (committed)
├── .env.local            # Local secrets (NOT committed)
├── .env.local.template   # Setup guide for .env.local
├── .env.production.template # Production setup guide
├── .gitignore            # Git exclusions
├── .npmrc                # npm configuration
├── eslint.config.mjs     # ESLint configuration
├── next.config.ts        # Next.js configuration
├── nixpacks.toml         # Railway deployment config
├── package.json          # Dependencies & scripts
├── postcss.config.mjs    # PostCSS (Tailwind)
├── tailwind.config.js    # Tailwind CSS
├── tsconfig.json         # TypeScript config
└── instrumentation.ts    # Next.js instrumentation hook
```

### ✅ Meta Files
```
├── README.md             # Project documentation
├── LICENSE               # MIT License
├── NOTICE                # Third-party components & licenses
└── next-env.d.ts         # Next.js TypeScript declarations (auto-generated)
```

### ✅ Directories
```
├── .github/              # GitHub workflows & templates
├── .next/                # Next.js build output (ignored)
├── .vscode/              # VS Code workspace settings (ignored)
├── docs/                 # Project documentation
├── node_modules/         # Dependencies (ignored)
├── public/               # Static assets
├── scripts/              # Build, dev, maintenance scripts
└── src/                  # Application source code
```

## ❌ What Doesn't Belong Here

### Move to scripts/
- Test scripts (`test-*.js`, `check-*.js`, `verify-*.js`)
- Utility scripts (`fetch-*.js`, `analyze-*.js`)
- One-off debugging scripts

### Move to docs/
- Markdown documentation files
- Architecture decisions
- API documentation

### Move to src/config/
- ABI files (`*.abi.json`)
- Contract addresses
- Chain configurations

### Delete (if not needed)
- Build artifacts (`*.tsbuildinfo`)
- Temporary files (`*.tmp`, `*.temp`)
- Old backups (`.env-old/`, etc.)

## 🎯 Root Organization Principles

1. **Minimal Surface Area**: Only essential config files
2. **Predictable Structure**: Standard Next.js + TypeScript setup
3. **Self-Documenting**: Clear naming conventions
4. **Version Control**: Only committed files in root (no secrets)
5. **IDE Friendly**: Recognized by VS Code, GitHub Copilot, etc.

## 📦 Related Documentation

- Architecture: `docs/architecture/README.md`
- Scripts: `scripts/README.md`
- Development: `docs/development/README.md`
- API: `docs/api/README.md`

---

**Last Updated**: January 29, 2026  
**Maintained By**: Senior-level standards
