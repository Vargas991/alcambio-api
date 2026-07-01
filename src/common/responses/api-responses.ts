export interface ApiSuccessResponse<T> {
  success: true;
  message: string;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  message: string | string[];
  error: {
    statusCode: number;
    type: string;
    path: string;
    timestamp: string;
  };
}

export function successResponse<T>(
  data: T,
  message = 'Operación realizada correctamente.',
): ApiSuccessResponse<T> {
  return {
    success: true,
    message,
    data,
  };
}