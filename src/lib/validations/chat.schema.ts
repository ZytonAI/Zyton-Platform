import { z } from "zod";

// ── Envío de mensajes desde la UI ──

export const sendMessageSchema = z.object({
  conversation_id: z.string().uuid("conversation_id inválido"),
  body: z.string().min(1, "El mensaje no puede estar vacío").max(65536),
  // Reintento de un mensaje fallido: actualiza esa fila en vez de crear una nueva
  retry_message_id: z.string().uuid().optional(),
});

export const sendFileSchema = z.object({
  conversation_id: z.string().uuid("conversation_id inválido"),
  attachment_id: z.string().uuid("attachment_id inválido"),
  retry_message_id: z.string().uuid().optional(),
});

// ── Webhook del bridge de WhatsApp ──
// Retro-compatible: si no viene `type`, se asume "message" (formato original del bridge).

const webhookMessageSchema = z.object({
  type: z.literal("message").optional(),
  wa_chat_id: z.string().min(1),
  wa_message_id: z.string().min(1),
  // body es opcional cuando el mensaje trae media (imagen/audio/video/documento)
  body: z.string().optional(),
  contact_phone: z.string().optional(),
  // Contactos con identificador @lid (privacidad activada / cuentas de negocio)
  // no siempre traen nombre visible — el bridge manda null explícito en ese caso.
  contact_name: z.string().nullable().optional(),
  timestamp: z.string().optional(),
  // Media entrante en base64 (cap ~3 MB crudo → ~4 MB en base64, límite de body de Vercel)
  media_base64: z.string().max(4_500_000, "Media demasiado grande").optional(),
  media_mime: z.string().optional(),
  media_filename: z.string().optional(),
  // Número conectado de la sesión (solo dígitos) — para resolver el owner correcto
  session_phone: z.string().optional(),
});

const webhookAckSchema = z.object({
  type: z.literal("ack"),
  wa_message_id: z.string().min(1),
  status: z.enum(["delivered", "read", "failed"]),
  session_phone: z.string().optional(),
});

export const webhookPayloadSchema = z.union([webhookAckSchema, webhookMessageSchema]);

export type WebhookMessagePayload = z.infer<typeof webhookMessageSchema>;
export type WebhookAckPayload = z.infer<typeof webhookAckSchema>;
export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;
