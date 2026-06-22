# Responsive Strategy

## Breakpoints

```
xs:  < 480px   — small phones
sm:  480–640px  — phones (primary mobile)
md:  640–768px  — large phones / small tablets
lg:  768–1024px — tablets / small laptops
xl:  1024–1280px — laptops
2xl: 1280–1536px — desktops
3xl: > 1536px   — large monitors
```

Tailwind defaults used: `sm(640) md(768) lg(1024) xl(1280) 2xl(1536)`

## Mobile-First Principles

1. Base styles target mobile (< 640px)
2. Complexity added upward with breakpoint prefixes
3. Touch targets minimum 44×44px
4. Bottom navigation on mobile, top nav on desktop
5. Sheets/drawers replace dropdowns on mobile
6. Full-screen overlays preferred on mobile

## Layout Strategy Per Page

### Landing Page
- Mobile: Single column, stacked sections
- Tablet: 2-col feature grid
- Desktop: Full hero with floating event cards

### Events Discovery
- Mobile: 1-col card grid, filter as bottom sheet
- Tablet: 2-col grid, inline filter bar
- Desktop: 3–4 col grid, sidebar filter

### Event Detail
- Mobile: Stacked (hero → info → sticky purchase bar at bottom)
- Desktop: 2-col (content left, sticky purchase panel right)

### Organizer Dashboard
- Mobile: Bottom nav, stack panels vertically
- Tablet: Collapsible sidebar + content
- Desktop: Fixed sidebar + main content area

### QR Scanner
- Mobile: Full-screen camera, overlay controls
- Desktop: Centered panel with camera feed

### Ticket Wallet
- Mobile: Card carousel or list
- Desktop: Grid layout

### Marketplace
- Mobile: 1-col list with price prominent
- Desktop: 3–4 col grid

## Navigation Strategy

### Desktop (≥ 1024px)
- Sticky top navbar with logo, links, search, user menu
- Dashboard: persistent left sidebar (240px)
- No bottom bar

### Tablet (768–1024px)
- Sticky top navbar (links hidden, hamburger)
- Dashboard: collapsible sidebar (icon-only collapsed)

### Mobile (< 768px)
- Sticky top navbar (logo + icons only)
- Bottom navigation bar (fixed, 5 items max):
  - Home / Explore / Create / My Tickets / Profile
- Dashboard uses bottom nav replacing sidebar

## Touch Interactions
- Swipe left/right on carousels
- Pull-to-refresh on event lists
- Long-press on ticket card → quick actions menu
- Swipe to dismiss notifications
- Pinch to zoom on event banner

## Typography Responsive Scale
```
Hero headline:   text-4xl sm:text-5xl lg:text-7xl
Section title:   text-2xl sm:text-3xl lg:text-4xl
Card title:      text-lg sm:text-xl
Body:            text-sm sm:text-base
```

## Image Strategy
- All event banners: Next.js Image with sizes prop
- Banners: `sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"`
- Hero images: `sizes="100vw"` with priority
- Avatar images: fixed pixel sizes

## Performance on Mobile
- No heavy animations on reduced-motion
- Defer non-critical components with dynamic imports
- Compress and WebP-format all images
- Socket.IO connection deferred until authenticated
