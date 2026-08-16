#!/usr/bin/env bash
# warm-models.sh — Pre-warms LLMs and ML models on startup.
# Hits each endpoint with a tiny query to pre-load weights in GPU unified memory.
set -uo pipefail

echo "=== Model Warming Script ==="
echo "Date: $(date -Iseconds)"

# Load .env if present
if [ -f .env ]; then
  # shellcheck disable=SC2046
  export $(grep -v '^#' .env | xargs 2>/dev/null || true)
fi

# 1. Primary LLM (DeepSeek R1 MLX :11435)
PRIMARY_URL="${LLM_PRIMARY_URL:-http://127.0.0.1:11435/v1}"
PRIMARY_MODEL="${LLM_PRIMARY_MODEL:-mlx-community/DeepSeek-R1-Distill-Qwen-32B-4bit}"
echo "[*] Warming Primary LLM (${PRIMARY_MODEL}) at ${PRIMARY_URL}..."
curl -s -X POST "${PRIMARY_URL}/chat/completions" \
  -H "Content-Type: application/json" \
  -d "{\"model\": \"${PRIMARY_MODEL}\", \"messages\": [{\"role\": \"user\", \"content\": \"ping\"}], \"max_tokens\": 5}" \
  -m 30 > /dev/null && echo "[+] Primary LLM warmed." || echo "[-] Primary LLM warning: request failed or timed out."

# 2. Fast Triage LLM (Nemotron MLX :11436)
FAST_URL="${LLM_FAST_TRIAGE_URL:-http://127.0.0.1:11436/v1}"
FAST_MODEL="${LLM_FAST_TRIAGE_MODEL:-mlx-community/NVIDIA-Nemotron-3-Nano-30B-A3B-4bit}"
echo "[*] Warming Fast Triage LLM (${FAST_MODEL}) at ${FAST_URL}..."
curl -s -X POST "${FAST_URL}/chat/completions" \
  -H "Content-Type: application/json" \
  -d "{\"model\": \"${FAST_MODEL}\", \"messages\": [{\"role\": \"user\", \"content\": \"ping\"}], \"max_tokens\": 5}" \
  -m 10 > /dev/null && echo "[+] Fast Triage LLM warmed." || echo "[-] Fast Triage LLM warning: request failed or timed out."

# 3. Fallback LLM (Ollama :11434)
FALLBACK_URL="${LLM_FALLBACK_URL:-http://127.0.0.1:11434/v1}"
FALLBACK_MODEL="${LLM_FALLBACK_MODEL:-deepseek-r1:32b}"
echo "[*] Warming Fallback LLM (${FALLBACK_MODEL}) at ${FALLBACK_URL}..."
curl -s -X POST "${FALLBACK_URL}/chat/completions" \
  -H "Content-Type: application/json" \
  -d "{\"model\": \"${FALLBACK_MODEL}\", \"messages\": [{\"role\": \"user\", \"content\": \"ping\"}], \"max_tokens\": 5}" \
  -m 30 > /dev/null && echo "[+] Fallback LLM warmed." || echo "[-] Fallback LLM warning: request failed or timed out."

# 4. Optional Qwen LLM (Qwen MLX :11437)
if [ "${LLM_QWEN_ENABLED:-false}" = "true" ] || [ "${SWARM_QWEN_ENABLED:-false}" = "true" ]; then
  QWEN_URL="${LLM_QWEN_URL:-http://127.0.0.1:11437/v1}"
  QWEN_MODEL="${LLM_QWEN_MODEL:-mlx-community/Qwen3-30B-A3B-4bit}"
  echo "[*] Warming Qwen LLM (${QWEN_MODEL}) at ${QWEN_URL}..."
  curl -s -X POST "${QWEN_URL}/chat/completions" \
    -H "Content-Type: application/json" \
    -d "{\"model\": \"${QWEN_MODEL}\", \"messages\": [{\"role\": \"user\", \"content\": \"ping\"}], \"max_tokens\": 5}" \
    -m 30 > /dev/null && echo "[+] Qwen LLM warmed." || echo "[-] Qwen LLM warning: request failed or timed out."
fi

# 5. AlphaEar Sidecar (FastAPI :8100 - FinBERT / Kronos)
ALPHAEAR_URL="${ALPHAEAR_SIDECAR_URL:-http://127.0.0.1:8100}"
echo "[*] Warming AlphaEar Sidecar at ${ALPHAEAR_URL}..."
curl -s -m 5 "${ALPHAEAR_URL}/health" > /dev/null && {
  echo "[+] AlphaEar sidecar is online."
  
  # Warm FinBERT
  echo "[*] Warming FinBERT sentiment analyzer..."
  curl -s -X POST "${ALPHAEAR_URL}/sentiment/analyze" \
    -H "Content-Type: application/json" \
    -d '{"text": "Polymarket volume hits record high as traders hedge event risks."}' \
    -m 10 > /dev/null && echo "[+] FinBERT warmed." || echo "[-] FinBERT warming failed."

  # Warm Kronos
  echo "[*] Warming Kronos forecaster..."
  # Send 30 random prices (min length)
  PRICES="[0.5,0.51,0.52,0.51,0.5,0.49,0.48,0.49,0.5,0.51,0.52,0.53,0.54,0.53,0.52,0.51,0.5,0.49,0.48,0.49,0.5,0.51,0.52,0.53,0.54,0.55,0.56,0.55,0.54,0.53]"
  curl -s -X POST "${ALPHAEAR_URL}/predict/forecast" \
    -H "Content-Type: application/json" \
    -d "{\"prices\": ${PRICES}, \"lookback\": 30, \"pred_len\": 5}" \
    -m 15 > /dev/null && echo "[+] Kronos warmed." || echo "[-] Kronos warming failed."
} || echo "[-] AlphaEar sidecar warning: not reachable at ${ALPHAEAR_URL}."

echo "=== Model Warming Complete ==="
