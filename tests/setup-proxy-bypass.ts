import { setGlobalDispatcher, Agent } from 'undici';

// Ensure undici fetch bypasses any system or environment proxy
setGlobalDispatcher(new Agent({
  keepAliveTimeout: 1000,
  keepAliveMaxTimeout: 2000,
}));

// Unset all proxy environment variables to prevent http/https/superagent/undici
// from routing requests through Cloudflare WARP SOCKS proxy (127.0.0.1:1080)
delete process.env.HTTP_PROXY;
delete process.env.HTTPS_PROXY;
delete process.env.ALL_PROXY;
delete process.env.http_proxy;
delete process.env.https_proxy;
delete process.env.all_proxy;
process.env.NO_PROXY = '*';
process.env.no_proxy = '*';
