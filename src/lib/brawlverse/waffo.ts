/**
 * Waffo Pancake 支付:经由官方 @waffo/pancake-ts SDK(RSA-SHA256 签名与 webhook
 * 验签均由 SDK 处理)。对外接口与旧版手写实现保持一致,调用方无需改动。
 */
import {
  WaffoPancake,
  verifyWebhook as sdkVerifyWebhook,
} from '@waffo/pancake-ts';

const PRODUCT_ENV: Record<string, string> = {
  ringside: 'NEXT_PUBLIC_WAFFO_PRODUCT_RINGSIDE',
  booker: 'NEXT_PUBLIC_WAFFO_PRODUCT_BOOKER',
  promoter: 'NEXT_PUBLIC_WAFFO_PRODUCT_PROMOTER',
  annual: 'NEXT_PUBLIC_WAFFO_PRODUCT_ANNUAL',
};

export function waffoConfigured(): boolean {
  return Boolean(
    process.env.WAFFO_MERCHANT_ID && process.env.WAFFO_PRIVATE_KEY
  );
}

export function productId(tier: string): string {
  return process.env[PRODUCT_ENV[tier] || ''] || '';
}

function pancake(): WaffoPancake {
  const merchantId = process.env.WAFFO_MERCHANT_ID || '';
  // PEM 在环境变量里存的是转义后的 \n,这里还原成真换行
  const privateKey = (process.env.WAFFO_PRIVATE_KEY || '').replace(
    /\\n/g,
    '\n'
  );
  if (!merchantId) throw new Error('WAFFO_MERCHANT_ID not set');
  if (!privateKey) throw new Error('WAFFO_PRIVATE_KEY not set');
  return new WaffoPancake({ merchantId, privateKey });
}

export async function createCheckoutSession(
  product: string,
  metadata: Record<string, string>,
  successUrl: string
): Promise<string> {
  // 不传 productType:Waffo 服务端按 productId 自推商品类型
  // (一次性商品传 'subscription' 会被拒)
  const res = await pancake().checkout.createSession({
    productId: product,
    currency: 'USD',
    metadata,
    successUrl,
  });
  const url: string = res.checkoutUrl || '';
  if (!url)
    throw new Error(
      'no checkoutUrl in response: ' + JSON.stringify(res).slice(0, 200)
    );
  return url;
}

/**
 * 校验 x-waffo-signature,返回事件对象;失败抛错。
 * 注意:不在此处做环境过滤——调用方(webhooks/route.ts)按 WAFFO_ENV
 * 自行忽略 test 环境事件,行为与旧版一致。
 */
export function verifyWebhook(
  payload: string,
  sigHeader: string,
  toleranceMs = 300000
): any {
  return sdkVerifyWebhook(payload, sigHeader, { toleranceMs });
}
