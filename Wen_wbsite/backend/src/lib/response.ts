// 统一响应格式工具函数

export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data?: T;
  error?: { message: string };
}

export function success<T>(data: T, message = 'success'): ApiResponse<T> {
  return {
    code: 0,
    message,
    data,
  };
}

export function error(message: string, code = 500): ApiResponse<never> {
  return {
    code,
    message,
    error: { message },
  };
}

export function paginated<T>(
  list: T[],
  total: number,
  page: number,
  pageSize: number,
  message = 'success'
): ApiResponse<{ list: T[]; total: number; page: number; pageSize: number }> {
  return {
    code: 0,
    message,
    data: {
      list,
      total,
      page,
      pageSize,
    },
  };
}
