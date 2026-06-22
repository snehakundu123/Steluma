import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const organizers = [
  { wallet: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN', name: 'DevDAO', tier: 'TRUSTED' as const, score: 720, events: 15 },
  { wallet: 'GBVWZPMNZTAM5YRCF3GUZXFXZXF5JQKRQAXTOBZNM3YGXMTPBKMJGQF', name: 'TechHub', tier: 'VERIFIED' as const, score: 430, events: 6 },
  { wallet: 'GC7VGNPYXQWDXMRN4BXBHLXQVDXEXAMPLETHIRDORGANIZER1234567', name: 'CryptoConf', tier: 'NEW' as const, score: 100, events: 1 },
]

const eventTemplates = [
  {
    title: 'Stellar Summit 2025',
    description: 'The premier annual developer conference for the Stellar blockchain ecosystem. Three days of talks, workshops, and networking with the best minds in decentralized finance.',
    category: 'CONFERENCE' as const,
    locationCity: 'San Francisco',
    locationCountry: 'US',
    daysFromNow: 30,
    tiers: [
      { name: 'General Admission', price: 50, supply: 500, badge: 'ATTENDEE' as const },
      { name: 'VIP', price: 200, supply: 50, badge: 'VIP' as const },
      { name: 'Speaker', price: 0, supply: 20, badge: 'SPEAKER' as const },
    ],
  },
  {
    title: 'Web3 Builders Hackathon',
    description: '48-hour hackathon building the future of decentralized applications. $50,000 in prizes for the best projects.',
    category: 'HACKATHON' as const,
    locationCity: 'New York',
    locationCountry: 'US',
    daysFromNow: 14,
    tiers: [
      { name: 'Hacker Pass', price: 25, supply: 200, badge: 'ATTENDEE' as const },
      { name: 'Team Pass (4x)', price: 80, supply: 50, badge: 'ATTENDEE' as const },
    ],
  },
  {
    title: 'DeFi & Beyond: Workshop Series',
    description: 'Hands-on workshops covering DeFi fundamentals, smart contract development with Soroban, and cross-chain interoperability.',
    category: 'WORKSHOP' as const,
    locationCity: 'Austin',
    locationCountry: 'US',
    daysFromNow: 7,
    tiers: [
      { name: 'Workshop Access', price: 35, supply: 100, badge: 'ATTENDEE' as const },
    ],
  },
  {
    title: 'Crypto Networking Night',
    description: 'Monthly networking event for crypto founders, developers, and investors. Cocktails, demos, and conversations.',
    category: 'NETWORKING' as const,
    locationCity: 'Miami',
    locationCountry: 'US',
    daysFromNow: 10,
    tiers: [
      { name: 'General', price: 20, supply: 150, badge: 'ATTENDEE' as const },
      { name: 'Founder', price: 75, supply: 30, badge: 'VIP' as const },
    ],
  },
  {
    title: 'Blockchain for Enterprises Webinar',
    description: 'Virtual session exploring enterprise blockchain adoption, compliance, and integration strategies.',
    category: 'WEBINAR' as const,
    locationType: 'VIRTUAL' as const,
    daysFromNow: 5,
    tiers: [
      { name: 'Free Access', price: 0, supply: 1000, badge: 'ATTENDEE' as const },
      { name: 'Premium (with Q&A)', price: 15, supply: 100, badge: 'VIP' as const },
    ],
  },
]

async function main() {
  console.log('🌱 Seeding database...')

  // Create organizer users and profiles
  const createdOrganizers = []
  for (const org of organizers) {
    const user = await prisma.user.upsert({
      where: { walletAddress: org.wallet },
      create: {
        walletAddress: org.wallet,
        displayName: org.name,
        role: 'ORGANIZER',
        bio: `${org.name} — professional event organizer on the Stellar network`,
      },
      update: { displayName: org.name },
    })

    const profile = await prisma.organizerProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        walletAddress: org.wallet,
        organizationName: org.name,
        trustTier: org.tier,
        reputationScore: org.score,
        totalEventsHosted: org.events,
        successfulEvents: org.events,
        verificationStatus: org.tier !== 'NEW' ? 'VERIFIED' : 'UNVERIFIED',
      },
      update: { trustTier: org.tier, reputationScore: org.score },
    })

    createdOrganizers.push({ user, profile })
    console.log(`  ✅ Organizer: ${org.name}`)
  }

  // Create events
  for (let i = 0; i < eventTemplates.length; i++) {
    const template = eventTemplates[i]
    const organizer = createdOrganizers[i % createdOrganizers.length]
    const slug = template.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + (i + 1)

    const startsAt = new Date(Date.now() + template.daysFromNow * 24 * 60 * 60 * 1000)
    const endsAt = new Date(startsAt.getTime() + 8 * 60 * 60 * 1000)
    const totalTickets = template.tiers.reduce((s, t) => s + t.supply, 0)

    const existingEvent = await prisma.event.findUnique({ where: { slug } })
    if (existingEvent) {
      console.log(`  ⏭  Event exists: ${template.title}`)
      continue
    }

    const stakeRequired = Math.max(
      100,
      template.tiers.reduce((s, t) => s + t.price * t.supply, 0) * 0.1,
    )

    const event = await prisma.event.create({
      data: {
        slug,
        organizerId: organizer.profile.id,
        title: template.title,
        description: template.description,
        category: template.category,
        locationType: template.locationType ?? 'PHYSICAL',
        locationCity: template.locationCity,
        locationCountry: template.locationCountry,
        startsAt,
        endsAt,
        timezone: 'America/New_York',
        status: 'ACTIVE',
        visibility: 'PUBLIC',
        royaltyBps: 500,
        totalTickets,
        stakeRequired,
        trendingScore: Math.random() * 10,
        publishedAt: new Date(),
        ticketTiers: {
          create: template.tiers.map((t, j) => ({
            name: t.name,
            price: t.price,
            priceAsset: 'XLM',
            totalSupply: t.supply,
            sold: Math.floor(t.supply * Math.random() * 0.7),
            badgeType: t.badge,
            sortOrder: j,
            perks: t.name === 'VIP' ? ['Priority seating', 'Networking dinner', 'Exclusive swag'] : [],
          })),
        },
      },
    })

    console.log(`  ✅ Event: ${template.title}`)
  }

  console.log('\n✅ Seeding complete!')
  console.log(`   ${createdOrganizers.length} organizers`)
  console.log(`   ${eventTemplates.length} events`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
