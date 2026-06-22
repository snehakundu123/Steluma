import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { env } from '../config/env.js'
import { logger } from '../lib/logger.js'
import { prisma } from '../lib/prisma.js'

const PINATA_API = 'https://api.pinata.cloud'

export interface UploadResult {
  cid: string
  url: string
  sizeBytes: number
}

async function pinataPin(formData: FormData): Promise<{ IpfsHash: string; PinSize: number }> {
  const res = await fetch(`${PINATA_API}/pinning/pinFileToIPFS`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.PINATA_JWT}` },
    body: formData,
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Pinata error ${res.status}: ${err}`)
  }
  return res.json() as Promise<{ IpfsHash: string; PinSize: number }>
}

async function pinataJson(json: Record<string, unknown>, name: string): Promise<{ IpfsHash: string }> {
  const res = await fetch(`${PINATA_API}/pinning/pinJSONToIPFS`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.PINATA_JWT}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ pinataContent: json, pinataMetadata: { name } }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Pinata JSON error ${res.status}: ${err}`)
  }
  return res.json() as Promise<{ IpfsHash: string }>
}

export async function uploadImage(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  uploadedBy: string,
): Promise<UploadResult> {
  const sizeBytes = buffer.length

  if (env.PINATA_JWT) {
    // Real Pinata upload
    const form = new FormData()
    const blob = new Blob([buffer], { type: mimeType })
    form.append('file', blob, filename)
    form.append('pinataMetadata', JSON.stringify({ name: filename }))
    form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }))

    const result = await pinataPin(form)
    const cid = result.IpfsHash

    await prisma.ipfsAsset.upsert({
      where: { cid },
      create: { cid, filename, mimeType, sizeBytes, pinStatus: 'pinned', uploadedBy },
      update: { pinStatus: 'pinned' },
    }).catch(() => {})

    return { cid, url: `${env.IPFS_GATEWAY}/${cid}`, sizeBytes }
  }

  // Dev fallback: deterministic CID from content hash
  const hash = crypto.createHash('sha256').update(buffer).digest('hex')
  const fakeCid = `Qm${hash.slice(0, 44)}`
  logger.warn('[IPFS] No Pinata JWT — using fake CID for dev', { filename, fakeCid })
  return { cid: fakeCid, url: `${env.IPFS_GATEWAY}/${fakeCid}`, sizeBytes }
}

export async function uploadJson(
  json: Record<string, unknown>,
  name: string,
): Promise<UploadResult> {
  const content = JSON.stringify(json)
  const sizeBytes = Buffer.byteLength(content)

  if (env.PINATA_JWT) {
    const result = await pinataJson(json, name)
    const cid = result.IpfsHash
    await prisma.ipfsAsset.upsert({
      where: { cid },
      create: { cid, filename: `${name}.json`, mimeType: 'application/json', sizeBytes, pinStatus: 'pinned' },
      update: { pinStatus: 'pinned' },
    }).catch(() => {})
    return { cid, url: `${env.IPFS_GATEWAY}/${cid}`, sizeBytes }
  }

  const hash = crypto.createHash('sha256').update(content).digest('hex')
  const fakeCid = `Qm${hash.slice(0, 44)}`
  return { cid: fakeCid, url: `${env.IPFS_GATEWAY}/${fakeCid}`, sizeBytes }
}

export async function buildTicketMetadata(
  eventTitle: string,
  tierName: string,
  ticketNumber: number,
  ownerWallet: string,
  eventId: string,
  ticketId: string,
): Promise<UploadResult> {
  const metadata = {
    name: `${eventTitle} — ${tierName} #${ticketNumber}`,
    description: `Ticket #${ticketNumber} for ${eventTitle}`,
    image: `${env.IPFS_GATEWAY}/QmDefaultTicketImage`,
    attributes: [
      { trait_type: 'Event ID', value: eventId },
      { trait_type: 'Tier', value: tierName },
      { trait_type: 'Ticket Number', value: ticketNumber },
      { trait_type: 'Owner', value: ownerWallet },
      { trait_type: 'Status', value: 'active' },
    ],
    event_id: eventId,
    ticket_id: ticketId,
  }
  return uploadJson(metadata, `ticket-${ticketId}`)
}

export async function buildBadgeMetadata(
  eventTitle: string,
  eventDate: string,
  badgeType: string,
  ownerWallet: string,
  eventId: string,
): Promise<UploadResult> {
  const metadata = {
    name: `${eventTitle} — ${badgeType} Badge`,
    description: `Attendance badge for ${eventTitle}`,
    image: `${env.IPFS_GATEWAY}/QmDefaultBadgeImage`,
    attributes: [
      { trait_type: 'Event', value: eventTitle },
      { trait_type: 'Date', value: eventDate },
      { trait_type: 'Role', value: badgeType },
      { trait_type: 'Soulbound', value: true },
    ],
    soulbound: true,
    event_id: eventId,
    owner: ownerWallet,
  }
  return uploadJson(metadata, `badge-${eventId}-${badgeType}`)
}
