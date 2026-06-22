import Link from 'next/link'

const links = {
  Platform: [
    { label: 'Browse Events', href: '/events' },
    { label: 'Marketplace', href: '/marketplace' },
    { label: 'For Organizers', href: '/events/create' },
    { label: 'Leaderboard', href: '/leaderboard' },
  ],
  Resources: [
    { label: 'Documentation', href: '/docs' },
    { label: 'API Reference', href: '/docs/api' },
    { label: 'Stellar Network', href: 'https://stellar.org', external: true },
    { label: 'Freighter Wallet', href: 'https://freighter.app', external: true },
  ],
  Company: [
    { label: 'About', href: '/about' },
    { label: 'Blog', href: '/blog' },
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms of Service', href: '/terms' },
  ],
}

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface-subtle">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-5">
          {/* Brand */}
          <div className="lg:col-span-2">
            <Link href="/" className="inline-flex items-center gap-2.5 group">
              <div className="h-8 w-8 rounded-xl bg-gradient-brand shadow-violet" />
              <span className="text-lg font-bold tracking-tight">Steluma</span>
            </Link>
            <p className="mt-4 max-w-xs text-sm text-muted-foreground leading-relaxed">
              The next-generation event platform. NFT tickets, organizer accountability,
              and attendance badges — powered by Stellar blockchain.
            </p>
            <div className="mt-6 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                <span className="live-dot" />
                Stellar Testnet
              </span>
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(links).map(([group, items]) => (
            <div key={group}>
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group}
              </h3>
              <ul className="space-y-3">
                {items.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      target={'external' in item && item.external ? '_blank' : undefined}
                      rel={'external' in item && item.external ? 'noopener noreferrer' : undefined}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Steluma. Built with ♥ on Stellar.
          </p>
          <div className="flex items-center gap-4">
            <a
              href="https://twitter.com/steluma"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Twitter
            </a>
            <a
              href="https://github.com/steluma"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://discord.gg/steluma"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Discord
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
