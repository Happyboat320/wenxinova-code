import DypnsapiClient, {
  CheckSmsVerifyCodeRequest,
  SendSmsVerifyCodeRequest,
} from '@alicloud/dypnsapi20170525';
import { $OpenApiUtil } from '@alicloud/openapi-core';
import { RuntimeOptions } from '@darabonba/typescript';
import { AuthError } from './auth.types.js';

let client: DypnsapiClient | undefined;

function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new AuthError('短信服务暂不可用', 503, 'SMS_NOT_CONFIGURED');
  return value;
}

function getClient(): DypnsapiClient {
  if (client) return client;
  const config = new $OpenApiUtil.Config({
    accessKeyId: env('ALIBABA_CLOUD_ACCESS_KEY_ID'),
    accessKeySecret: env('ALIBABA_CLOUD_ACCESS_KEY_SECRET'),
    regionId: process.env.ALIYUN_DYPN_REGION_ID || 'cn-hangzhou',
    endpoint: process.env.ALIYUN_DYPN_ENDPOINT || 'dypnsapi.aliyuncs.com',
    connectTimeout: 5000,
    readTimeout: 8000,
  });
  client = new DypnsapiClient(config);
  return client;
}

const runtime = new RuntimeOptions({
  connectTimeout: 5000,
  readTimeout: 8000,
  autoretry: false,
  maxAttempts: 1,
});

export async function sendVerifyCode(phone: string): Promise<void> {
  try {
    const response = await getClient().sendSmsVerifyCodeWithOptions(
      new SendSmsVerifyCodeRequest({
        phoneNumber: phone,
        countryCode: '86',
        signName: env('ALIYUN_SMS_SIGN_NAME'),
        templateCode: env('ALIYUN_SMS_TEMPLATE_CODE'),
        templateParam: JSON.stringify({ code: '##code##' }),
        schemeName: process.env.ALIYUN_SMS_SCHEME_NAME || undefined,
        codeLength: 6,
        codeType: 1,
        interval: 60,
        validTime: 300,
        duplicatePolicy: 1,
        returnVerifyCode: false,
      }),
      runtime,
    );
    if (response.body?.code !== 'OK' || response.body.success === false) {
      throw new Error(`provider code: ${response.body?.code || 'UNKNOWN'}`);
    }
  } catch (error) {
    if (error instanceof AuthError) throw error;
    console.error('短信发送失败（已隐藏供应商响应）');
    throw new AuthError('验证码发送失败，请稍后重试', 502, 'SMS_SEND_FAILED');
  }
}

export async function checkVerifyCode(phone: string, code: string): Promise<boolean> {
  try {
    const response = await getClient().checkSmsVerifyCodeWithOptions(
      new CheckSmsVerifyCodeRequest({
        phoneNumber: phone,
        countryCode: '86',
        verifyCode: code,
        schemeName: process.env.ALIYUN_SMS_SCHEME_NAME || undefined,
        caseAuthPolicy: 2,
      }),
      runtime,
    );
    return response.body?.code === 'OK' && response.body.model?.verifyResult === 'PASS';
  } catch (error) {
    if (error instanceof AuthError) throw error;
    console.error('短信核验失败（已隐藏供应商响应）');
    throw new AuthError('验证码校验服务暂不可用', 502, 'SMS_VERIFY_FAILED');
  }
}

export function resetSmsClientForTests(): void {
  client = undefined;
}

