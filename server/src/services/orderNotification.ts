import type { Order } from '../models/orderModel'
import type { ProductRepository } from '../repositories/productRepository'
import { env } from '../config/env'

export type OrderNotificationEvent = 'ORDER_CREATED'

export type AdminOrderNotification = {
  event: OrderNotificationEvent
  orderId: string
  message: string
  recipients: { email?: string; whatsapp?: string }
}

export interface WhatsAppProvider {
  send(notification: AdminOrderNotification): Promise<void>
}

export interface EmailProvider {
  send(notification: AdminOrderNotification): Promise<void>
}

export class DevelopmentWhatsAppProvider implements WhatsAppProvider {
  async send(notification: AdminOrderNotification) {
    if (env.NODE_ENV === 'production') {
      if (notification.recipients.whatsapp) {
        console.log(`[AdminOrderNotification] WhatsApp notification pending for order ${notification.orderId} (external provider unconfigured)`)
      }
      return
    }

    console.log(`[DevelopmentWhatsAppProvider] To: ${notification.recipients.whatsapp || '(not configured)'}\n${notification.message}`)
  }
}

export class ResendEmailProvider implements EmailProvider {
  async send(notification: AdminOrderNotification) {
    const recipient = notification.recipients.email?.trim()
    if (!recipient) throw new Error('ADMIN_NOTIFICATION_EMAIL is not configured')
    const apiKey = env.RESEND_API_KEY?.trim()
    if (!apiKey) throw new Error('RESEND_API_KEY is not configured')

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'onboarding@resend.dev',
        to: [recipient],
        subject: `New Raja Store order ${notification.orderId}`,
        text: notification.message,
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '')
      throw new Error(`Resend API error (${response.status}): ${errorBody || response.statusText}`)
    }

    console.log(`[ResendEmailProvider] Sent order notification for ${notification.orderId}`)
  }
}

export const GmailSmtpEmailProvider = ResendEmailProvider

export class OrderNotificationFormatter {
  constructor(private readonly products: ProductRepository) {}

  async format(order: Order): Promise<string> {
    const stock = await this.products.getStockSnapshot(order.items.map((item) => ({ productId: item.productId, variantId: item.variant?.id })))
    const products = order.items.map((item, index) => {
      const variant = item.variant ? `${item.variant.label}${Object.entries(item.variant.options).length ? ` (${Object.entries(item.variant.options).map(([key, value]) => `${key}: ${value}`).join(', ')})` : ''}` : 'None'
      const remaining = stock[`${item.productId}:${item.variant?.id ?? 'default'}`]
      return `${index + 1}. ${item.productNameSnapshot}\n   SKU: ${item.skuSnapshot}\n   Variant: ${variant}\n   Qty: ${item.quantity}\n   Price: ₹${item.unitPrice}\n   Subtotal: ₹${item.lineTotal}${remaining === undefined ? '' : `\n   Remaining stock: ${remaining}`}`
    }).join('\n\n')
    return `🛒 NEW RAJA STORE ORDER\n\nOrder ID: ${order.orderId}\nDate: ${order.createdAt}\n\nCUSTOMER\nName: ${order.customer.fullName}\nPhone: ${order.customer.phone}\nEmail: ${order.customer.email || 'Not provided'}\n\nDELIVERY\nAddress: ${order.customer.address}\n${order.customer.city}, ${order.customer.state}\nPincode: ${order.customer.pincode}\n\nPRODUCTS\n${products}\n\nPAYMENT\nMethod: ${order.payment.method}\nStatus: ${order.payment.status}\nUTR: ${order.payment.utrNumber || 'Not applicable'}\n\nTOTAL\nSubtotal: ₹${order.pricing.subtotal}\nDelivery: ₹${order.pricing.deliveryCharge}\nTOTAL: ₹${order.pricing.total}\n\nORDER STATUS\n${order.orderStatus}`
  }
}

export class AdminOrderNotificationService {
  constructor(private readonly formatter: OrderNotificationFormatter, private readonly whatsapp: WhatsAppProvider, private readonly email: EmailProvider) {}

  async notifyOrderCreated(
    order: Order,
    claim: () => Promise<boolean>,
    onSent?: () => Promise<void>,
    onFailed?: (error: unknown) => Promise<void>,
  ) {
    const claimed = await claim()
    if (!claimed) return
    try {
      const notification: AdminOrderNotification = {
        event: 'ORDER_CREATED',
        orderId: order.orderId,
        message: await this.formatter.format(order),
        recipients: {
          email: env.ADMIN_NOTIFICATION_EMAIL?.trim() || undefined,
          whatsapp: env.ADMIN_NOTIFICATION_WHATSAPP?.trim() || undefined,
        },
      }
      await Promise.all([this.whatsapp.send(notification), this.email.send(notification)])
      if (onSent) await onSent()
    } catch (error) {
      if (onFailed) {
        try {
          await onFailed(error)
        } catch (failError) {
          console.error(`[AdminOrderNotification] Failed to record failure state for ${order.orderId}:`, failError)
        }
      }
      this.logNotificationFailure(order.orderId, error)
    }
  }

  private logNotificationFailure(orderId: string, error: unknown) {
    const err = error as Record<string, unknown> | null
    const code = err?.code ?? 'UNKNOWN_ERROR'
    const command = err?.command ?? 'N/A'
    const responseCode = err?.responseCode ?? 'N/A'
    const message = error instanceof Error ? error.message : String(error)
    console.error(
      `[AdminOrderNotification] ORDER_CREATED notification failed for ${orderId}. ` +
      `Code: ${code}, Command/Phase: ${command}, ResponseCode: ${responseCode}, Reason: ${message}`,
    )
  }
}
