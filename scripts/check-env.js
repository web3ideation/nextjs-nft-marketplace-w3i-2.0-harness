#!/usr/bin/env node

/**
 * Environment Setup Script
 * Verifies and validates environment configuration
 *
 * GELTUNGSGRENZE, die man kennen muss, bevor man sich auf dieses Skript
 * verlaesst: Es liest eine DATEI (.env.local bzw. .env.production.local), nicht
 * process.env. In einer Umgebung, in der der Hoster die Variablen in den
 * Prozess injiziert, existiert diese Datei nicht — dann bricht das Skript ab,
 * bevor es etwas geprueft hat. Es ist deshalb eine Entwicklerhilfe gegen
 * vergessene lokale Variablen und NICHT der Nachweis fuer V14.
 *
 * Der verbindliche Nachweis ist getPlatformConfig() in
 * src/lib/nft-data-platform/config.ts: die Funktion laeuft im echten Prozess,
 * wirft beim ersten Aufruf und nennt alle fehlenden Namen auf einmal.
 * Entscheidung E4, siehe state/plan-v2-plattform-integration.md Abschnitt 6.
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m'
};

const log = {
    info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
    success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
    warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
    error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
    section: (msg) => console.log(`\n${colors.cyan}${msg}${colors.reset}`)
};

// Required files
const requiredFiles = {
    development: '.env.local',
    production: '.env.production.local'
};

// Template files
const templateFiles = {
    development: '.env.local.template',
    production: '.env.production.template'
};

// Critical variables that MUST be set
const criticalVars = {
    common: [
        'MONGODB_URI',
        'JWT_SECRET',
        // V64: je Umgebung explizit. Ein gemeinsamer Standardkanal wuerde
        // SSE-Ereignisse zwischen Umgebungen vermischen, die dieselbe
        // Redis-Instanz nutzen.
        'REDIS_SSE_CHANNEL'
    ],
    development: [
        'NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID',
        'NEXT_PUBLIC_MARKETPLACE_ADDRESS'
    ],
    production: [
        'NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID',
        'NEXT_PUBLIC_MARKETPLACE_ADDRESS',
        'NEXT_PUBLIC_SUBGRAPH_V2_URL'
    ]
};

// Variablen, die nur unter einer Bedingung Pflicht sind. Die feste Liste oben
// kann das nicht ausdruecken — ein Flag, das eine Datenquelle scharf stellt,
// macht genau die Variablen pflichtig, die diese Quelle braucht, und keine
// davon, wenn es aus ist.
const conditionalVars = [
    {
        reason: 'NFT_DATA_PLATFORM_ENABLED ist an',
        isActive: (vars) => vars.NFT_DATA_PLATFORM_ENABLED === 'true' || vars.NFT_DATA_PLATFORM_ENABLED === '1',
        names: [
            'NFT_API_BASE_URL',
            'NFT_API_READ_CLIENT_ID',
            'NFT_API_READ_KEY',
            'NFT_API_READ_SECRET',
            'NFT_API_OPS_CLIENT_ID',
            'NFT_API_OPS_KEY',
            'NFT_API_OPS_SECRET'
        ]
    }
];

// Stellwerte mit Standardwert im Code. Werden nur gelistet, nie erzwungen —
// sie existieren, damit die Messung aus V34 die Startwerte ohne Codeaenderung
// korrigieren kann.
const optionalVars = {
    'NFT_API_TIMEOUT_MS': '10000',
    'NFT_API_MAX_ATTEMPTS': '3',
    'NFT_API_READ_LIMIT_PER_MINUTE': '600',
    'NFT_API_READ_CONCURRENCY': '8',
    'NFT_API_OPS_LIMIT_PER_MINUTE': '30',
    'NFT_API_OPS_CONCURRENCY': '2'
};

function checkFileExists(filePath) {
    return fs.existsSync(path.join(process.cwd(), filePath));
}

function loadEnvFile(filePath) {
    try {
        const content = fs.readFileSync(path.join(process.cwd(), filePath), 'utf8');
        const vars = {};

        content.split('\n').forEach(line => {
            const match = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
            if (match) {
                vars[match[1]] = match[2].trim();
            }
        });

        return vars;
    } catch (error) {
        return null;
    }
}

function validateJWTSecret(secret) {
    if (!secret || secret === '__GENERATE_A_LONG_RANDOM_SECRET_HERE__' || secret === '__LONG_RANDOM_SECRET__') {
        return false;
    }
    if (secret.length < 32) {
        return false;
    }
    return true;
}

function validateMongoURI(uri) {
    if (!uri || uri.includes('YOUR_') || uri.includes('username:password')) {
        return false;
    }
    return uri.startsWith('mongodb://') || uri.startsWith('mongodb+srv://');
}

function validateAddress(address) {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function checkEnvironment(env) {
    log.section(`🔍 Checking ${env.toUpperCase()} Environment`);

    const envFile = requiredFiles[env];
    const templateFile = templateFiles[env];

    // Check if env file exists
    if (!checkFileExists(envFile)) {
        log.error(`${envFile} not found!`);

        if (checkFileExists(templateFile)) {
            log.info(`Copy template: cp ${templateFile} ${envFile}`);
        }
        return false;
    }

    log.success(`${envFile} exists`);

    // Load and validate variables
    const vars = loadEnvFile(envFile);

    if (!vars) {
        log.error(`Failed to load ${envFile}`);
        return false;
    }

    let hasErrors = false;

    // Check critical variables
    const requiredVars = [...criticalVars.common, ...criticalVars[env]];

    log.info('Validating critical variables...');

    requiredVars.forEach(varName => {
        const value = vars[varName];

        if (!value) {
            log.error(`${varName} is not set`);
            hasErrors = true;
            return;
        }

        // Specific validations
        if (varName === 'JWT_SECRET') {
            if (!validateJWTSecret(value)) {
                log.error(`${varName} is too short or using placeholder (min 32 chars)`);
                hasErrors = true;
            } else {
                log.success(`${varName} is valid`);
            }
        } else if (varName === 'MONGODB_URI') {
            if (!validateMongoURI(value)) {
                log.error(`${varName} is invalid or using placeholder`);
                hasErrors = true;
            } else {
                log.success(`${varName} is valid`);
            }
        } else if (varName.includes('ADDRESS')) {
            if (!validateAddress(value)) {
                log.error(`${varName} is not a valid Ethereum address`);
                hasErrors = true;
            } else {
                log.success(`${varName} is valid`);
            }
        } else {
            if (value.includes('YOUR_') || value.includes('your_')) {
                log.warn(`${varName} appears to be using a placeholder`);
                hasErrors = true;
            } else {
                log.success(`${varName} is set`);
            }
        }
    });

    // Bedingte Pflichtgruppen
    conditionalVars.forEach(group => {
        if (!group.isActive(vars)) {
            log.info(`Skipped: ${group.names.length} variable(s) not required (${group.reason} is false)`);
            return;
        }

        log.info(`Validating conditional group: ${group.reason}`);

        group.names.forEach(varName => {
            if (!vars[varName]) {
                log.error(`${varName} is not set (required because ${group.reason})`);
                hasErrors = true;
            } else {
                log.success(`${varName} is set`);
            }
        });
    });

    // Optionale Stellwerte: nur anzeigen, welcher Wert gilt.
    const setOptional = Object.keys(optionalVars).filter(name => vars[name]);
    if (setOptional.length > 0) {
        log.info(`${setOptional.length} optional tuning variable(s) overridden: ${setOptional.join(', ')}`);
    }

    // Security warnings for NEXT_PUBLIC_ variables
    const publicVars = Object.keys(vars).filter(k => k.startsWith('NEXT_PUBLIC_'));

    // V14: keine Plattform-Variable darf einen NEXT_PUBLIC_-Spiegel haben.
    const leakedPlatformVars = publicVars.filter(k => k.includes('NFT_API_'));
    if (leakedPlatformVars.length > 0) {
        log.error(`Platform credentials must never be client-side (V14): ${leakedPlatformVars.join(', ')}`);
        hasErrors = true;
    }

    if (publicVars.length > 0) {
        log.info(`\n${publicVars.length} client-side variables (NEXT_PUBLIC_*) found`);

        // Check for potential secrets in public vars
        const suspiciousPatterns = ['SECRET', 'PASSWORD', 'PRIVATE', 'KEY'];
        publicVars.forEach(varName => {
            if (suspiciousPatterns.some(pattern => varName.includes(pattern))) {
                log.warn(`${varName} contains sensitive keyword but is public!`);
                hasErrors = true;
            }
        });
    }

    return !hasErrors;
}

function generateSecret() {
    log.section('🔐 Generate New JWT Secret');
    log.info('Run this command and add to .env.local:');
    console.log(colors.gray + '\nnode -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n' + colors.reset);
}

function main() {
    console.log(`
${colors.cyan}╔═══════════════════════════════════════════════╗
║   Environment Configuration Validator        ║
║   NFT Marketplace - Production Ready         ║
╚═══════════════════════════════════════════════╝${colors.reset}
`);

    const args = process.argv.slice(2);
    const env = args[0] || process.env.NODE_ENV || 'development';

    if (args.includes('--generate-secret')) {
        generateSecret();
        return;
    }

    if (args.includes('--help')) {
        console.log(`
Usage: node scripts/check-env.js [environment] [options]

Environments:
  development  Check .env.local (default)
  production   Check .env.production.local

Options:
  --generate-secret  Generate a new JWT secret
  --help            Show this help

Examples:
  node scripts/check-env.js
  node scripts/check-env.js production
  node scripts/check-env.js --generate-secret
`);
        return;
    }

    const isValid = checkEnvironment(env);

    if (isValid) {
        log.section('✅ Environment is valid!');
        process.exit(0);
    } else {
        log.section('❌ Environment has errors!');
        log.info('See docs/environment/README.md for setup instructions');
        process.exit(1);
    }
}

main();
