import { useState, useCallback } from "react";
import { InsufficientGasError } from "@/features/blockchain/services/blockchain";

/**
 * Hook that provides gas error state management for any page/component
 * that performs blockchain transactions.
 * 
 * Usage:
 * ```tsx
 * const { gasError, showGasError, clearGasError, handleGasError } = useGasGuard();
 * 
 * // In your try/catch:
 * catch (err) {
 *   if (handleGasError(err)) return; // shows modal, stops execution
 *   // handle other errors...
 * }
 * 
 * // In your JSX:
 * <InsufficientGasModal open={gasError.open} onClose={clearGasError} message={gasError.message} />
 * ```
 */
export function useGasGuard() {
  const [gasError, setGasError] = useState<{ open: boolean; message: string }>({
    open: false,
    message: "",
  });

  const showGasError = useCallback((message: string) => {
    setGasError({ open: true, message });
  }, []);

  const clearGasError = useCallback(() => {
    setGasError({ open: false, message: "" });
  }, []);

  /**
   * Checks if an error is a gas-related error.
   * If yes, shows the modal and returns true (caller should stop execution).
   * If no, returns false (caller should handle the error normally).
   */
  const handleGasError = useCallback(
    (err: unknown): boolean => {
      // Direct InsufficientGasError
      if (err instanceof InsufficientGasError) {
        showGasError(err.details);
        return true;
      }

      // Axios error response from backend
      const axiosMsg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      if (axiosMsg?.includes("INSUFFICIENT_GAS")) {
        showGasError(axiosMsg);
        return true;
      }

      // Direct message check
      const directMsg = (err as { message?: string })?.message || String(err);
      if (
        directMsg.includes("INSUFFICIENT_GAS") ||
        directMsg.toLowerCase().includes("insufficient funds for gas") ||
        directMsg.toLowerCase().includes("insufficient funds for intrinsic transaction cost")
      ) {
        showGasError(directMsg);
        return true;
      }

      return false;
    },
    [showGasError]
  );

  return {
    gasError,
    showGasError,
    clearGasError,
    handleGasError,
  };
}
