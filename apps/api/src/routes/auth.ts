import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as AuthService from '../services/auth.service.js'
import { prisma } from '../lib/prisma.js'

const challengeSchema = z.object({
  walletAddress: z.string().regex(/^G[A-Z2-7]{55}$/, 'Invalid Stellar address'),
})

const verifySchema = z.object({
  walletAddress: z.string().regex(/^G[A-Z2-7]{55}$/),
  signedXdr: z.string().min(1),
  nonce: z.string().min(1),
})

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
})

export async function authRoutes(app: FastifyInstance) {
  app.post('/challenge', async (req, reply) => {
    const { walletAddress } = challengeSchema.parse(req.body)
    const result = await AuthService.createChallenge(walletAddress)
    return reply.send(result)
  })

  app.post('/verify', async (req, reply) => {
    const { walletAddress, signedXdr, nonce } = verifySchema.parse(req.body)
    const ipAddress = req.ip

    try {
      const tokens = await AuthService.verifySignature(walletAddress, signedXdr, nonce, ipAddress)
      const user = await prisma.user.findUnique({
        where: { walletAddress },
        include: { organizerProfile: true },
      })

      return reply.send({
        ...tokens,
        user: { ...user, isNewUser: tokens.isNewUser },
      })
    } catch (err: any) {
      const code = err.message || 'AUTH_FAILED'
      return reply.status(401).send({ error: { code, message: 'Authentication failed' } })
    }
  })

  app.post('/refresh', async (req, reply) => {
    const { refreshToken } = refreshSchema.parse(req.body)
    try {
      const tokens = await AuthService.refreshTokens(refreshToken)
      return reply.send({ ...tokens, expiresIn: 900 })
    } catch {
      return reply.status(401).send({ error: { code: 'INVALID_REFRESH_TOKEN', message: 'Token invalid or expired' } })
    }
  })

  app.delete('/logout', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as any
    await AuthService.revokeSession(user.jti)
    return reply.status(204).send()
  })
}
