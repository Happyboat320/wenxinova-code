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

interface ProviderDiagnostic {
  code?: string;
  message?: string;
  requestId?: string;
}

function providerDiagnostic(caught: unknown): ProviderDiagnostic {
  if (!caught || typeof caught !== 'object') return {};
  const value = caught as Record<string, unknown>;
  const data = value.data && typeof value.data === 'object' ? value.data as Record<string, unknown> : undefined;
  return {
    code: String(value.code || data?.Code || data?.code || 'UNKNOWN'),
    message: String(value.message || data?.Message || data?.message || 'Unknown provider error')
      .replace(/1[3-9]\d{9}/g, '<手机号已隐藏>')
      .slice(0, 300),
    requestId: String(value.requestId || data?.RequestId || data?.requestId || ''),
  };
}

function providerError(diagnostic: ProviderDiagnostic): AuthError {
  const code = diagnostic.code?.toUpperCase() || '';
  if (code.includes('ACCESSKEY') || code.includes('SIGNATURE')) {
    return new AuthError('短信服务认证配置错误，请联系管理员', 503, 'SMS_CREDENTIALS_INVALID');
  }
  if (code.includes('TEMPLATE')) {
    return new AuthError('短信模板配置错误或尚未审核通过，请联系管理员', 503, 'SMS_TEMPLATE_INVALID');
  }
  if (code.includes('SIGN_NAME') || code.includes('SIGNATURE_NOT_MATCH')) {
    return new AuthError('短信签名配置错误或尚未审核通过，请联系管理员', 503, 'SMS_SIGN_INVALID');
  }
  if (code.includes('FORBIDDEN') || code.includes('PERMISSION') || code.includes('RAM')) {
    return new AuthError('短信服务账号缺少发送权限，请联系管理员', 503, 'SMS_PERMISSION_DENIED');
  }
  return new AuthError('验证码发送失败，请稍后重试', 502, 'SMS_SEND_FAILED');
}

function reportFailure(action: '发送' | '核验', diagnostic: ProviderDiagnostic): void {
  console.error(`短信${action}失败`, {
    providerCode: diagnostic.code || 'UNKNOWN',
    providerMessage: diagnostic.message || 'Unknown provider error',
    requestId: diagnostic.requestId || undefined,
  });
}

export async function sendVerifyCode(phone: string): Promise<void> {
  try {
    const templateCode = env('ALIYUN_SMS_TEMPLATE_CODE');
    const templateParam = templateCode === '100001'
      ? { code: '##code##', min: '5' }
      : { code: '##code##' };
    const response = await getClient().sendSmsVerifyCodeWithOptions(
      new SendSmsVerifyCodeRequest({
        phoneNumber: phone,
        countryCode: '86',
        signName: env('ALIYUN_SMS_SIGN_NAME'),
        templateCode,
        // 系统模板 100001 同时包含 ${code} 与 ${min}，参数必须与模板变量完全匹配。
        templateParam: JSON.stringify(templateParam),
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
      const diagnostic = {
        code: response.body?.code,
        message: response.body?.message,
        requestId: response.body?.requestId || response.body?.model?.requestId,
      };
      reportFailure('发送', diagnostic);
      throw providerError(diagnostic);
    }
  } catch (caught) {
    if (caught instanceof AuthError) throw caught;
    const diagnostic = providerDiagnostic(caught);
    reportFailure('发送', diagnostic);
    throw providerError(diagnostic);
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
  } catch (caught) {
    if (caught instanceof AuthError) throw caught;
    reportFailure('核验', providerDiagnostic(caught));
    throw new AuthError('验证码校验服务暂不可用', 502, 'SMS_VERIFY_FAILED');
  }
}

export function resetSmsClientForTests(): void {
  client = undefined;
}
