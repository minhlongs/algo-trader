/**
 * /manifesto route — renders docs/manifesto.md (copied to /public at build).
 * Polar-safe: manifesto content is authored Polar-safe (phase 01); this page
 * adds zero marketing copy.
 */
import { PublicNavbar } from '../components/public-navbar';
import { Footer } from '../components/footer';
import { MarkdownViewer } from '../components/markdown-viewer';

export function ManifestoPage() {
  return (
    <div className="min-h-screen bg-[#080B14] text-[#C9D1D9] font-sans flex flex-col">
      <PublicNavbar />
      <main className="flex-1 pt-20">
        <MarkdownViewer src="/manifesto.md" loadingLabel="Loading manifesto…" />
      </main>
      <Footer />
    </div>
  );
}
