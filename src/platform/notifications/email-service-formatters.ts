/**
 * Email Service Formatters
 * Generates plain text and HTML email bodies for threshold alerts.
 */

import {
  getActionMessage,
  generateProgressBar,
} from './alert-formatter';

export function generatePlainTextBody(
  licenseKey: string,
  threshold: number,
  currentUsage: number,
  dailyLimit: number,
  percentUsed: number,
  urgency: string
): string {
  const actionMessage = getActionMessage(threshold);

  return `
USAGE THRESHOLD ALERT [${urgency}]

License Key: ${licenseKey}
Threshold Reached: ${threshold}%
Current Usage: ${currentUsage.toLocaleString()} calls
Daily Limit: ${dailyLimit.toLocaleString()} calls
Percent Used: ${percentUsed.toFixed(1)}%
Time: ${new Date().toISOString()}

${actionMessage}

Please review your usage and consider upgrading your tier if needed.

---
Algo Trader Alert System
  `.trim();
}

export function generateHtmlBody(
  licenseKey: string,
  threshold: number,
  currentUsage: number,
  dailyLimit: number,
  percentUsed: number,
  urgency: string,
  urgencyColor: string
): string {
  const actionMessage = getActionMessage(threshold);
  const _progressBar = generateProgressBar(percentUsed);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: ${urgencyColor}; color: white; padding: 15px; border-radius: 5px 5px 0 0; }
    .content { background: #f8f9fa; padding: 20px; border: 1px solid #dee2e6; }
    .metric { margin: 10px 0; padding: 10px; background: white; border-radius: 5px; }
    .metric-label { font-weight: bold; color: #6c757d; }
    .metric-value { font-size: 1.2em; color: #212529; }
    .progress-bar { background: #e9ecef; border-radius: 10px; overflow: hidden; margin: 15px 0; }
    .progress-fill { background: ${urgencyColor}; height: 20px; transition: width 0.3s; }
    .action { background: #fff3cd; border-left: 4px solid ${urgencyColor}; padding: 15px; margin: 15px 0; }
    .footer { text-align: center; color: #6c757d; font-size: 0.9em; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0;">${urgency} - Usage Threshold Alert</h2>
    </div>
    <div class="content">
      <div class="metric">
        <div class="metric-label">License Key</div>
        <div class="metric-value">${licenseKey}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Threshold Reached</div>
        <div class="metric-value">${threshold}%</div>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${Math.min(percentUsed, 100)}%;"></div>
      </div>
      <div class="metric">
        <div class="metric-label">Current Usage</div>
        <div class="metric-value">${currentUsage.toLocaleString()} / ${dailyLimit.toLocaleString()} calls</div>
      </div>
      <div class="metric">
        <div class="metric-label">Percent Used</div>
        <div class="metric-value">${percentUsed.toFixed(1)}%</div>
      </div>
      <div class="action">
        <strong>Action Required:</strong><br>
        ${actionMessage}
      </div>
      <p>Please review your usage and consider upgrading your tier if needed.</p>
    </div>
    <div class="footer">
      Algo Trader Alert System &copy; ${new Date().getFullYear()}
    </div>
  </div>
</body>
</html>
  `.trim();
}
