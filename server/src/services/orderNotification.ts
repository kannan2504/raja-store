import nodemailer from 'nodemailer'
import type { Order } from '../models/orderModel'
import type { ProductRepository } from '../repositories/productRepository'
import { env } from '../config/env'

export type OrderNotificationEvent = 'ORDER_CREATED'

export type AdminOrderNotification = {
  event: OrderNotificationEvent
  orderId: string
  message: string
  recipients: {
    email?: string
    whatsapp?: string
  }
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
        console.log(
          `[AdminOrderNotification] WhatsApp notification pending for order ${notification.orderId} (external provider unconfigured)`,
        )
      }
      return
    }

    console.log(
      `[DevelopmentWhatsAppProvider] To: ${
        notification.recipients.whatsapp || '(not configured)'
      }\n${notification.message}`,
    )
  }
}

/**
 * Sends Raja Store order notifications through Gmail SMTP.
 *
 * Required environment variables:
 * GMAIL_SMTP_USER
 * GMAIL_SMTP_APP_PASSWORD
 * ADMIN_NOTIFICATION_EMAIL
 */
export class GmailSmtpEmailProvider implements EmailProvider {
private transporter: ReturnType<typeof nodemailer.createTransport> | undefined
  private getTransporter() {
    if (this.transporter) {
      return this.transporter
    }

    const user = env.GMAIL_SMTP_USER?.trim()
    const appPassword = env.GMAIL_SMTP_APP_PASSWORD?.trim()

    if (!user) {
      throw new Error('GMAIL_SMTP_USER is not configured')
    }

    if (!appPassword) {
      throw new Error('GMAIL_SMTP_APP_PASSWORD is not configured')
    }

    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user,
        pass: appPassword,
      },
    })

    return this.transporter
  }

  async send(notification: AdminOrderNotification) {
    const recipient = notification.recipients.email?.trim()
    const user = env.GMAIL_SMTP_USER?.trim()

    if (!recipient) {
      throw new Error('ADMIN_NOTIFICATION_EMAIL is not configured')
    }

    if (!user) {
      throw new Error('GMAIL_SMTP_USER is not configured')
    }

    const transporter = this.getTransporter()

    await transporter.sendMail({
      from: `"Raja Store" <${user}>`,
      to: recipient,
      subject: `New Raja Store order ${notification.orderId}`,
      text: notification.message,
    })

    console.log(
      `[GmailSmtpEmailProvider] Sent order notification for ${notification.orderId}`,
    )
  }
}

export class OrderNotificationFormatter {
  constructor(private readonly products: ProductRepository) {}

  async format(order: Order): Promise<string> {
    const stock = await this.products.getStockSnapshot(
      order.items.map((item) => ({
        productId: item.productId,
        variantId: item.variant?.id,
      })),
    )

    const products = order.items
      .map((item, index) => {
        const variant = item.variant
          ? `${item.variant.label}${
              Object.entries(item.variant.options).length
                ? ` (${Object.entries(item.variant.options)
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(', ')})`
                : ''
            }`
          : 'None'

        const remaining =
          stock[`${item.productId}:${item.variant?.id ?? 'default'}`]

        return `${index + 1}. ${item.productNameSnapshot}
   SKU: ${item.skuSnapshot}
   Variant: ${variant}
   Qty: ${item.quantity}
   Price: ₹${item.unitPrice}
   Subtotal: ₹${item.lineTotal}${
          remaining === undefined
            ? ''
            : `\n   Remaining stock: ${remaining}`
        }`
      })
      .join('\n\n')

    return `🛒 NEW RAJA STORE ORDER

Order ID: ${order.orderId}
Date: ${order.createdAt}

CUSTOMER
Name: ${order.customer.fullName}
Phone: ${order.customer.phone}
Email: ${order.customer.email || 'Not provided'}

DELIVERY
Address: ${order.customer.address}
${order.customer.city}, ${order.customer.state}
Pincode: ${order.customer.pincode}

PRODUCTS
${products}

PAYMENT
Method: ${order.payment.method}
Status: ${order.payment.status}
UTR: ${order.payment.utrNumber || 'Not applicable'}

TOTAL
Subtotal: ₹${order.pricing.subtotal}
Delivery: ₹${order.pricing.deliveryCharge}
TOTAL: ₹${order.pricing.total}

ORDER STATUS
${order.orderStatus}`
  }
}

export class AdminOrderNotificationService {
  constructor(
    private readonly formatter: OrderNotificationFormatter,
    private readonly whatsapp: WhatsAppProvider,
    private readonly email: EmailProvider,
  ) {}

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
          whatsapp:
            env.ADMIN_NOTIFICATION_WHATSAPP?.trim() || undefined,
        },
      }

      await Promise.all([
        this.whatsapp.send(notification),
        this.email.send(notification),
      ])

      if (onSent) {
        await onSent()
      }
    } catch (error) {
      if (onFailed) {
        try {
          await onFailed(error)
        } catch (failError) {
          console.error(
            `[AdminOrderNotification] Failed to record failure state for ${order.orderId}:`,
            failError,
          )
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
    const message =
      error instanceof Error ? error.message : String(error)

    console.error(
      `[AdminOrderNotification] ORDER_CREATED notification failed for ${orderId}. ` +
        `Code: ${code}, Command/Phase: ${command}, ResponseCode: ${responseCode}, Reason: ${message}`,
    )
  }
}