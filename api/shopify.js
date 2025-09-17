export default function handler(req, res) {
  res.status(200).json({ msg: "ok" });
}
import crypto from "crypto";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST requests allowed" });
  }

  try {
    const shopifySecret = process.env.SHOPIFY_WEBHOOK_SECRET; // Shopify webhook secret
    const wecomWebhook = process.env.WECOM_WEBHOOK;           // 企业微信机器人 webhook

    const rawBody = JSON.stringify(req.body); // 注意：要确保 Vercel 没有自动解析破坏原始 body
    const shopifyHmac = req.headers["x-shopify-hmac-sha256"];
    const shopifyTopic = req.headers["x-shopify-topic"];

    // ✅ HMAC 校验
    if (shopifySecret && shopifyHmac) {
      const computedHmac = crypto
        .createHmac("sha256", shopifySecret)
        .update(rawBody, "utf8")
        .digest("base64");

      if (
        !crypto.timingSafeEqual(
          Buffer.from(shopifyHmac, "base64"),
          Buffer.from(computedHmac, "base64")
        )
      ) {
        return res.status(401).json({ error: "Invalid HMAC - not from Shopify" });
      }
    }

    const data = req.body;

    // ✅ 简单提取订单信息
    const orderInfo = {
      orderNumber: data.order_number || data.name,
      totalPrice: data.total_price || data.current_total_price,
      currency: data.currency,
      customerName: data.customer?.first_name + " " + data.customer?.last_name,
      email: data.customer?.email,
      createdAt: data.created_at,
      paymentStatus: data.financial_status,
      fulfillmentStatus: data.fulfillment_status,
    };

    // ✅ 格式化企业微信消息（以 markdown 为例）
    const wecomPayload = {
      msgtype: "markdown",
      markdown: {
        content: `# 🛍️ 新订单通知
- **订单号**: #${orderInfo.orderNumber}
- **金额**: ${orderInfo.currency} ${orderInfo.totalPrice}
- **支付状态**: ${orderInfo.paymentStatus}
- **履行状态**: ${orderInfo.fulfillmentStatus}
- **客户**: ${orderInfo.customerName} (${orderInfo.email})
- **创建时间**: ${orderInfo.createdAt}`
      }
    };

    // ✅ 发送到企业微信机器人
    await fetch(wecomWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(wecomPayload),
    });

    return res.status(200).json({ success: true, orderInfo });
  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({ error: err.message });
  }
}

