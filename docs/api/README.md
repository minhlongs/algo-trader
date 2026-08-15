# Algo Trader API

## Quick Start

### 1. Start Local Server

```bash
cd /Users/macbook/algo-trader
npm run dev
# Server starts at http://localhost:8787
```

### 2. Authenticate

All endpoints require a Bearer token in the Authorization header:

```bash
export API_KEY="your-api-key-here"
curl -H "Authorization: Bearer $API_KEY" http://localhost:8787/api/trades
```

### 3. Test Endpoints

**Get trades:**
```bash
curl -H "Authorization: Bearer $API_KEY" \
  "http://localhost:8787/api/trades?limit=10"
```

**Get signals:**
```bash
curl -H "Authorization: Bearer $API_KEY" \
  "http://localhost:8787/api/v1/signals?limit=5"
```

**Check system status:**
```bash
curl -H "Authorization: Bearer $API_KEY" \
  http://localhost:8787/api/admin/status
```

### 4. View Swagger UI

Install swagger-ui-express:

```bash
npm install swagger-ui-express @types/swagger-ui-express
```

Add to your Express app:

```typescript
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';

const swaggerDocument = YAML.load('./docs/api/openapi.yaml');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
```

Visit: `http://localhost:8787/api-docs`

## API Overview

| Tag | Description |
|-----|-------------|
| Trading | Trades, positions, P&L, backtesting |
| Signals | Signal feed and subscriptions |
| Risk | VaR, drawdown, ATR stops, Kelly sizing |
| Revenue | MRR, usage, churn metrics |
| Marketplace | Strategy reviews |
| Referral | Referral program |
| Co-pilot | AI trading assistant |
| Admin | System control |
| Analytics | Event tracking |

## Documentation

- OpenAPI spec: `./openapi.yaml`
- Full API reference: `../api-reference.md`
- Rate limiting: `../api-rate-limiting.md`
