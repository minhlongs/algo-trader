# TERMINAL.CORE Mobile

React Native / Expo mobile app for the algo-trading terminal dashboard and marketplace.

## Setup

```bash
# Install Expo CLI and create project shell (first time only)
npx create-expo-app@latest terminal-core-mobile --template blank-typescript

# Copy this src/ directory over the generated src/
cp -r /path/to/mobile/src/* terminal-core-mobile/src/

# Install additional dependencies
cd terminal-core-mobile
npx expo install react-native-svg react-native-safe-area-context
npx expo install @react-navigation/native @react-navigation/bottom-tabs react-native-screens

# Run
npx expo start
```

## Screens

- **Dashboard** (`src/screens/dashboard-screen.tsx`) — Trading dashboard with price ticker, equity chart, signals, positions
- **Marketplace** (`src/screens/marketplace-screen.tsx`) — Strategy marketplace with filterable card grid

## Architecture

```
src/
  theme/
    colors.ts       # Design tokens from Stitch exports
    typography.ts   # Font families, sizes, weights
  components/
    price-ticker.tsx           # Auto-scrolling price banner
    dashboard-header.tsx       # Top app bar
    stats-card.tsx             # Compact metric card
    equity-chart.tsx           # SVG area chart
    signal-card.tsx            # Arbitrage signal rows
    node-performance.tsx       # Latency bars
    spread-opportunities.tsx   # Spread table
    active-positions.tsx       # Open positions list
    bottom-tab-bar.tsx         # Bottom navigation tabs
    fab.tsx                     # Floating action button
    marketplace-header.tsx      # Marketplace-specific header
    strategy-card.tsx           # Marketplace strategy card
  screens/
    dashboard-screen.tsx        # Main dashboard
    marketplace-screen.tsx      # Strategy marketplace
  app.tsx                       # Root navigation
```

## Design

Dark theme with:
- Gold/amber primary (#ffc174)
- Purple secondary (#d0bcff)
- Green tertiary (#56e5a9)
- JetBrains Mono for data, Hanken Grotesk for UI

Generated from the algo-trader Stitch desktop designs, adapted for mobile 375px viewports.
