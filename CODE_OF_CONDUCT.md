# Contributor Covenant Code of Conduct / Quy Tắc Ứng Xử Cộng Đồng

## 1. Our Pledge / Cam Kết Của Chúng Tôi

**English:** We as members, contributors, and maintainers of `@mekong/algo-trader` (`cashclaw`) pledge to make participation in our open-core quantitative trading community a harassment-free experience for everyone, regardless of age, body size, disability, ethnicity, gender identity and expression, level of experience, nationality, personal appearance, race, religion, or sexual identity and orientation.

**Tiếng Việt:** Chúng tôi — với tư cách là thành viên, người đóng góp và ban quản trị của dự án mã nguồn mở `@mekong/algo-trader` (`cashclaw`) — cam kết xây dựng một cộng đồng giao dịch định lượng văn minh, tôn trọng và không có hành vi quấy rối đối với bất kỳ ai.

## 2. Our Standards / Tiêu Chuẩn Hành Vi

Examples of behavior that contributes to a positive environment:
- Demonstrating empathy and kindness toward other quantitative developers and traders.
- Providing reproducible backtest evidence, Monte Carlo metrics, and clean TypeScript (`0 :any`, `< 200 LOC` per file).
- Respecting the Open-Core boundary: keeping `src/desk/`, `src/engine/`, and `src/commands/` MIT-licensed while respecting the commercial license of the hosted Cloud RaaS control plane (`src/raas/`, `src/billing/`).
- Never sharing or committing live exchange API keys, wallet seeds, or `.env` secrets in issues, discussions, or pull requests.

## 3. Unacceptable Behavior / Hành Vi Không Được Chấp Nhận

- Publishing others' private information, API keys, wallet seeds, or tenant credentials without explicit permission.
- Submitting malicious dependencies, backdoored trading strategies, or obfuscated execution hooks.
- Bypassing or stripping cryptographic `LicenseGate` (HMAC-SHA256) or `BillingMeter` (HTTP 402) guards in enterprise modules.
- Trolling, insulting, or derogatory comments, and personal or political attacks.

## 4. Enforcement / Thực Thi

Instances of abusive, harassing, or otherwise unacceptable behavior may be reported to the project maintainers via `security@agencyos.network`. All complaints will be reviewed and investigated promptly and fairly.

## 5. Attribution / Nguồn Tham Chiếu

Adapted from the [Contributor Covenant](https://www.contributor-covenant.org), version 2.1.
