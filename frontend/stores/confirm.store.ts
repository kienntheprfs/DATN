import { create } from 'zustand';

interface ConfirmOptions {
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
  style?: 'rounded' | 'square';
}

interface ConfirmState {
  isOpen: boolean;
  options: ConfirmOptions;
  resolve: ((value: boolean) => void) | null;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  onConfirm: () => void;
  onCancel: () => void;
}

export const useConfirmStore = create<ConfirmState>((set) => ({
  isOpen: false,
  options: {
    title: '',
    description: '',
    confirmText: 'Xác nhận',
    cancelText: 'Hủy',
    variant: 'default',
    style: 'rounded',
  },
  resolve: null,

  confirm: (options) => {
    return new Promise((resolve) => {
      set({
        isOpen: true,
        options: {
          ...options,
          confirmText: options.confirmText || 'Xác nhận',
          cancelText: options.cancelText || 'Hủy',
          variant: options.variant || 'default',
          style: options.style || 'rounded',
        },
        resolve,
      });
    });
  },

  onConfirm: () => {
    set((state) => {
      if (state.resolve) state.resolve(true);
      return { isOpen: false, resolve: null };
    });
  },

  onCancel: () => {
    set((state) => {
      if (state.resolve) state.resolve(false);
      return { isOpen: false, resolve: null };
    });
  },
}));
