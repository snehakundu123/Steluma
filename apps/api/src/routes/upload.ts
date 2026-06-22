import type { FastifyInstance } from 'fastify'
import { uploadImage } from '../services/ipfs.service.js'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

export async function uploadRoutes(app: FastifyInstance) {
  app.post('/image', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as any
    const data = await req.file()

    if (!data) {
      return reply.status(400).send({ error: { code: 'NO_FILE', message: 'No file provided' } })
    }

    if (!ALLOWED_TYPES.includes(data.mimetype)) {
      return reply.status(400).send({
        error: { code: 'INVALID_TYPE', message: `Allowed types: ${ALLOWED_TYPES.join(', ')}` },
      })
    }

    const chunks: Buffer[] = []
    for await (const chunk of data.file) {
      chunks.push(chunk)
    }
    const buffer = Buffer.concat(chunks)

    if (buffer.length > MAX_SIZE) {
      return reply.status(400).send({
        error: { code: 'FILE_TOO_LARGE', message: 'Max file size is 10MB' },
      })
    }

    try {
      const result = await uploadImage(buffer, data.filename, data.mimetype, user.sub)
      return reply.send(result)
    } catch (err: any) {
      return reply.status(500).send({ error: { code: 'UPLOAD_FAILED', message: err.message } })
    }
  })
}
